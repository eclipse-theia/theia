// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    TasksMain,
    MAIN_RPC_CONTEXT,
    TaskExecutionDto,
    TasksExt,
    TaskDto,
    TaskPresentationOptionsDTO
} from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import { TaskProviderRegistry, TaskResolverRegistry, TaskProvider, TaskResolver } from '@theia/task/lib/browser/task-contribution';
import { interfaces } from '@theia/core/shared/inversify';
import { TaskInfo, TaskExitedEvent, TaskConfiguration, TaskOutputPresentation, RevealKind, PanelKind } from '@theia/task/lib/common/task-protocol';
import { TaskWatcher } from '@theia/task/lib/common/task-watcher';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskDefinitionRegistry } from '@theia/task/lib/browser';

const revealKindMap = new Map<number | RevealKind, RevealKind | number>(
    [
        [1, RevealKind.Always],
        [2, RevealKind.Silent],
        [3, RevealKind.Never],
        [RevealKind.Always, 1],
        [RevealKind.Silent, 2],
        [RevealKind.Never, 3]
    ]
);

const panelKindMap = new Map<number | PanelKind, PanelKind | number>(
    [
        [1, PanelKind.Shared],
        [2, PanelKind.Dedicated],
        [3, PanelKind.New],
        [PanelKind.Shared, 1],
        [PanelKind.Dedicated, 2],
        [PanelKind.New, 3]
    ]
);

