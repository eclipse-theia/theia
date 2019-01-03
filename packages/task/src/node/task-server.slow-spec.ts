/********************************************************************************
 * Copyright (C) 2017-2019 Ericsson and others.
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

import { createTaskTestContainer } from './test/task-test-container';
import { BackendApplication } from '@theia/core/lib/node/backend-application';
import { TaskExitedEvent, TaskInfo, TaskServer, TaskWatcher, TaskConfiguration } from '../common';
import { ProcessType, ProcessTaskConfiguration } from '../common/process/task-protocol';
import * as http from 'http';
import * as https from 'https';
import { isWindows } from '@theia/core/lib/common/os';
import { FileUri } from '@theia/core/lib/node';
import { terminalsPath } from '@theia/terminal/lib/common/terminal-protocol';
import { expectThrowsAsync } from '@theia/core/lib/common/test/expect';
import { TestWebSocketChannel } from '@theia/core/lib/node/messaging/test/test-web-socket-channel';
import { expect } from 'chai';

/**
 * Globals
 */

// test scripts that we bundle with tasks
const commandShortRunning = './task';
const commandShortrunningindows = 'task.bat';

const commandLongRunning = './task-long-running';
const commandLongRunningWindows = 'task-long-running.bat';

const bogusCommand = 'thisisnotavalidcommand';

const commandToFindInPathUnix = 'ls';
const commandToFindInPathWindows = 'dir';

// we use test-resources subfolder ('<theia>/packages/task/test-resources/'),
// as workspace root, for these tests
const wsRoot: string = FileUri.fsPath(FileUri.create(__dirname).resolve('../../test-resources'));

