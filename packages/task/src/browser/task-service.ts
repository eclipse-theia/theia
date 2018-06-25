/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, named, postConstruct } from 'inversify';
import { ILogger } from '@theia/core/lib/common';
import { FrontendApplication, ApplicationShell } from '@theia/core/lib/browser';
import { TaskResolverRegistry, TaskProviderRegistry } from './task-contribution';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { MessageService } from '@theia/core/lib/common/message-service';
import { TaskServer, TaskExitedEvent, TaskInfo, TaskConfiguration } from '../common/task-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskWatcher } from '../common/task-watcher';
import { TaskConfigurationClient, TaskConfigurations } from './task-configurations';

@injectable()
export class TaskService implements TaskConfigurationClient {

    protected workspaceRootUri: string | undefined = undefined;
    /**
     * Reflects whether a valid task configuration file was found
     * in the current workspace, and is being watched for changes.
     */
    protected configurationFileFound: boolean = false;

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TaskServer)
    protected readonly taskServer: TaskServer;

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;

    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    @inject(TaskResolverRegistry)
    protected readonly taskResolverRegistry: TaskResolverRegistry;

    @inject(TaskProviderRegistry)
    protected readonly taskProviderRegistry: TaskProviderRegistry;

    @postConstruct()
    protected init(): void {
        // wait for the workspace root to be set
        this.workspaceService.root.then(async root => {
            if (root) {
                this.configurationFileFound = await this.taskConfigurations.watchConfigurationFile(root.uri);
                this.workspaceRootUri = root.uri;
            }
        });

        // notify user that task has started
        this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            if (this.isEventForThisClient(event.ctx)) {
                this.messageService.info(`Task #${event.taskId} created - ${event.config.label}`);
            }
        });

        // notify user that task has finished
        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            const signal = event.signal;
            if (!this.isEventForThisClient(event.ctx)) {
                return;
            }

            if (event.code === 0) {  // normal process exit
                let success = '';

                // this finer breakdown will not work on Windows.
                if (signal && signal !== '0') {
                    if (signal === '1') {
                        success = 'Terminal Hangup received - ';
                    } else if (signal === '2') {
                        success = 'User Interrupt received - ';
                    } else if (signal === '15' || signal === 'SIGTERM') {
                        success = 'Termination Interrupt received - ';
                    } else {
                        success = 'Interrupt received - ';
                    }
                } else {
                    success = 'Success - ';
                }

                success += `Task ${event.taskId} has finished. exit code: ${event.code}, signal: ${event.signal}`;
                this.messageService.info(success);
            } else {  // abnormal process exit
                this.messageService.error(`Error: Task ${event.taskId} failed. Exit code: ${event.code}, signal: ${event.signal}`);
            }
        });
    }

    /** Returns an array of the task configurations configured in tasks.json and provided by the extensions. */
    async getTasks(): Promise<TaskConfiguration[]> {
        const configuredTasks = this.taskConfigurations.getTasks();
        const providedTasks = await this.getProvidedTasks();
        return [...configuredTasks, ...providedTasks];
    }

    /** Returns an array of the task configurations which are provided by the extensions. */
    async getProvidedTasks(): Promise<TaskConfiguration[]> {
        const providedTasks: TaskConfiguration[] = [];
        const providers = this.taskProviderRegistry.getProviders();
        for (const provider of providers) {
            providedTasks.push(...await provider.provideTasks());
        }
        return providedTasks;
    }

    /**
     * Returns a task configuration provided by an extension by task type and label.
     * If there are no task configuration, returns undefined.
     */
    async getProvidedTask(type: string, label: string): Promise<TaskConfiguration | undefined> {
        const provider = this.taskProviderRegistry.getProvider(type);
        if (provider) {
            const tasks = await provider.provideTasks();
            return tasks.find(t => t.label === label);
        }
        return undefined;
    }

    /** Returns an array of running tasks 'TaskInfo' objects */
    getRunningTasks(): Promise<TaskInfo[]> {
        return this.taskServer.getTasks(this.getContext());
    }

    /**
     * Runs a task, by task configuration label.
     * Note, it looks for a task configured in tasks.json only.
     */
    async runConfiguredTask(taskLabel: string): Promise<void> {
        const task = this.taskConfigurations.getTask(taskLabel);
        if (!task) {
            this.logger.error(`Can't get task launch configuration for label: ${taskLabel}`);
            return;
        }
        this.run(task.type, task.label);
    }

    /**
     * Runs a task, by task type and task configuration label.
     * It looks for configured and provided tasks.
     */
    async run(type: string, taskLabel: string): Promise<void> {
        let task = await this.getProvidedTask(type, taskLabel);
        if (!task) {
            task = this.taskConfigurations.getTask(taskLabel);
            if (!task) {
                this.logger.error(`Can't get task launch configuration for label: ${taskLabel}`);
                return;
            }
        }

        const resolver = this.taskResolverRegistry.getResolver(task.type);
        let resolvedTask: TaskConfiguration;
        try {
            resolvedTask = resolver ? await resolver.resolveTask(task) : task;
        } catch (error) {
            this.logger.error(`Error resolving task '${taskLabel}': ${error}`);
            this.messageService.error(`Error resolving task '${taskLabel}': ${error}`);
            return;
        }

        let taskInfo: TaskInfo;
        try {
            taskInfo = await this.taskServer.run(resolvedTask, this.getContext());
        } catch (error) {
            this.logger.error(`Error launching task '${taskLabel}': ${error}`);
            this.messageService.error(`Error launching task '${taskLabel}': ${error}`);
            return;
        }

        this.logger.debug(`Task created. Task id: ${taskInfo.taskId}`);

        // open terminal widget if the task is based on a terminal process (type: shell)
        if (taskInfo.terminalId !== undefined) {
            this.attach(taskInfo.terminalId, taskInfo.taskId);
        }
    }

    async attach(terminalId: number, taskId: number): Promise<void> {
        // create terminal widget to display an execution output of a Task that was launched as a command inside a shell
        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(
            TERMINAL_WIDGET_FACTORY_ID,
            <TerminalWidgetFactoryOptions>{
                created: new Date().toString(),
                id: 'task-' + taskId,
                caption: `Task #${taskId}`,
                label: `Task #${taskId}`,
                destroyTermOnClose: true
            });
        this.shell.addWidget(widget, { area: 'bottom' });
        this.shell.activateWidget(widget.id);
        widget.start(terminalId);
    }

    protected isEventForThisClient(context: string | undefined): boolean {
        if (context === this.getContext()) {
            return true;
        }
        return false;
    }

    taskConfigurationChanged(event: string[]) {
        // do nothing for now
    }

    protected getContext(): string | undefined {
        return this.workspaceRootUri;
    }
}