export class TasksMainImpl implements TasksMain, Disposable {
    private readonly proxy: TasksExt;
    private readonly taskProviderRegistry: TaskProviderRegistry;
    private readonly taskResolverRegistry: TaskResolverRegistry;
    private readonly taskWatcher: TaskWatcher;
    private readonly taskService: TaskService;
    private readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    private readonly taskProviders = new Map<number, Disposable>();
    /** The tasks that plugins requested to run with `$executeTask`, by request id, until `runTask` settles for them. */
    private readonly pendingExecuteRequests = new Map<number, TaskConfiguration>();
    /** The started tasks that may have been started by a pending request, by task id, with the events for them that are held until it is known. */
    private readonly heldTaskEvents = new Map<number, { info: TaskInfo, events: (() => void)[] }>();
    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TASKS_EXT);
        this.taskProviderRegistry = container.get(TaskProviderRegistry);
        this.taskResolverRegistry = container.get(TaskResolverRegistry);
        this.taskWatcher = container.get(TaskWatcher);
        this.taskService = container.get(TaskService);
        this.taskDefinitionRegistry = container.get(TaskDefinitionRegistry);

        this.toDispose.push(this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            if (this.mayBeStartedByExecuteRequest(event)) {
                this.heldTaskEvents.set(event.taskId, { info: event, events: [] });
            } else {
                this.reportTaskStart(event, undefined);
            }
        }));

        this.toDispose.push(this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            this.reportTaskEvent(event.taskId, () => this.proxy.$onDidEndTask(event.taskId));
        }));

        this.toDispose.push(this.taskWatcher.onDidStartTaskProcess((event: TaskInfo) => {
            if (event.processId !== undefined) {
                this.reportTaskEvent(event.taskId, () => this.proxy.$onDidStartTaskProcess(event.processId!, {
                    id: event.taskId,
                    task: this.fromTaskConfiguration(event.config)
                }));
            }
        }));

        this.toDispose.push(this.taskWatcher.onDidEndTaskProcess((event: TaskExitedEvent) => {
            if (event.code !== undefined) {
                this.reportTaskEvent(event.taskId, () => this.proxy.$onDidEndTaskProcess(event.code!, event.taskId));
            }
        }));

        // Inform proxy about running tasks form previous session
        this.$taskExecutions().then(executions => {
            if (executions.length > 0) {
                this.proxy.$initLoadedTasks(executions);
            }
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    $registerTaskProvider(handle: number, type: string): void {
        const taskProvider = this.createTaskProvider(handle);
        const taskResolver = this.createTaskResolver(handle);

        const toDispose = new DisposableCollection(
            this.taskProviderRegistry.register(type, taskProvider, handle),
            this.taskResolverRegistry.registerTaskResolver(type, taskResolver),
            Disposable.create(() => this.taskProviders.delete(handle))
        );
        this.taskProviders.set(handle, toDispose);
        this.toDispose.push(toDispose);
    }

    $unregister(handle: number): void {
        const disposable = this.taskProviders.get(handle);
        if (disposable) {
            disposable.dispose();
        }
    }

    async $fetchTasks(taskVersion: string | undefined, taskType: string | undefined): Promise<TaskDto[]> {
        if (taskVersion && !taskVersion.startsWith('2.')) { // Theia does not support 1.x or earlier task versions
            return [];
        }

        const token: number = this.taskService.startUserAction();
        const [configured, provided] = await Promise.all([
            this.taskService.getConfiguredTasks(token),
            this.taskService.getProvidedTasks(token)
        ]);
        const result: TaskDto[] = [];
        for (const tasks of [configured, provided]) {
            for (const task of tasks) {
                if (!taskType || (!!this.taskDefinitionRegistry.getDefinition(task) ? task._source === taskType : task.type === taskType)) {
                    result.push(this.fromTaskConfiguration(task));
                }
            }
        }
        return result;
    }

    async $executeTask(taskDto: TaskDto, executeRequestId: number): Promise<TaskExecutionDto | undefined> {
        const taskConfig = this.toTaskConfiguration(taskDto);
        this.pendingExecuteRequests.set(executeRequestId, taskConfig);
        let taskInfo: TaskInfo | undefined;
        try {
            taskInfo = await this.taskService.runTask(taskConfig);
        } finally {
            this.pendingExecuteRequests.delete(executeRequestId);
            this.releaseHeldTaskEvents(taskInfo?.taskId, executeRequestId);
        }
        if (taskInfo) {
            return {
                id: taskInfo.taskId,
                task: this.fromTaskConfiguration(taskInfo.config),
                executeRequestId
            };
        }
    }

    /**
     * The start of an execution is reported before `runTask` resolves, so it's not known yet whether a pending request started it.
     * The events for a task that matches a pending request are therefore held until `runTask` settles for the requests it matches.
     */
    protected mayBeStartedByExecuteRequest(event: TaskInfo): boolean {
        return this.taskService.isEventForThisClient(event.ctx)
            && [...this.pendingExecuteRequests.values()].some(pendingConfig => this.taskDefinitionRegistry.compareTasks(pendingConfig, event.config));
    }

    /**
     * Reports the held events of the task started by a request, and of the tasks that no pending request may have started anymore.
     * @param startedTaskId the id of the task started by the request, if any
     * @param executeRequestId the id of the request for which `runTask` settled
     */
    protected releaseHeldTaskEvents(startedTaskId: number | undefined, executeRequestId: number): void {
        for (const [taskId, held] of this.heldTaskEvents) {
            const startedByRequest = taskId === startedTaskId;
            if (startedByRequest || !this.mayBeStartedByExecuteRequest(held.info)) {
                this.heldTaskEvents.delete(taskId);
                this.reportTaskStart(held.info, startedByRequest ? executeRequestId : undefined);
                held.events.forEach(report => report());
            }
        }
    }

    protected reportTaskStart(event: TaskInfo, executeRequestId: number | undefined): void {
        this.proxy.$onDidStartTask({
            id: event.taskId,
            task: this.fromTaskConfiguration(event.config),
            executeRequestId
        }, event.terminalId!);
    }

    protected reportTaskEvent(taskId: number, report: () => void): void {
        const held = this.heldTaskEvents.get(taskId);
        if (held) {
            held.events.push(report);
        } else {
            report();
        }
    }

    async $taskExecutions(): Promise<{
        id: number;
        task: TaskDto;
    }[]> {
        const runningTasks = await this.taskService.getRunningTasks();
        return runningTasks.map(taskInfo => ({
            id: taskInfo.taskId,
            task: this.fromTaskConfiguration(taskInfo.config)
        }));
    }

    $terminateTask(id: number): void {
        this.taskService.kill(id);
    }

    async $customExecutionComplete(id: number, exitCode: number | undefined): Promise<void> {
        this.taskService.customExecutionComplete(id, exitCode);
    }

    protected createTaskProvider(handle: number): TaskProvider {
        return {
            provideTasks: () =>
                this.proxy.$provideTasks(handle).then(tasks =>
                    tasks.map(taskDto =>
                        this.toTaskConfiguration(taskDto)
                    )
                )
        };
    }

    protected createTaskResolver(handle: number): TaskResolver {
        return {
            resolveTask: taskConfig =>
                this.proxy.$resolveTask(handle, this.fromTaskConfiguration(taskConfig)).then(task =>
                    this.toTaskConfiguration(task)
                )
        };
    }

    protected toTaskConfiguration(taskDto: TaskDto): TaskConfiguration {
        const { group, presentation, scope, source, runOptions, ...common } = taskDto ?? {};
        const partialConfig: Partial<TaskConfiguration> = {};
        if (presentation) {
            partialConfig.presentation = this.convertTaskPresentation(presentation);
        }
        if (group) {
            partialConfig.group = {
                kind: group.kind,
                isDefault: group.isDefault
            };
        }
        return {
            ...common,
            ...partialConfig,
            runOptions,
            _scope: scope,
            _source: source,
        };
    }

    protected fromTaskConfiguration(task: TaskConfiguration): TaskDto {
        const { group, presentation, _scope, _source, ...common } = task;
        const partialDto: Partial<TaskDto> = {};
        if (presentation) {
            partialDto.presentation = this.convertTaskPresentation(presentation);
        }
        if (group === 'build' || group === 'test') {
            partialDto.group = {
                kind: group,
                isDefault: false
            };
        } else if (typeof group === 'object') {
            partialDto.group = group;
        }
        return {
            ...common,
            ...partialDto,
            scope: _scope,
            source: _source,
        };
    }

    private convertTaskPresentation(presentationFrom: undefined): undefined;
    private convertTaskPresentation(presentationFrom: TaskOutputPresentation): TaskPresentationOptionsDTO;
    private convertTaskPresentation(presentationFrom: TaskPresentationOptionsDTO): TaskOutputPresentation;
    private convertTaskPresentation(
        presentationFrom: TaskOutputPresentation | TaskPresentationOptionsDTO | undefined
    ): TaskOutputPresentation | TaskPresentationOptionsDTO | undefined {
        if (presentationFrom) {
            const { reveal, panel, ...common } = presentationFrom;
            const presentationTo: Partial<TaskOutputPresentation | TaskPresentationOptionsDTO> = {};
            if (reveal) {
                presentationTo.reveal = revealKindMap.get(reveal);
            }
            if (panel) {
                presentationTo.panel = panelKindMap.get(panel)!;
            }
            return {
                ...common,
                ...presentationTo,
            };
        }
    }
}
