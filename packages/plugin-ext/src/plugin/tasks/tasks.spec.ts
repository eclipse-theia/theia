// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
import { RPCProtocol, ProxyIdentifier } from '../../common/rpc-protocol';
import { TerminalServiceExtImpl } from '../terminal-ext';
import { Emitter } from '@theia/core/lib/common/event';
import { CustomExecution } from '../types-impl';
import * as Converter from '../type-converters';
import { TasksExtImpl } from './tasks';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

const expect = chai.expect;

// Shaped like extensions that subclass CustomExecution and keep the command they run on it.
class CommandCustomExecution extends CustomExecution {
    readonly onDidWrite = new Emitter<string>().event;
    constructor(readonly command: string, readonly args: string[]) {
        super(async () => ({ onDidWrite: new Emitter<string>().event, open: () => { }, close: () => { } }));
    }
}

function createTask(execution: theia.CustomExecution): theia.Task {
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
        const dto = Converter.fromTask(createTask(new CommandCustomExecution('make', ['build'])));
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
            ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl);
            startExternally = async dto => {
                const execution = { id: nextId++, task: dto };
                await ext.$onDidStartTask(execution, 1);
                return execution;
            };
        });

        it('gives onDidStartTask and the caller the task object the plugin passed', async () => {
            const task = createTask(new CommandCustomExecution('make', ['build']));
            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));

            const execution = await ext.executeTask(task);

            expect(started).to.have.length(1);
            expect(started[0].task).to.equal(task);
            expect(started[0].task.execution).to.be.instanceOf(CommandCustomExecution);
            expect(execution.task).to.equal(task);
        });

        it('stops handing out the task once its execution ended', async () => {
            const task = createTask(new CommandCustomExecution('make', ['build']));
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
            const task = createTask(new CommandCustomExecution('make', ['build']));
            startExternally = async d => ({ id: nextId++, task: d });
            await ext.executeTask(task);
            const other = Converter.fromTask(createTask(new CommandCustomExecution('make', ['test'])))!;
            other.executionId = 'started-elsewhere';

            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));
            await ext.$onDidStartTask({ id: 99, task: other }, 1);

            expect(started[0].task).to.not.equal(task);
        });

        it('keeps runs of two tasks that share an execution apart', async () => {
            const execution = new CommandCustomExecution('make', ['build']);
            const first = createTask(execution);
            const second = createTask(execution);
            const started: theia.TaskExecution[] = [];
            ext.onDidStartTask(e => started.push(e.execution));

            const results = await Promise.all([ext.executeTask(first), ext.executeTask(second)]);

            expect(results.map(r => r.task)).to.deep.equal([first, second]);
            expect(started.map(e => e.task)).to.have.members([first, second]);
            expect(results[0].task).to.equal(first);
            expect(results[1].task).to.equal(second);
        });

        it('forgets the task when the main side does not start it', async () => {
            const task = createTask(new CommandCustomExecution('make', ['build']));
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
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl);
            const execution = new CommandCustomExecution('make', ['build']);
            ext.registerTaskProvider('test', { provideTasks: () => [createTask(execution)], resolveTask: () => undefined });
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
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl);
            const execution = new CommandCustomExecution('make', ['build']);
            ext.registerTaskProvider('test', { provideTasks: () => [], resolveTask: task => ({ ...task, execution }) });
            const unresolved = Converter.fromTask({ ...createTask(execution), execution: undefined })!;
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
            const ext = new TasksExtImpl(rpc, { attachPtyToTerminal: () => { } } as unknown as TerminalServiceExtImpl);
            const ran: string[] = [];
            const recording = (name: string) => new CustomExecution(async () => {
                ran.push(name);
                return { onDidWrite: new Emitter<string>().event, open: () => { }, close: () => { } };
            });
            ext.registerTaskProvider('test', { provideTasks: () => [createTask(recording('first')), createTask(recording('second'))], resolveTask: () => undefined });
            const [first] = await ext.$provideTasks(0);

            await ext.$onDidStartTask({ id: 1, task: first }, 1);

            expect(ran).to.deep.equal(['first']);
        });
    });
});
