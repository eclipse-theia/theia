/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { testContainer } from './test-resources/inversify.spec-config';
import { BackendApplication } from '@theia/core/lib/node/backend-application';
import { TaskExitedEvent, TaskInfo, TaskServer, TaskOptions, ProcessType } from '../common/task-protocol';
import { TaskWatcher } from '../common/task-watcher';
import * as ws from 'ws';
import * as http from 'http';
import * as https from 'https';
import { isWindows } from '@theia/core/lib/common/os';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";
import { terminalsPath } from '@theia/terminal/lib/common/terminal-protocol';
import { expectThrowsAsync } from '@theia/core/lib/common/test/expect';

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

// we use test-resources subfolder ('<theia>/packages/task/src/node/test-resources/'),
// as workspace root, for these tests
const wsRoot: string = FileUri.fsPath(new URI(__dirname).resolve('test-resources'));

describe('Task server / back-end', function () {
    this.timeout(10000);
    let server: http.Server | https.Server;

    let taskServer: TaskServer;
    const taskWatcher = testContainer.get(TaskWatcher);
    let application;

    before(async function () {
        process.argv.push(`--root-dir=${wsRoot}`);

        application = testContainer.get(BackendApplication);
        taskServer = testContainer.get(TaskServer);
        taskServer.setClient(taskWatcher.getTaskClient());
        server = await application.start();
    });

    it("task running in terminal - expected data is received from the terminal ws server", async function () {
        const someString = 'someSingleWordString';

        // This test is flaky on Windows and fails intermitently. Disable it for now
        if (isWindows) {
            this.skip();
        }

        // create task using terminal process
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptions('terminal', FileUri.fsPath(command), [someString]), wsRoot);
        const terminalId = taskInfo.terminalId;

        // hook-up to terminal's ws and confirm that it outputs expected tasks' output
        const p = new Promise((resolve, reject) => {
            const socket = new ws(`ws://localhost:${server.address().port}${terminalsPath}/${terminalId}`);
            socket.on('message', msg => {
                // check output of task on terminal is what we expect
                const expected = `tasking... ${someString}`;
                if (msg.toString().indexOf(expected) !== -1) {
                    resolve();
                } else {
                    reject(`expected sub-string not found in terminal output. Expected: "${expected}" vs Actual: "${msg.toString()}"`);
                }

                socket.close();
            });
            socket.on('error', error => {
                reject(error);
            });
        });

        await p;
    });

    it("task using raw process - task server success response shall not contain a terminal id", async function () {
        const someString = 'someSingleWordString';
        const command = isWindows ? commandShortrunningindows : commandShortRunning;

        // create task using raw process
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptions('raw', FileUri.fsPath(command), [someString]), wsRoot);

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

    it("task is executed successfully using terminal process", async function () {
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptions('terminal', FileUri.fsPath(command), []), wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it("task is executed successfully using raw process", async function () {
        const command = isWindows ? commandShortrunningindows : commandShortRunning;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptions('raw', FileUri.fsPath(command), []));

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it("task can successfully execute command found in system path using a terminal process", async function () {
        const command = isWindows ? commandToFindInPathWindows : commandToFindInPathUnix;

        const opts: TaskOptions = createTaskOptions('terminal', command, []);
        const taskInfo: TaskInfo = await taskServer.run(opts, wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it("task can successfully execute command found in system path using a raw process", async function () {
        const command = isWindows ? commandToFindInPathWindows : commandToFindInPathUnix;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptions('raw', command, []), wsRoot);

        const p = checkSuccessfullProcessExit(taskInfo, taskWatcher);

        await p;
    });

    it("task using terminal process can be killed", async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptionsTaskLongRunning('terminal'), wsRoot);

        const p = new Promise((resolve, reject) => {
            const toDispose = taskWatcher.onTaskExit((event: TaskExitedEvent) => {
                if (event.taskId === taskInfo.taskId && event.code === 0 && event.signal !== '0') {
                    toDispose.dispose();
                    resolve();
                }
            });
        });

        await taskServer.kill(taskInfo.taskId);

        await p;
    });

    it("task using raw process can be killed", async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const taskInfo: TaskInfo = await taskServer.run(createTaskOptionsTaskLongRunning('raw'), wsRoot);

        const p = new Promise((resolve, reject) => {
            const toDispose = taskWatcher.onTaskExit((event: TaskExitedEvent) => {
                if (event.taskId === taskInfo.taskId && event.code === null && event.signal === 'SIGTERM') {
                    toDispose.dispose();
                    resolve();
                }
            });
        });

        await taskServer.kill(taskInfo.taskId);

        await p;
    });

    it("task using terminal process can handle command that does not exist", async function () {
        const p = taskServer.run(createTaskOptions2('terminal', bogusCommand, []), wsRoot);
        await expectThrowsAsync(p, `Command not found: ${bogusCommand}`);
    });

    it("task using raw process can handle command that does not exist", async function () {
        const p = taskServer.run(createTaskOptions2('raw', bogusCommand, []), wsRoot);
        await expectThrowsAsync(p, `Command not found: ${bogusCommand}`);
    });

    it("getTasks(ctx) returns tasks according to created context", async function () {
        const context1 = "aContext";
        const context2 = "anotherContext";

        // create some tasks: 4 for context1, 2 for context2
        const task1 = await taskServer.run(createTaskOptionsTaskLongRunning('terminal'), context1);
        const task2 = await taskServer.run(createTaskOptionsTaskLongRunning('raw'), context2);
        const task3 = await taskServer.run(createTaskOptionsTaskLongRunning('terminal'), context1);
        const task4 = await taskServer.run(createTaskOptionsTaskLongRunning('raw'), context2);
        const task5 = await taskServer.run(createTaskOptionsTaskLongRunning('terminal'), context1);
        const task6 = await taskServer.run(createTaskOptionsTaskLongRunning('raw'), context1);

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

    it("creating and killing a bunch of tasks works as expected", async function () {
        // const command = isWindows ? command_absolute_path_long_running_windows : command_absolute_path_long_running;
        const numTasks = 20;
        const taskinfo: TaskInfo[] = [];

        // create a mix of terminal and raw processes
        for (let i = 0; i < numTasks; i++) {
            if (i % 2 === 0) {
                taskinfo.push(await taskServer.run(createTaskOptionsTaskLongRunning('terminal')));
            } else {
                taskinfo.push(await taskServer.run(createTaskOptionsTaskLongRunning('raw')));
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

function createTaskOptions(processType: ProcessType, command: string, args: string[]): TaskOptions {
    const options: TaskOptions = {
        label: "test task",
        processType: processType,
        'processOptions': {
            'command': command,
            'args': args
        },
        "windowsProcessOptions": {
            "command": "cmd.exe",
            "args": [
                "/c",
                command
                ,
                (args[0] !== undefined) ? args[0] : ''
            ]
        },
        'cwd': wsRoot
    };
    return options;
}

function createTaskOptions2(processType: ProcessType, command: string, args: string[]): TaskOptions {
    return {
        label: "test task",
        processType: processType,
        'processOptions': {
            'command': command,
            'args': args
        },
        'cwd': wsRoot
    };
}

function createTaskOptionsTaskLongRunning(processType: ProcessType): TaskOptions {
    return {
        "label": "[Task] long runnning test task (~300s)",
        "processType": processType,
        "cwd": wsRoot,
        "processOptions": {
            "command": commandLongRunning,
            "args": []
        },
        "windowsProcessOptions": {
            "command": "cmd.exe",
            "args": [
                "/c",
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
