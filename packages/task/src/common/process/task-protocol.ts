/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { TaskConfiguration, TaskInfo } from '../task-protocol';
import { ApplicationError } from '@theia/core/lib/common/application-error';

export type ProcessType = 'shell' | 'process';

export interface CommandOptions {
    /**
     * The 'current working directory' the task will run in. Can be a uri-as-string
     * or plain string path. If the cwd is meant to be somewhere under the workspace,
     * one can use the variable `${workspaceFolder}`, which will be replaced by its path,
     * at runtime. If not specified, defaults to the workspace root.
     * ex:  cwd: '${workspaceFolder}/foo'
     */
    cwd?: string;

    /**
     * The environment of the executed program or shell. If omitted the parent process' environment is used.
     */
    env?: { [key: string]: string | undefined; };

    /**
     * Configuration of the shell when task type is `shell`
     */
    shell?: {
        /**
         * The shell to use.
         */
        executable: string;

        /**
         * The arguments to be passed to the shell executable to run in command mode
         * (e.g ['-c'] for bash or ['/S', '/C'] for cmd.exe).
         */
        args?: string[];
    };
}

export interface CommandProperties<T = string> {
    readonly command?: string;
    readonly args?: T[];
    readonly options?: CommandOptions;
}

/** Configuration of a Task that may be run as a process or a command inside a shell. */
export interface ProcessTaskConfiguration<T = string> extends TaskConfiguration, CommandProperties<T> {
    readonly type: ProcessType;

    /**
     * Windows specific task configuration
     */
    readonly windows?: CommandProperties<T>;

    /**
     * macOS specific task configuration
     */
    readonly osx?: CommandProperties<T>;

    /**
     * Linux specific task configuration
     */
    readonly linux?: CommandProperties<T>;
}

export interface ProcessTaskInfo extends TaskInfo {
    /** terminal id. Defined if task is run as a terminal process */
    readonly terminalId?: number;
    /** process id. Defined if task is run as a process */
    readonly processId?: number;
}
export namespace ProcessTaskInfo {
    export function is(info: TaskInfo): info is ProcessTaskInfo {
        return info['terminalId'] !== undefined || info['processId'] !== undefined;
    }
}

export namespace ProcessTaskError {
    export const CouldNotRun = ApplicationError.declare(1, (code: string) => ({
        message: `Error starting process (${code})`,
        data: { code }
    }));
}
