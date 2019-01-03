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

import { injectable, inject, named } from 'inversify';
import { isWindows, ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import {
    TerminalProcess,
    RawProcess,
    TerminalProcessOptions,
    RawProcessOptions,
    RawProcessFactory,
    TerminalProcessFactory
} from '@theia/process/lib/node';
import { TaskFactory } from './process-task';
import { TaskRunner } from '../task-runner';
import { Task } from '../task';
import { TaskConfiguration } from '../../common/task-protocol';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Task runner that runs a task as a process or a command inside a shell.
 */
@injectable()
export class ProcessTaskRunner implements TaskRunner {

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(RawProcessFactory)
    protected readonly rawProcessFactory: RawProcessFactory;

    @inject(TerminalProcessFactory)
    protected readonly terminalProcessFactory: TerminalProcessFactory;

    @inject(TaskFactory)
    protected readonly taskFactory: TaskFactory;

    /**
     * Runs a task from the given task configuration.
     * @param taskConfig task configuration to run a task from. The provided task configuration must have a shape of `CommandProperties`.
     */
    async run(taskConfig: TaskConfiguration, ctx?: string): Promise<Task> {
        if (!taskConfig.command) {
            throw new Error("Process task config must have 'command' property specified");
        }

        let command;
        let args;
        let options;
        // on windows, prefer windows-specific options, if available
        if (isWindows && taskConfig.windows !== undefined) {
            command = taskConfig.windows.command;
            args = taskConfig.windows.args;
            options = taskConfig.windows.options;
        } else {
            command = taskConfig.command;
            args = taskConfig.args;
            options = taskConfig.options;
        }

        // sanity checks:
        // - we expect the cwd to be set by the client.
        if (!taskConfig.cwd) {
            throw new Error("Can't run a task when 'cwd' is not provided by the client");
        }

        const cwd = this.asFsPath(taskConfig.cwd);
        // Use task's cwd with spawned process and pass node env object to
        // new process, so e.g. we can re-use the system path
        options = {
            cwd: cwd,
            env: process.env
        };

        // When we create a process to execute a command, it's difficult to know if it failed
        // because the executable or script was not found, or if it was found, ran, and exited
        // unsuccessfully. So here we look to see if it seems we can find a file of that name
        // that is likely to be the one we want, before attempting to execute it.
        const cmd = await this.findCommand(command, cwd);
        if (!cmd) {
            throw new Error(`Command not found: ${command}`);
        }
        try {
            // use terminal or raw process
            let proc: TerminalProcess | RawProcess;
            const processType = taskConfig.type === 'process' ? 'process' : 'shell';
            if (processType === 'process') {
                this.logger.debug('Task: creating underlying raw process');
                proc = this.rawProcessFactory(<RawProcessOptions>{
                    command: command,
                    args: args,
                    options: options
                });
            } else {
                // all Task types without specific TaskRunner will be run as a shell process e.g.: npm, gulp, etc.
                this.logger.debug('Task: creating underlying terminal process');
                proc = this.terminalProcessFactory(<TerminalProcessOptions>{
                    command: command,
                    args: args,
                    options: options
                });
            }
            return this.taskFactory({
                label: taskConfig.label,
                command: cmd,
                process: proc,
                processType: processType,
                context: ctx,
                config: taskConfig
            });
        } catch (error) {
            this.logger.error(`Error occurred while creating task: ${error}`);
            throw error;
        }
    }

    protected asFsPath(uriOrPath: string) {
        return (uriOrPath.startsWith('file:/'))
            ? FileUri.fsPath(uriOrPath)
            : uriOrPath;
    }

    /**
     * Uses heuristics to look-for a command. Will look into the system path, if the command
     * is given without a path. Will resolve if a potential match is found, else reject. There
     * is no guarantee that a command we find will be the one executed, if multiple commands with
     * the same name exist.
     * @param command command name to look for
     * @param cwd current working directory (as a fs path, not URI)
     */
    protected async findCommand(command: string, cwd: string): Promise<string | undefined> {
        const systemPath = process.env.PATH;
        const pathDelimiter = path.delimiter;

        if (path.isAbsolute(command)) {
            if (await this.executableFileExists(command)) {
                return command;
            }
        } else {
            // look for command relative to cwd
            const resolvedCommand = FileUri.fsPath(FileUri.create(cwd).resolve(command));

            if (await this.executableFileExists(resolvedCommand)) {
                return resolvedCommand;
            } else {
                // just a command to find in the system path?
                if (path.basename(command) === command) {
                    // search for this command in the system path
                    if (systemPath !== undefined) {
                        const pathArray: string[] = systemPath.split(pathDelimiter);

                        for (const p of pathArray) {
                            const candidate = FileUri.fsPath(FileUri.create(p).resolve(command));
                            if (await this.executableFileExists(candidate)) {
                                return candidate;
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Checks for the existence of a file, at the provided path, and make sure that
     * it's readable and executable.
     */
    protected async executableFileExists(filePath: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            fs.access(filePath, fs.constants.F_OK | fs.constants.X_OK, err => {
                resolve(err ? false : true);
            });
        });
    }
}
