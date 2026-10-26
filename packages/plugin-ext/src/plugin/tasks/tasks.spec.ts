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

import * as chai from 'chai';
import * as theia from '@theia/plugin';
import { TaskDto, TaskExecutionDto, TasksMain } from '../../common/plugin-api-rpc';
import { ProxyIdentifier, RPCProtocol } from '../../common/rpc-protocol';
import { TerminalServiceExtImpl } from '../terminal-ext';
import { ShellExecution, Task, URI } from '../types-impl';
import { WorkspaceExtImpl } from '../workspace';
import { TasksExtImpl } from './tasks';

const expect = chai.expect;

describe('TasksExtImpl', () => {

    const rootUri = URI.parse('file:///workspace/root');
    const outsideUri = URI.parse('file:///outside');
    const root: theia.WorkspaceFolder = { uri: rootUri, name: 'root', index: 1 };

    let proxy: Partial<TasksMain>;
    let tasksExt: TasksExtImpl;

    const createTaskDto = (label: string, scope: string | number): TaskDto => ({
        type: 'shell',
        executionType: 'shell',
        label,
        scope,
        command: 'echo'
    });

    const createExecutionDto = (id: number, scope: string): TaskExecutionDto => ({
        id,
        task: createTaskDto(`task-${id}`, scope)
    });

    beforeEach(() => {
        proxy = {
            $terminateTask: () => { }
        };
        const rpc: RPCProtocol = {
            getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                return proxy as T;
            },
            set<T, R extends T>(_id: ProxyIdentifier<T>, instance: R): R {
                return instance;
            },
            dispose(): void { }
        };
        const workspaceExt = {
            resolveWorkspaceFolder: (uri: theia.Uri) => uri.toString() === rootUri.toString() ? root : undefined
        } as WorkspaceExtImpl;
        tasksExt = new TasksExtImpl(rpc, {} as TerminalServiceExtImpl, workspaceExt);
    });

    describe('#fetchTasks', () => {

        it('should scope tasks to the workspace folder', async () => {
            proxy.$fetchTasks = async () => [createTaskDto('in-root', rootUri.toString())];
            const tasks = await tasksExt.fetchTasks();
            expect(tasks).to.have.length(1);
            expect(tasks[0].scope).to.equal(root);
        });

        it('should leave out tasks scoped to a folder that is not a workspace folder', async () => {
            proxy.$fetchTasks = async () => [
                createTaskDto('outside', outsideUri.toString()),
                createTaskDto('workspace', 2)
            ];
            const tasks = await tasksExt.fetchTasks();
            expect(tasks.map(task => task.name)).to.deep.equal(['workspace']);
        });
    });

    describe('task events', () => {

        it('should fire start and end events with the workspace folder as scope', async () => {
            const started: theia.TaskExecution[] = [];
            const ended: theia.TaskExecution[] = [];
            tasksExt.onDidStartTask(event => started.push(event.execution));
            tasksExt.onDidEndTask(event => ended.push(event.execution));

            await tasksExt.$onDidStartTask(createExecutionDto(1, rootUri.toString()), 0);
            tasksExt.$onDidEndTask(1);

            expect(started).to.have.length(1);
            expect(started[0].task.scope).to.equal(root);
            expect(ended).to.deep.equal(started);
            expect(tasksExt.taskExecutions).to.be.empty;
        });

        it('should not fire events for tasks scoped to a folder that is not a workspace folder', async () => {
            let fired = 0;
            tasksExt.onDidStartTask(() => fired++);
            tasksExt.onDidEndTask(() => fired++);
            tasksExt.onDidStartTaskProcess(() => fired++);
            tasksExt.onDidEndTaskProcess(() => fired++);

            const executionDto = createExecutionDto(1, outsideUri.toString());
            await tasksExt.$onDidStartTask(executionDto, 0);
            tasksExt.$onDidStartTaskProcess(42, executionDto);
            tasksExt.$onDidEndTaskProcess(0, 1);
            tasksExt.$onDidEndTask(1);

            expect(fired).to.equal(0);
            expect(tasksExt.taskExecutions).to.be.empty;
        });
    });

    describe('#executeTask', () => {

        const createTask = (scope: theia.WorkspaceFolder): theia.Task =>
            new Task({ type: 'shell' }, scope, 'echo', 'test', new ShellExecution('echo'));

        it('should return an execution with the passed task', async () => {
            const task = createTask(root);
            proxy.$executeTask = async () => createExecutionDto(1, rootUri.toString());
            const execution = await tasksExt.executeTask(task);
            expect(execution.task).to.equal(task);
        });

        it('should fire the start event with the passed task if it arrives before the request completes', async () => {
            const task = createTask(root);
            const started: theia.TaskExecution[] = [];
            tasksExt.onDidStartTask(event => started.push(event.execution));
            proxy.$executeTask = async (_taskDto, executeRequestId) => {
                const executionDto = { ...createExecutionDto(1, rootUri.toString()), executeRequestId };
                await tasksExt.$onDidStartTask(executionDto, 0);
                expect(started).to.have.length(1);
                expect(started[0].task).to.equal(task);
                return executionDto;
            };

            const execution = await tasksExt.executeTask(task);

            expect(execution).to.equal(started[0]);
        });

        it('should not use the passed task for the start event of another execution', async () => {
            const task = createTask(root);
            const started: theia.TaskExecution[] = [];
            tasksExt.onDidStartTask(event => started.push(event.execution));
            proxy.$executeTask = async (_taskDto, executeRequestId) => {
                await tasksExt.$onDidStartTask(createExecutionDto(1, rootUri.toString()), 0);
                return { ...createExecutionDto(2, rootUri.toString()), executeRequestId };
            };

            const execution = await tasksExt.executeTask(task);

            expect(started).to.have.length(1);
            expect(started[0].task).not.to.equal(task);
            expect(execution.task).to.equal(task);
            expect(execution).not.to.equal(started[0]);
        });

        it('should fire the start event with the passed task if its scope is not a workspace folder', async () => {
            const task = createTask({ uri: outsideUri, name: 'outside', index: 0 });
            const started: theia.TaskExecution[] = [];
            tasksExt.onDidStartTask(event => started.push(event.execution));
            proxy.$executeTask = async (_taskDto, executeRequestId) => {
                const executionDto = { ...createExecutionDto(1, outsideUri.toString()), executeRequestId };
                await tasksExt.$onDidStartTask(executionDto, 0);
                return executionDto;
            };

            const execution = await tasksExt.executeTask(task);

            expect(execution.task).to.equal(task);
            expect(started).to.deep.equal([execution]);
        });
    });
});
