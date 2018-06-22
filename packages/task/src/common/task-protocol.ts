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

import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { RawProcessOptions } from '@theia/process/lib/node/raw-process';
import { TerminalProcessOptions } from '@theia/process/lib/node/terminal-process';

export const taskPath = '/services/task';

export const TaskServer = Symbol('TaskServer');
export const TaskClient = Symbol('TaskClient');

export type ProcessType = 'terminal' | 'raw';

export interface TaskInfo {
    /** internal unique task id */
    taskId: number,
    /** terminal id. Defined if task is run as a terminal process */
    terminalId?: number,
    /** internal unique process id */
    processId?: number,
    /** OS PID of the process running the task */
    osProcessId: number,
    /** The command used to start this task */
    command: string,
    /** task label */
    label: string,
    /** context that was passed as part of task creation, if any */
    ctx?: string
}

export interface TaskOptions {
    /** A label that uniquely identifies a task configuration */
    label: string,
    /** 'raw' or 'terminal' - if not specified 'terminal' is the default */
    processType?: ProcessType,
    /** contains 'command', 'args?', 'options?' */
    processOptions: RawProcessOptions | TerminalProcessOptions,
    /**
     * windows version of processOptions. Used in preference on Windows, if
     * defined
     */
    windowsProcessOptions?: RawProcessOptions | TerminalProcessOptions,
    /**
     * The 'current working directory' the task will run in. Can be a uri-as-string
     * or plain string path. If the cwd is meant to be somewhere under the workspace,
     * one can use the variable `${workspaceFolder}`, which will be replaced by its path,
     * at runtime. If not specified, defaults to the workspace root.
     * ex:  cwd: '${workspaceFolder}/foo'
     */
    cwd?: string
}

export interface TaskServer extends JsonRpcServer<TaskClient> {
    /** Run a task. Optionally pass a context.  */
    run(task: TaskOptions, ctx?: string): Promise<TaskInfo>;
    /** Kill a task, by id. */
    kill(taskId: number): Promise<void>;
    /**
     * Returns a list of currently running tasks. If a context is provided,
     * only the tasks started in that context will be provided. Using an
     * undefined context matches all tasks, no matter the creation context.
     */
    getTasks(ctx?: string): Promise<TaskInfo[]>

    /** removes the client that has disconnected */
    disconnectClient(client: TaskClient): void;
}

/** Event sent when a task has concluded its execution */
export interface TaskExitedEvent {
    taskId: number;
    code: number;
    signal?: string;
    ctx?: string
}

export interface TaskClient {
    onTaskExit(event: TaskExitedEvent): void;
    onTaskCreated(event: TaskInfo): void;
}
