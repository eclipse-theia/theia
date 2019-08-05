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
import { isWindows, isOSX, ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import {
    TerminalProcessOptions,
    RawProcessFactory,
    TerminalProcessFactory,
    ProcessErrorEvent,
    Process,
    QuotedString,
} from '@theia/process/lib/node';
import { TaskFactory } from './process-task';
import { TaskRunner } from '../task-runner';
import { Task } from '../task';
import { TaskConfiguration } from '../../common/task-protocol';
import { ProcessTaskError, CommandOptions } from '../../common/process/task-protocol';
import * as fs from 'fs';

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

        try {
            const { command, args, options } = this.getResolvedCommand(taskConfig);

            const processType = taskConfig.type === 'process' ? 'process' : 'shell';
            let proc: Process;

            // Always spawn a task in a pty, the only difference between shell/process tasks is the
            // way the command is passed:
            // - process: directly look for an executable and pass a specific set of arguments/options.
            // - shell: defer the spawning to a shell that will evaluate a command line with our executable.
            if (processType === 'process') {
                this.logger.debug(`Task: spawning process: ${command} with ${args}`);
                proc = this.terminalProcessFactory(<TerminalProcessOptions>{
                    command, args, options: {
                        ...options,
                        shell: false,
                    }
                });
            } else {
                // all Task types without specific TaskRunner will be run as a shell process e.g.: npm, gulp, etc.
                this.logger.debug(`Task: executing command through a shell: ${command}`);
                proc = this.terminalProcessFactory(<TerminalProcessOptions>{
                    command, args, options: {
                        ...options,
                        shell: options.shell || true,
                    },
                });
            }

            // Wait for the confirmation that the process is successfully started, or has failed to start.
            await new Promise((resolve, reject) => {
                proc.onStart(resolve);
                proc.onError((error: ProcessErrorEvent) => {
                    reject(ProcessTaskError.CouldNotRun(error.code));
                });
            });

            return this.taskFactory({
                label: taskConfig.label,
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

    private getResolvedCommand(taskConfig: TaskConfiguration): {
        command: string | undefined,
        args: Array<string | QuotedString> | undefined,
        options: CommandOptions
    } {
        let systemSpecificCommand: {
            command: string | undefined,
            args: Array<string | QuotedString> | undefined,
            options: CommandOptions
        };
        // on windows, windows-specific options, if available, take precedence
        if (isWindows && taskConfig.windows !== undefined) {
            systemSpecificCommand = this.getSystemSpecificCommand(taskConfig, 'windows');
        } else if (isOSX && taskConfig.osx !== undefined) { // on macOS, mac-specific options, if available, take precedence
            systemSpecificCommand = this.getSystemSpecificCommand(taskConfig, 'osx');
        } else if (!isWindows && !isOSX && taskConfig.linux !== undefined) { // on linux, linux-specific options, if available, take precedence
            systemSpecificCommand = this.getSystemSpecificCommand(taskConfig, 'linux');
        } else { // system-specific options are unavailable, use the default
            systemSpecificCommand = this.getSystemSpecificCommand(taskConfig, undefined);
        }

        const options = systemSpecificCommand.options;
        // sanity checks:
        // - we expect the cwd to be set by the client.
        if (!options || !options.cwd) {
            throw new Error("Can't run a task when 'cwd' is not provided by the client");
        }

        // Use task's cwd with spawned process and pass node env object to
        // new process, so e.g. we can re-use the system path
        if (options) {
            options.env = {
                ...process.env,
                ...(options.env || {})
            };
        }

        return systemSpecificCommand;
    }

    private getSystemSpecificCommand(taskConfig: TaskConfiguration, system: 'windows' | 'linux' | 'osx' | undefined): {
        command: string | undefined,
        args: Array<string | QuotedString> | undefined,
        options: CommandOptions
    } {
        // initialise with default values from the `taskConfig`
        let command: string | undefined = taskConfig.command;
        let args: Array<string | QuotedString> | undefined = taskConfig.args;
        let options: CommandOptions = taskConfig.options || {};

        if (system) {
            if (taskConfig[system].command) {
                command = taskConfig[system].command;
            }
            if (taskConfig[system].args) {
                args = taskConfig[system].args;
            }
            if (taskConfig[system].options) {
                options = taskConfig[system].options;
            }
        }

        return { command, args, options };
    }

    protected asFsPath(uriOrPath: string): string {
        return (uriOrPath.startsWith('file:/'))
            ? FileUri.fsPath(uriOrPath)
            : uriOrPath;
    }

    /**
     * @deprecated
     *
     * Remove ProcessTaskRunner.findCommand, introduce process "started" event
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
