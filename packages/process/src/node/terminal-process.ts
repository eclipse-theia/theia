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

import { injectable, inject, named } from 'inversify';
import { ILogger } from '@theia/core/lib/common';
import { Process, ProcessType, ProcessOptions, ProcessErrorEvent } from './process';
import { RawProcessOptions } from './raw-process';
import { ProcessManager } from './process-manager';
import { IPty, spawn } from '@theia/node-pty';
import { MultiRingBuffer, MultiRingBufferReadableStream } from './multi-ring-buffer';
import { DevNullStream } from './dev-null-stream';
import { signame } from './utils';
import { Writable } from 'stream';

export type QuotingType = 'escaped' | 'strong' | 'weak';

/**
 * A `RuntimeQuotingType` represents the different ways to quote
 * and escape a value in a given runtime (`sh`, `cmd`, etc...).
 */
export type RuntimeQuotingTypes = { [key in QuotingType]: string } & { shouldBeEscaped?: string[] };
export const ShellQuoting = <RuntimeQuotingTypes>{
    strong: "'",
    weak: '"',
    escaped: '\\',
    shouldBeEscaped: ['$', ' ', '<', '>', '|', '{', '}', '(', ')', '\'', '"', '`'],
};

/**
 * Map of `Runtime (string) -> ShellQuoting`, trying to cover the
 * different ways in which each runtime manages quoting and escaping.
 */
// tslint:disable-next-line:no-any
export const RuntimeQuotingMap: { [key in string]: RuntimeQuotingTypes | undefined } = {
    'bash': ShellQuoting,
    'sh': ShellQuoting,
    'cmd.exe': {
        strong: '"',
        weak: '"',
        escaped: '^',
        shouldBeEscaped: ['%', '<', '>', '{', '}', '"'],
    }
};

/**
 * Struct describing how a string should be quoted.
 * To be used when sanitizing arguments for a shell task.
 */
export interface QuotedString {
    value: string;
    quoting: QuotingType
}

export const TerminalProcessOptions = Symbol('TerminalProcessOptions');
export interface TerminalProcessOptions extends ProcessOptions<string | QuotedString> {
    options?: {
        shell?: {
            executable: string
            args: string[]
        } | boolean;
    }
}

export const TerminalProcessFactory = Symbol('TerminalProcessFactory');
export interface TerminalProcessFactory {
    (options: TerminalProcessOptions): TerminalProcess;
}

@injectable()
export class TerminalProcess extends Process {

    /**
     * Resolve the exec options based on type (shell/process).
     *
     * @param options
     */
    protected static resolveExecOptions(options: TerminalProcessOptions): RawProcessOptions {
        return options.options && options.options.shell ?
            this.createShellOptions(options) : this.normalizeProcessOptions(options);
    }

    /**
     * Terminal options accept a special argument format when executing in a shell:
     * Arguments can be of the form: { value: string, quoting: string }, specifying
     * how the arg should be quoted/escaped in the shell command.
     *
     * @param options
     */
    protected static normalizeProcessOptions(options: TerminalProcessOptions): RawProcessOptions {
        return {
            ...options,
            args: options.args && options.args.map(
                arg => typeof arg === 'string' ? arg : arg.value),
        };
    }

