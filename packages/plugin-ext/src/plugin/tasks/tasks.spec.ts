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
import { TaskDto, TaskExecutionDto, TasksMain } from '../../common/plugin-api-rpc.js';
import { ProxyIdentifier, RPCProtocol } from '../../common/rpc-protocol.js';
import { TerminalServiceExtImpl } from '../terminal-ext.js';
import { CustomExecution, ShellExecution, Task, URI } from '../types-impl.js';
import * as Converter from '../type-converters.js';
import { WorkspaceExtImpl } from '../workspace.js';
import { TasksExtImpl } from './tasks.js';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

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
            getWorkspaceFolder: (uri: theia.Uri) => uri.toString() === rootUri.toString() || uri.toString().startsWith(rootUri.toString() + '/') ? root : undefined
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

        it('should scope tasks scoped to a sub-folder to the workspace folder containing it', async () => {
            proxy.$fetchTasks = async () => [createTaskDto('in-sub-folder', rootUri.toString() + '/packages/a')];
            const tasks = await tasksExt.fetchTasks();
            expect(tasks).to.have.length(1);
            expect(tasks[0].scope).to.equal(root);
        });

        it('should leave out tasks scoped to a folder that is not in a workspace folder', async () => {
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

        it('should not fire events for tasks scoped to a folder that is not in a workspace folder', async () => {
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

        it('should fire the start event with the passed task if its scope is not in a workspace folder', async () => {
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

// Shaped like extensions that subclass CustomExecution and keep the command they run on it.
class CommandCustomExecution extends CustomExecution {
    readonly onDidWrite = new Emitter<string>().event;
    constructor(readonly command: string, readonly args: string[]) {
        super(async () => ({ onDidWrite: new Emitter<string>().event, open: () => { }, close: () => { } }));
    }
}

const NO_WORKSPACE = { getWorkspaceFolder: () => undefined } as unknown as WorkspaceExtImpl;

function createCustomTask(execution: theia.CustomExecution): theia.Task {
    return {
        name: 'build',
        source: 'test',
        scope: 2,
        definition: { type: 'test', args: ['build'] },
        execution,
        runOptions: { reevaluateOnRerun: false }
    };
}

describe('Tasks with a CustomExecution subclass', () => {

    it('converts to a custom execution even when the execution has a command', () => {
        const dto = Converter.fromTask(createCustomTask(new CommandCustomExecution('make', ['build'])));
        expect(dto?.executionType).to.equal('customExecution');
        expect(dto?.callback).to.be.a('function');
    });

    describe('started with executeTask', () => {
        let ext: TasksExtImpl;
        let nextId: number;
        let startExternally: (dto: TaskDto) => Promise<TaskExecutionDto>;

        beforeEach(() => {
            nextId = 1;
            const proxy: Partial<TasksMain> = {
                // Like the main side, report the start before $executeTask resolves.
                $executeTask: async (dto: TaskDto) => startExternally(dto),
                $customExecutionComplete: async () => { },
                $terminateTask: () => { }
            };
            const rpc = {
                getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                    return proxy as unknown as T;
                }
            } as RPCProtocol;
            ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl, NO_WORKSPACE);
            startExternally = async dto => {
                const execution = { id: nextId++, task: dto };
                await ext.$onDidStartTask(execution, 1);
                return execution;
            };
        });

        it('gives onDidStartTask and the caller the task object the plugin passed', async () => {
            const task = createCustomTask(new CommandCustomExecution('make', ['build']));
            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));

            const execution = await ext.executeTask(task);

            expect(started).to.have.length(1);
            expect(started[0].task).to.equal(task);
            expect(started[0].task.execution).to.be.instanceOf(CommandCustomExecution);
            expect(execution.task).to.equal(task);
        });

        it('stops handing out the task once its execution ended', async () => {
            const task = createCustomTask(new CommandCustomExecution('make', ['build']));
            let dto: TaskDto | undefined;
            const start = startExternally;
            startExternally = d => { dto = d; return start(d); };
            await ext.executeTask(task);
            ext.$onDidEndTask(1);

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 2, task: dto! }, 1);

            expect(dto!.executionId).to.be.a('string');
            expect(started).to.have.length(1);
            expect(started[0].task).to.not.equal(task);
        });

        it('does not hand a remembered task to an unrelated execution', async () => {
            const task = createCustomTask(new CommandCustomExecution('make', ['build']));
            startExternally = async d => ({ id: nextId++, task: d });
            await ext.executeTask(task);
            const other = Converter.fromTask(createCustomTask(new CommandCustomExecution('make', ['test'])))!;
            other.executionId = 'started-elsewhere';

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 99, task: other }, 1);

            expect(started[0].task).to.not.equal(task);
        });

        it('keeps runs of two tasks that share an execution apart', async () => {
            const execution = new CommandCustomExecution('make', ['build']);
            const first = createCustomTask(execution);
            const second = createCustomTask(execution);
            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));

            const results = await Promise.all([ext.executeTask(first), ext.executeTask(second)]);

            expect(results.map(r => r.task)).to.deep.equal([first, second]);
            expect(started.map(e => e.task)).to.have.members([first, second]);
            expect(results[0].task).to.equal(first);
            expect(results[1].task).to.equal(second);
        });

        it('forgets the task when the main side does not start it', async () => {
            const task = createCustomTask(new CommandCustomExecution('make', ['build']));
            let dto: TaskDto | undefined;
            startExternally = async d => { dto = d; return undefined as unknown as TaskExecutionDto; };
            let error: unknown;
            await ext.executeTask(task).catch(e => { error = e; });

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 7, task: dto! }, 1);

            expect(error).to.be.instanceOf(Error);
            expect(started[0].task).to.not.equal(task);
        });
    });

    describe('provided by a task provider', () => {

        it('gives onDidStartTask the execution object the provider returned', async () => {
            const proxy: Partial<TasksMain> = { $registerTaskProvider: () => { }, $customExecutionComplete: async () => { } };
            const rpc = {
                getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                    return proxy as unknown as T;
                }
            } as RPCProtocol;
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl, NO_WORKSPACE);
            const execution = new CommandCustomExecution('make', ['build']);
            ext.registerTaskProvider('test', { provideTasks: () => [createCustomTask(execution)], resolveTask: () => undefined });
            const [dto] = await ext.$provideTasks(0);

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 1, task: dto }, 1);

            expect(started[0].task.execution).to.equal(execution);
        });

        it('gives onDidStartTask the execution object a resolved task returned', async () => {
            const proxy: Partial<TasksMain> = { $registerTaskProvider: () => { }, $customExecutionComplete: async () => { } };
            const rpc = {
                getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                    return proxy as unknown as T;
                }
            } as RPCProtocol;
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl, NO_WORKSPACE);
            const execution = new CommandCustomExecution('make', ['build']);
            ext.registerTaskProvider('test', { provideTasks: () => [], resolveTask: task => ({ ...task, execution }) });
            const unresolved = Converter.fromTask({ ...createCustomTask(execution), execution: undefined })!;
            const dto = await ext.$resolveTask(0, unresolved, CancellationToken.None);

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 1, task: dto }, 1);

            expect(started[0].task.execution).to.equal(execution);
        });

        it('runs the callback of the task that started', async () => {
            const proxy: Partial<TasksMain> = { $registerTaskProvider: () => { }, $customExecutionComplete: async () => { } };
            const rpc = {
                getProxy<T>(_proxyId: ProxyIdentifier<T>): T {
                    return proxy as unknown as T;
                }
            } as RPCProtocol;
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl, NO_WORKSPACE);
            const ran: string[] = [];
            const recording = (name: string) => new CustomExecution(async () => {
                ran.push(name);
                return { onDidWrite: new Emitter<string>().event, open: () => { }, close: () => { } };
            });
            ext.registerTaskProvider('test', { provideTasks: () => [createCustomTask(recording('first')), createCustomTask(recording('second'))], resolveTask: () => undefined });
            const [first] = await ext.$provideTasks(0);

            await ext.$onDidStartTask({ id: 1, task: first }, 1);

            expect(ran).to.deep.equal(['first']);
        });
    });
});
