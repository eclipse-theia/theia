// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { TaskDefinitionRegistry } from '@theia/task/lib/browser';
import { TaskProviderRegistry, TaskResolver, TaskResolverRegistry } from '@theia/task/lib/browser/task-contribution';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskConfiguration, TaskInfo } from '@theia/task/lib/common/task-protocol';
import { TaskWatcher } from '@theia/task/lib/common/task-watcher';
import { Disposable } from '@theia/core/lib/common/disposable';
import { TaskDto, TaskExecutionDto } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { TasksMainImpl } from './tasks-main';

disableJSDOM();

describe('TasksMainImpl', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const taskDto: TaskDto = { type: 'shell', label: 'build', source: 'Workspace', scope: 'file:///workspace/root', command: 'echo' };

    let watcher: TaskWatcher;
    let runTask: (config: TaskConfiguration) => Promise<TaskInfo | undefined>;
    let eventForThisClient: boolean;
    let reported: string[];
    let startedTasks: TaskDto[];
    let taskResolver: TaskResolver | undefined;
    let tasksMain: TasksMainImpl;

    /** A configuration of the same task that was not run by `$executeTask`, e.g. from the Run Task menu. */
    const untagged = ({ _executeRequestId, ...config }: TaskConfiguration): TaskConfiguration => config as TaskConfiguration;

    const taskCreated = (taskId: number, config: TaskConfiguration): TaskInfo => {
        const info: TaskInfo = { taskId, config, ctx: 'file:///workspace/root', terminalId: 1 };
        watcher.getTaskClient().onTaskCreated(info);
        return info;
    };

    beforeEach(() => {
        watcher = new TaskWatcher();
        eventForThisClient = true;
        reported = [];
        startedTasks = [];
        taskResolver = undefined;
        const taskService = {
            getRunningTasks: async () => [],
            isEventForThisClient: () => eventForThisClient,
            runTask: (config: TaskConfiguration) => runTask(config)
        } as unknown as TaskService;
        const container = new Container();
        container.bind(TaskProviderRegistry).toConstantValue({ register: () => Disposable.NULL } as unknown as TaskProviderRegistry);
        container.bind(TaskResolverRegistry).toConstantValue({
            registerTaskResolver: (type: string, resolver: TaskResolver) => {
                taskResolver = resolver;
                return Disposable.NULL;
            }
        } as unknown as TaskResolverRegistry);
        container.bind(TaskWatcher).toConstantValue(watcher);
        container.bind(TaskService).toConstantValue(taskService);
        container.bind(TaskDefinitionRegistry).toConstantValue(new TaskDefinitionRegistry());
        const proxy = {
            $onDidStartTask: ({ id, task, executeRequestId }: TaskExecutionDto) => {
                startedTasks.push(task);
                reported.push(`start ${id} ${executeRequestId}`);
            },
            $onDidEndTask: (id: number) => reported.push(`end ${id}`),
            $resolveTask: async (handle: number, task: TaskDto) => ({ ...task, command: 'resolved' })
        };
        const rpc = { getProxy: () => proxy } as unknown as RPCProtocol;
        tasksMain = new TasksMainImpl(rpc, container);
    });

    afterEach(() => tasksMain.dispose());

    it('should report the request id with the start of the task started by the request', async () => {
        runTask = async config => taskCreated(1, config);
        const execution = await tasksMain.$executeTask(taskDto, 3);
        expect(reported).to.deep.equal(['start 1 3']);
        expect(execution?.id).to.equal(1);
        expect(startedTasks[0]).to.not.have.property('_executeRequestId');
    });

    it('should not report the request id with the start of a task started while the request waits for the task lock', async () => {
        // Another `runTask` call holds `taskStartingLock` and starts the same task.
        // The request then finds the task running and resolves with `undefined`.
        runTask = async config => {
            taskCreated(1, untagged(config));
            return undefined;
        };
        const execution = await tasksMain.$executeTask(taskDto, 3);
        expect(execution).to.be.undefined;
        expect(reported).to.deep.equal(['start 1 undefined']);
    });

    it('should report the start of a matching task while the request waits for the user', async () => {
        // `runTask` found the task running and waits for the "Task `build` is already running." notification.
        // Meanwhile the task ends and the user runs it again from the Run Task menu.
        let pendingConfig: TaskConfiguration | undefined;
        let settle: (info: TaskInfo | undefined) => void = () => { };
        runTask = config => {
            pendingConfig = config;
            return new Promise(resolve => settle = resolve);
        };
        const execution = tasksMain.$executeTask(taskDto, 3);
        const info = taskCreated(1, untagged(pendingConfig!));
        watcher.getTaskClient().onTaskExit({ taskId: 1, ctx: info.ctx, code: 0 });
        try {
            expect(reported).to.deep.equal(['start 1 undefined', 'end 1']);
        } finally {
            settle(undefined);
            await execution;
        }
    });

    it('should not report the request id with the start of a task of another client', async () => {
        runTask = async config => {
            eventForThisClient = false;
            taskCreated(1, config);
            return undefined;
        };
        await tasksMain.$executeTask(taskDto, 3);
        expect(reported).to.deep.equal(['start 1 undefined']);
    });

    it('should not report the request id with the start of a task run again after the request settled', async () => {
        let config: TaskConfiguration | undefined;
        runTask = async taskConfig => {
            config = taskConfig;
            return taskCreated(1, taskConfig);
        };
        await tasksMain.$executeTask(taskDto, 3);
        taskCreated(2, config!);
        expect(reported).to.deep.equal(['start 1 3', 'start 2 undefined']);
    });

    it('should keep the request id when a plugin resolves the task', async () => {
        tasksMain.$registerTaskProvider(0, 'shell');
        runTask = async config => taskCreated(1, await taskResolver!.resolveTask(config));
        await tasksMain.$executeTask(taskDto, 3);
        expect(reported).to.deep.equal(['start 1 3']);
        expect(startedTasks[0].command).to.equal('resolved');
    });
});