    /**
     * Build the shell execution options (`runtime ...exec-argv "command ...argv"`).
     *
     * @param options
     */
    protected static createShellOptions(options: TerminalProcessOptions): RawProcessOptions {
        const windows = process.platform === 'win32';
        let runtime: string | undefined;
        let execArgs: string[] | undefined;
        let command = options.command;

        // Extract user defined runtime, if any:
        if (options.options && typeof options.options.shell === 'object') {
            runtime = options.options.shell.executable;
            execArgs = options.options.shell.args;
        }

        // Apply fallback values in case no specific runtime was specified:
        runtime = runtime || windows ?
            process.env['COMSPEC'] || 'cmd.exe' :
            process.env['SHELL'] || 'sh';
        execArgs = execArgs || windows ?
            ['/c'] : ['-c'];

        // Quote function, based on the selected runtime:
        const quoteCharacters = RuntimeQuotingMap[runtime] || ShellQuoting;
        function quote(string: string, quoting: QuotingType): string {

            if (quoting === 'escaped') {
                // Escaping most characters (https://stackoverflow.com/a/17606289/7983255)
                for (const reservedSymbol of quoteCharacters.shouldBeEscaped || []) {
                    string = string.split(reservedSymbol).join(quoteCharacters.escaped + reservedSymbol);
                }

            } else {
                // Add quotes around the argument
                const q = quoteCharacters[quoting];
                string = q + string + q;
            }

            return string;
        }

        function quoteIfWhitespace(string: string): string {
            return /\s/.test(string) ?
                quote(string, 'strong') :
                string;
        }

        // See VS Code behavior: https://code.visualstudio.com/docs/editor/tasks#_custom-tasks
        // Basically, when `task.type === 'shell` && `task.args.length > 0`, `task.command`
        // is only the executable to run in a shell, followed by the correctly escaped `args`.
        // Else just run `task.command`.
        if (options.args) {
            command = quoteIfWhitespace(command);
            for (const arg of options.args) {
                command += ' ' + (typeof arg === 'string' ?
                    quoteIfWhitespace(arg) : quote(arg.value, arg.quoting));
            }
        }

        return <RawProcessOptions>{
            ...options,
            command: runtime,
            args: [...execArgs, command],
        };
    }

    protected readonly terminal: IPty | undefined;

    readonly outputStream = this.createOutputStream();
    readonly errorStream = new DevNullStream();
    readonly inputStream: Writable;

    constructor(
        @inject(TerminalProcessOptions) options: TerminalProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(MultiRingBuffer) protected readonly ringBuffer: MultiRingBuffer,
        @inject(ILogger) @named('process') logger: ILogger
    ) {
        super(processManager, logger, ProcessType.Terminal, TerminalProcess.resolveExecOptions(options));

        if (this.isForkOptions(this.options)) {
            throw new Error('terminal processes cannot be forked as of today');
        }
        this.logger.debug('Starting terminal process', JSON.stringify(options, undefined, 2));

        try {
            this.terminal = spawn(
                this.options.command,
                this.options.args || [],
                this.options.options || {});

            this.terminal.on('exec', (reason: string | undefined) => {
                if (reason === undefined) {
                    this.emitOnStarted();
                } else {
                    const error = new Error(reason) as ProcessErrorEvent;
                    error.code = reason;
                    this.emitOnError(error);
                }
            });

            this.terminal.on('exit', (code: number, signal?: number) => {
                // Make sure to only pass either code or signal as !undefined, not
                // both.
                //
                // node-pty quirk: On Linux/macOS, if the process exited through the
                // exit syscall (with an exit code), signal will be 0 (an invalid
                // signal value).  If it was terminated because of a signal, the
                // signal parameter will hold the signal number and code should
                // be ignored.
                if (signal === undefined || signal === 0) {
                    this.emitOnExit(code, undefined);
                } else {
                    this.emitOnExit(undefined, signame(signal));
                }
            });

            this.terminal.on('data', (data: string) => {
                ringBuffer.enq(data);
            });

            this.inputStream = new Writable({
                write: (chunk: string) => {
                    this.write(chunk);
                },
            });

        } catch (error) {
            this.inputStream = new DevNullStream();

            // Normalize the error to make it as close as possible as what
            // node's child_process.spawn would generate in the same
            // situation.
            const message: string = error.message;

            if (message.startsWith('File not found: ')) {
                error.errno = 'ENOENT';
                error.code = 'ENOENT';
                error.path = options.command;
            }

            // node-pty throws exceptions on Windows.
            // Call the client error handler, but first give them a chance to register it.
            this.emitOnErrorAsync(error);
        }
    }

    createOutputStream(): MultiRingBufferReadableStream {
        return this.ringBuffer.getStream();
    }

    get pid() {
        this.checkTerminal();
        return this.terminal!.pid;
    }

    kill(signal?: string) {
        if (this.terminal && this.killed === false) {
            this.terminal.kill(signal);
        }
    }

    resize(cols: number, rows: number): void {
        this.checkTerminal();
        this.terminal!.resize(cols, rows);
    }

    write(data: string): void {
        this.checkTerminal();
        this.terminal!.write(data);
    }

    protected checkTerminal(): void | never {
        if (!this.terminal) {
            throw new Error('pty process did not start correctly');
        }
    }

}
