// *****************************************************************************
// Copyright (C) 2017-2019 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { deepClone, isWindows, isOSX, ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import {
    RawProcessFactory,
    ProcessErrorEvent,
    Process,
    TerminalProcessOptions,
    TaskTerminalProcessFactory,
} from '@theia/process/lib/node';
import {
    ShellQuotedString, ShellQuotingFunctions, BashQuotingFunctions, CmdQuotingFunctions, PowershellQuotingFunctions, createShellCommandLine, ShellQuoting,
} from '@theia/process/lib/common/shell-quoting';
import { TaskFactory } from './process-task';
import { TaskRunner } from '../task-runner';
import { Task } from '../task';
import { TaskConfiguration } from '../../common/task-protocol';
import { ProcessTaskError, CommandOptions } from '../../common/process/task-protocol';
import * as fs from 'fs';
import { ShellProcess } from '@theia/terminal/lib/node/shell-process';

export interface OsSpecificCommand {
    command: string,
    args: Array<string | ShellQuotedString> | undefined,
    options: CommandOptions
}

export interface ShellSpecificOptions {
    /** Arguments passed to the shell, aka `command` here. */
    execArgs: string[];
    /** Pack of functions used to escape the `subCommand` and `subArgs` to run in the shell. */
    quotingFunctions?: ShellQuotingFunctions;
}

/**
 * Task runner that runs a task as a process or a command inside a shell.
 */
@injectable()
export class ProcessTaskRunner implements TaskRunner {

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(RawProcessFactory)
    protected readonly rawProcessFactory: RawProcessFactory;

    @inject(TaskTerminalProcessFactory)
    protected readonly taskTerminalProcessFactory: TaskTerminalProcessFactory;

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
            // Always spawn a task in a pty, the only difference between shell/process tasks is the
            // way the command is passed:
            // - process: directly look for an executable and pass a specific set of arguments/options.
            // - shell: defer the spawning to a shell that will evaluate a command line with our executable.
            const terminalProcessOptions = this.getResolvedCommand(taskConfig);
            const terminal: Process = this.taskTerminalProcessFactory(terminalProcessOptions);

            // Wait for the confirmation that the process is successfully started, or has failed to start.
            await new Promise((resolve, reject) => {
                terminal.onStart(resolve);
                terminal.onError((error: ProcessErrorEvent) => {
                    reject(ProcessTaskError.CouldNotRun(error.code));
                });
            });