describe('Task server / back-end', function () {
    this.timeout(10000);

    let server: http.Server | https.Server;
    let taskServer: TaskServer;
    let taskWatcher: TaskWatcher;

    beforeEach(async () => {
        const testContainer = createTaskTestContainer();
        taskWatcher = testContainer.get(TaskWatcher);
        taskServer = testContainer.get(TaskServer);
        taskServer!.setClient(taskWatcher.getTaskClient());
        server = await testContainer.get(BackendApplication).start();
    });

    afterEach(() => {
        taskServer = undefined!;
        taskWatcher = undefined!;
        const s = server;
        server = undefined!;
        s.close();
    });

    it('task running in terminal - expected data is received from the terminal ws server', async function () {
        const someString = 'someSingleWordString';

        // This test is flaky on Windows and fails intermittently. Disable it for now
        if (isWindows) {
            this.skip();
        }

        // create task using terminal process
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createProcessTaskConfig('shell', FileUri.fsPath(command), [someString]), wsRoot);
        const terminalId = taskInfo.terminalId;

        // hook-up to terminal's ws and confirm that it outputs expected tasks' output
        await new Promise((resolve, reject) => {
            const channel = new TestWebSocketChannel({ server, path: `${terminalsPath}/${terminalId}` });
            channel.onError(reject);
            channel.onClose((code, reason) => reject(`channel is closed with '${code}' code and '${reason}' reason`));
            channel.onMessage(msg => {
                // check output of task on terminal is what we expect
                const expected = `tasking... ${someString}`;
                if (msg.toString().indexOf(expected) !== -1) {
                    resolve();
                } else {
                    reject(`expected sub-string not found in terminal output. Expected: "${expected}" vs Actual: "${msg.toString()}"`);
                }
                channel.close();
            });
        });
    });

    it('task using raw process - task server success response shall not contain a terminal id', async function () {
        const someString = 'someSingleWordString';
        const command = isWindows ? commandShortrunningindows : commandShortRunning;

        // create task using raw process
        const taskInfo: TaskInfo = await taskServer.run(createProcessTaskConfig('process', FileUri.fsPath(command), [someString]), wsRoot);

        const p = new Promise((resolve, reject) => {
            const toDispose = taskWatcher.onTaskExit((event: TaskExitedEvent) => {
                if (event.taskId === taskInfo.taskId && event.code === 0) {
                    if (taskInfo.terminalId === undefined) {
                        resolve();
                    } else {
                        reject(`terminal id was expected to be undefined, actual: ${taskInfo.terminalId}`);
                    }
                    toDispose.dispose();
                }
            });
        });

        await p;
    });

    it('task is executed successfully with cwd as a file URI', async function () {
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const config = createProcessTaskConfig('shell', FileUri.fsPath(command), [], FileUri.create(wsRoot).toString());
        const taskInfo: TaskInfo = await taskServer.run(config, wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task is executed successfully using terminal process', async function () {
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createProcessTaskConfig('shell', FileUri.fsPath(command), []), wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task is executed successfully using raw process', async function () {
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createProcessTaskConfig('process', FileUri.fsPath(command), []));

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task without a specific runner is executed successfully using as a process', async function () {
        const command = isWindows ? commandToFindInPathWindows : commandToFindInPathUnix;

        // there's no runner registered for the 'npm' task type
        const taskConfig: TaskConfiguration = createTaskConfig('npm', command, []);
        const taskInfo: TaskInfo = await taskServer.run(taskConfig, wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task can successfully execute command found in system path using a terminal process', async function () {
        const command = isWindows ? commandToFindInPathWindows : commandToFindInPathUnix;

        const opts: TaskConfiguration = createProcessTaskConfig('shell', command, []);
        const taskInfo: TaskInfo = await taskServer.run(opts, wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task can successfully execute command found in system path using a raw process', async function () {
        const command = isWindows ? commandToFindInPathWindows : commandToFindInPathUnix;
        const taskInfo: TaskInfo = await taskServer.run(createProcessTaskConfig('process', command, []), wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it('task using terminal process can be killed', async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const taskInfo: TaskInfo = await taskServer.run(createTaskConfigTaskLongRunning('shell'), wsRoot);

        const p = new Promise<string | number>((resolve, reject) => {
            taskWatcher.onTaskExit((event: TaskExitedEvent) => {
                if (isWindows) {
                    if (event.taskId !== taskInfo.taskId || event.code === undefined) {
                        reject();
                    }
                    resolve(event.code);
                } else {
                    if (event.taskId !== taskInfo.taskId || event.signal === undefined) {
                        reject();
                    }
                    resolve(event.signal);
                }
            });

            taskServer.kill(taskInfo.taskId);
        });

        // node-pty reports different things on Linux/macOS vs Windows when
        // killing a process.  This is not ideal, but that's how things are
        // currently.  Ideally, its behavior should be aligned as much as
        // possible on what node's child_process module does.
        const signalOrCode = await p;
        if (isWindows) {
            // On Windows, node-pty just reports an exit code of 0.
            expect(signalOrCode).equals(0);
        } else {
            // On Linux/macOS, node-pty sends SIGHUP by default, for some reason.
            expect(signalOrCode).equals('SIGHUP');
        }
    });

    it('task using raw process can be killed', async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const taskInfo: TaskInfo = await taskServer.run(createTaskConfigTaskLongRunning('process'), wsRoot);

        const p = new Promise<string>((resolve, reject) => {
            taskWatcher.onTaskExit((event: TaskExitedEvent) => {
                if (event.taskId !== taskInfo.taskId || event.signal === undefined) {
                    reject();
                }

                resolve(event.signal);
            });

            taskServer.kill(taskInfo.taskId);
        });

        const signal = await p;
        expect(signal).equals('SIGTERM');
    });

    it('task using terminal process can handle command that does not exist', async function () {
        const p = taskServer.run(createProcessTaskConfig2('shell', bogusCommand, []), wsRoot);
        await expectThrowsAsync(p, `Command not found: ${bogusCommand}`);
    });

    it('task using raw process can handle command that does not exist', async function () {
        const p = taskServer.run(createProcessTaskConfig2('process', bogusCommand, []), wsRoot);
        await expectThrowsAsync(p, `Command not found: ${bogusCommand}`);
    });

    it('getTasks(ctx) returns tasks according to created context', async function () {
        const context1 = 'aContext';
        const context2 = 'anotherContext';

        // create some tasks: 4 for context1, 2 for context2
        const task1 = await taskServer.run(createTaskConfigTaskLongRunning('shell'), context1);
        const task2 = await taskServer.run(createTaskConfigTaskLongRunning('process'), context2);
        const task3 = await taskServer.run(createTaskConfigTaskLongRunning('shell'), context1);
        const task4 = await taskServer.run(createTaskConfigTaskLongRunning('process'), context2);
        const task5 = await taskServer.run(createTaskConfigTaskLongRunning('shell'), context1);
        const task6 = await taskServer.run(createTaskConfigTaskLongRunning('process'), context1);

        const runningTasksCtx1 = await taskServer.getTasks(context1); // should return 4 tasks
        const runningTasksCtx2 = await taskServer.getTasks(context2); // should return 2 tasks
        const runningTasksAll = await taskServer.getTasks(); // should return 6 tasks

        const p = new Promise((resolve, reject) => {
            if (runningTasksCtx1.length === 4) {
                if (runningTasksCtx2.length === 2) {
                    if (runningTasksAll.length === 6) {
                        resolve();
                    } else {
                        reject(`Error: unexpected total number of running tasks for all contexts:  expected: 6, actual: ${runningTasksCtx1.length}`);
                    }
                } else {
                    reject(`Error: unexpected number of running tasks for context 2: expected: 2, actual: ${runningTasksCtx1.length}`);
                }

            } else {
                reject(`Error: unexpected number of running tasks for context 1: expected: 4, actual: ${runningTasksCtx1.length}`);
            }
        });

        // cleanup
        await taskServer.kill(task1.taskId);
        await taskServer.kill(task2.taskId);
        await taskServer.kill(task3.taskId);
        await taskServer.kill(task4.taskId);
        await taskServer.kill(task5.taskId);
        await taskServer.kill(task6.taskId);

        await p;
    });

    it('creating and killing a bunch of tasks works as expected', async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const numTasks = 20;
        const taskinfo: TaskInfo[] = [];

        // create a mix of terminal and raw processes
        for (let i = 0; i < numTasks; i++) {
            if (i % 2 === 0) {
                taskinfo.push(await taskServer.run(createTaskConfigTaskLongRunning('shell')));
            } else {
                taskinfo.push(await taskServer.run(createTaskConfigTaskLongRunning('process')));
            }
        }

        const numRunningTasksAfterCreated = await taskServer.getTasks();

        for (let i = 0; i < taskinfo.length; i++) {
            await taskServer.kill(taskinfo[i].taskId);
        }
        const numRunningTasksAfterKilled = await taskServer.getTasks();

        const p = new Promise((resolve, reject) => {
            if (numRunningTasksAfterCreated.length === numTasks) {
                if (numRunningTasksAfterKilled.length === 0) {
                    resolve();
                } else {
                    reject(`Error: remaining running tasks, after all killed: expected: 0, actual: ${numRunningTasksAfterKilled.length}`);
                }

            } else {
                reject(`Error: unexpected number of running tasks: expected: ${numTasks}, actual: ${numRunningTasksAfterCreated.length}`);
            }
        });

        await p;
    });

});

function createTaskConfig(taskType: string, command: string, args: string[]): TaskConfiguration {
    const options: TaskConfiguration = {
        label: 'test task',
        type: taskType,
        command: command,
        args: args,
        windows: {
            command: 'cmd.exe',
            args: [
                '/c',
                command
                ,
                (args[0] !== undefined) ? args[0] : ''
            ]
        },
        cwd: wsRoot
    };
    return options;
}

function createProcessTaskConfig(processType: ProcessType, command: string, args: string[], cwd: string = wsRoot): TaskConfiguration {
    const options: ProcessTaskConfiguration = {
        label: 'test task',
        type: processType,
        command: command,
        args: args,
        windows: {
            command: 'cmd.exe',
            args: [
                '/c',
                command
                ,
                (args[0] !== undefined) ? args[0] : ''
            ]
        },
        cwd: cwd
    };
    return options;
}

function createProcessTaskConfig2(processType: ProcessType, command: string, args: string[]): TaskConfiguration {
    return <ProcessTaskConfiguration>{
        label: 'test task',
        type: processType,
        command: command,
        args: args,
        cwd: wsRoot
    };
}

function createTaskConfigTaskLongRunning(processType: ProcessType): TaskConfiguration {
    return <ProcessTaskConfiguration>{
        label: '[Task] long running test task (~300s)',
        type: processType,
        cwd: wsRoot,
        command: commandLongRunning,
        args: [],
        windows: {
            command: 'cmd.exe',
            args: [
                '/c',
                commandLongRunningWindows
            ]
        }
    };
}

function checkSuccessfullProcessExit(taskInfo: TaskInfo, taskWatcher: TaskWatcher): Promise<object> {
    const p = new Promise((resolve, reject) => {
        const toDispose = taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            if (event.taskId === taskInfo.taskId && event.code === 0) {
                toDispose.dispose();
                resolve();
            }
        });
    });

    return p;
}