            const processType = (taskConfig.taskType || taskConfig.type) as 'process' | 'shell';
            return this.taskFactory({
                label: taskConfig.label,
                process: terminal,
                processType,
                context: ctx,
                config: taskConfig,
                command: this.getCommand(processType, terminalProcessOptions)
            });
        } catch (error) {
            this.logger.error(`Error occurred while creating task: ${error}`);
            throw error;
        }
    }

    protected getResolvedCommand(taskConfig: TaskConfiguration): TerminalProcessOptions {
        const osSpecificCommand = this.getOsSpecificCommand(taskConfig);

        const options = osSpecificCommand.options;

        // Use task's cwd with spawned process and pass node env object to
        // new process, so e.g. we can re-use the system path
        if (options) {
            options.env = {
                ...process.env,
                ...(options.env || {})
            };
        }

        /** Executable to actually spawn. */
        let command: string;
        /** List of arguments passed to `command`. */
        let args: string[];

        /**
         * Only useful on Windows, has to do with how node-pty handles complex commands.
         * This string should not include the executable, only what comes after it (arguments).
         */
        let commandLine: string | undefined;

        if ((taskConfig.taskType || taskConfig.type) === 'shell') {
            // When running a shell task, we have to spawn a shell process somehow,
            // and tell it to run the command the user wants to run inside of it.
            //
            // E.g:
            // - Spawning a process:
            //     spawn(process_exe, [...args])
            // - Spawning a shell and run a command:
            //     spawn(shell_exe, [shell_exec_cmd_flag, command])
            //
            // The fun part is, the `command` to pass as an argument usually has to be
            // what you would type verbatim inside the shell, so escaping rules apply.
            //
            // What's even more funny is that on Windows, node-pty uses a special
            // mechanism to pass complex escaped arguments, via a string.
            //
            // We need to accommodate most shells, so we need to get specific.

            const { shell } = osSpecificCommand.options;

            command = shell?.executable || ShellProcess.getShellExecutablePath();
            const { execArgs, quotingFunctions } = this.getShellSpecificOptions(command);

            // Allow overriding shell options from task configuration.
            args = shell?.args ? [...shell.args] : [...execArgs];

            // Check if an argument list is defined or not. Empty is ok.
            /** Shell command to run: */
            const shellCommand = this.buildShellCommand(osSpecificCommand, quotingFunctions);

            if (isWindows && /cmd(.exe)?$/.test(command)) {
                // Let's take the following command, including an argument containing whitespace:
                //     cmd> node -p process.argv 1 2 "  3"
                //
                // We would expect the following output:
                //     json> [ '...\\node.exe', '1', '2', '  3' ]
                //
                // Let's run this command through `cmd.exe` using `child_process`:
                //     js> void childprocess.spawn('cmd.exe', ['/s', '/c', 'node -p process.argv 1 2 "  3"']).stderr.on('data', console.log)
                //
                // We get the correct output, but when using node-pty:
                //     js> void nodepty.spawn('cmd.exe', ['/s', '/c', 'node -p process.argv 1 2 "  3"']).on('data', console.log)
                //
                // Then the output looks like:
                //     json> [ '...\\node.exe', '1', '2', '"', '3"' ]
                //
                // To fix that, we need to use a special node-pty feature and pass arguments as one string:
                //     js> nodepty.spawn('cmd.exe', '/s /c "node -p process.argv 1 2 "  3""')
                //
                // Note the extra quotes that need to be added around the whole command.
                commandLine = [...args, `"${shellCommand}"`].join(' ');
            }

            args.push(shellCommand);
        } else {
            // When running process tasks, `command` is the executable to run,
            // and `args` are the arguments we want to pass to it.
            command = osSpecificCommand.command;
            if (Array.isArray(osSpecificCommand.args)) {
                // Process task doesn't handle quotation: Normalize arguments from `ShellQuotedString` to raw `string`.
                args = osSpecificCommand.args.map(arg => typeof arg === 'string' ? arg : arg.value);
            } else {
                args = [];
            }
        }
        return { command, args, commandLine, options };
    }

    protected quoteShellCommandOrArg(commandOrArg: string | ShellQuotedString, quotingFunctions?: ShellQuotingFunctions): string | ShellQuotedString {
        // We want to quote arguments only if needed.
        if (quotingFunctions && typeof commandOrArg === 'string' && this.argumentNeedsQuotes(commandOrArg, quotingFunctions)) {
            return {
                quoting: ShellQuoting.Strong,
                value: commandOrArg,
            };
        } else {
            return commandOrArg;
        }
    }
    protected buildShellCommand(systemSpecificCommand: OsSpecificCommand, quotingFunctions?: ShellQuotingFunctions): string {
        if (Array.isArray(systemSpecificCommand.args)) {
            const commandLineElements: Array<string | ShellQuotedString> =
                [systemSpecificCommand.command, ...systemSpecificCommand.args].map(arg => this.quoteShellCommandOrArg(arg));
            return createShellCommandLine(commandLineElements, quotingFunctions);
        } else {
            // No arguments are provided, so `command` is actually the full command line to execute.
            if (systemSpecificCommand.command) {
                return createShellCommandLine([this.quoteShellCommandOrArg(systemSpecificCommand.command, quotingFunctions)], quotingFunctions);
            } else {
                return '';
            }
        }
    }

    protected getShellSpecificOptions(command: string): ShellSpecificOptions {
        if (/bash(.exe)?$/.test(command)) {
            return {
                quotingFunctions: BashQuotingFunctions,
                execArgs: ['-c']
            };
        } else if (/wsl(.exe)?$/.test(command)) {
            return {
                quotingFunctions: BashQuotingFunctions,
                execArgs: ['-e']
            };
        } else if (/cmd(.exe)?$/.test(command)) {
            return {
                quotingFunctions: CmdQuotingFunctions,
                execArgs: ['/S', '/C']
            };
        } else if (/(ps|pwsh|powershell)(.exe)?/.test(command)) {
            return {
                quotingFunctions: PowershellQuotingFunctions,
                execArgs: ['-c']
            };
        } else {
            return {
                quotingFunctions: BashQuotingFunctions,
                execArgs: ['-l', '-c']
            };
        }
    }

    protected getOsSpecificCommand(taskConfig: TaskConfiguration): OsSpecificCommand {
        // on windows, windows-specific options, if available, take precedence
        if (isWindows && taskConfig.windows !== undefined) {
            return this.getSystemSpecificCommand(taskConfig, 'windows');
        } else if (isOSX && taskConfig.osx !== undefined) { // on macOS, mac-specific options, if available, take precedence
            return this.getSystemSpecificCommand(taskConfig, 'osx');
        } else if (!isWindows && !isOSX && taskConfig.linux !== undefined) { // on linux, linux-specific options, if available, take precedence
            return this.getSystemSpecificCommand(taskConfig, 'linux');
        } else { // system-specific options are unavailable, use the default
            return this.getSystemSpecificCommand(taskConfig, undefined);
        }
    }

    protected getCommand(processType: 'process' | 'shell', terminalProcessOptions: TerminalProcessOptions): string | undefined {
        if (terminalProcessOptions.args) {
            if (processType === 'shell') {
                return terminalProcessOptions.args[terminalProcessOptions.args.length - 1];
            } else if (processType === 'process') {
                return `${terminalProcessOptions.command} ${terminalProcessOptions.args.join(' ')}`;
            }
        }
    }

    /**
     * This is task specific, to align with VS Code's behavior.
     *
     * When parsing arguments, VS Code will try to detect if the user already
     * tried to quote things.
     *
     * See: https://github.com/microsoft/vscode/blob/d363b988e1e58cf49963841c498681cdc6cb55a3/src/vs/workbench/contrib/tasks/browser/terminalTaskSystem.ts#L1101-L1127
     *
     * @param value
     * @param shellQuotingOptions
     */
    protected argumentNeedsQuotes(value: string, shellQuotingOptions: ShellQuotingFunctions): boolean {
        const { characters } = shellQuotingOptions;
        const needQuotes = new Set([' ', ...characters.needQuotes || []]);
        if (!characters) {
            return false;
        }
        if (value.length >= 2) {
            const first = value[0] === characters.strong ? characters.strong : value[0] === characters.weak ? characters.weak : undefined;
            if (first === value[value.length - 1]) {
                return false;
            }
        }
        let quote: string | undefined;
        for (let i = 0; i < value.length; i++) {
            // We found the end quote.
            const ch = value[i];
            if (ch === quote) {
                quote = undefined;
            } else if (quote !== undefined) {
                // skip the character. We are quoted.
                continue;
            } else if (ch === characters.escape) {
                // Skip the next character
                i++;
            } else if (ch === characters.strong || ch === characters.weak) {
                quote = ch;
            } else if (needQuotes.has(ch)) {
                return true;
            }
        }
        return false;
    }

    protected getSystemSpecificCommand(taskConfig: TaskConfiguration, system: 'windows' | 'linux' | 'osx' | undefined): OsSpecificCommand {
        // initialize with default values from the `taskConfig`
        let command: string | undefined = taskConfig.command;
        let args: Array<string | ShellQuotedString> | undefined = taskConfig.args;
        let options: CommandOptions = deepClone(taskConfig.options) || {};

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

        if (options.cwd) {
            options.cwd = this.asFsPath(options.cwd);
        }

        if (command === undefined) {
            throw new Error('The `command` field of a task cannot be undefined.');
        }

        return { command, args, options };
    }

    protected asFsPath(uriOrPath: string): string {
        return (uriOrPath.startsWith('file:'))
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
