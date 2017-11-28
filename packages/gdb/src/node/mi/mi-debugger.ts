/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { MIInterpreter } from './mi-interpreter'
import { MIProtocol as MI } from './mi-protocol';
import { IDebugProcess } from '@theia/debug/lib/node/debug-process';
import { GDBTerminalProcessFactory } from '../gdb-terminal-process'
import { ILogger } from '@theia/core/lib/common';

export const IMIDebugger = Symbol("IMIDebugger");

export interface IMIDebugger {
    start(options: IMIDebuggerOptions): Promise<any>;
    getTerminal(): any;
}

export interface IMIDebuggerOptions {
    command: string,
    args: string[];
}

export enum ProcessState {
    Initial = 0,
    Started,
    Exited,
    Error
}

@injectable()
export class MIDebugger implements IMIDebugger {

    protected rawProcess: IDebugProcess;

    constructor(
        @inject(MIInterpreter) protected readonly interpreter: MIInterpreter,
        @inject(GDBTerminalProcessFactory) protected readonly gdbFactory: GDBTerminalProcessFactory,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    spawn(command: string, args: string[]): Promise<any> {
        return new Promise((resolve, reject) => {
            this.rawProcess = this.gdbFactory({ 'command': command, 'args': args });

            /* FIXME Dispose of these handler */
            this.rawProcess.onError((err: Error) => {
                reject(err)
            });
            this.rawProcess.onExit(event => {
                if (event.code > 0) {
                    reject(new Error(`Exited with code: ${event.code}`));
                }
            });

            this.interpreter.start(this.rawProcess.readStream, this.rawProcess.writeStream);
            this.interpreter.once('NotifyAsyncOutput', (input: any) => {
                resolve(input);
            });
        });
    }

    start(options: IMIDebuggerOptions): Promise<any> {
        const p = new Promise((resolve, reject) => {
            this.spawn(options.command, options.args).then(() => {
                this.rawProcess.onExit(event => { this.onProcessExit(event.code, event.signal) });
                /* Send command to list capabilities */
                const command = new MI.MICommand('list-features');
                this.interpreter.sendCommand(command).then((result: MI.ResultRecord) => {
                    this.logger.debug(`Initialize got GDB features ResultRecord: ${JSON.stringify(result)}`);
                    resolve(result);
                });
            }).catch((error) => { reject(error) });
        });
        return p;
    }

    onProcessExit(code: number, signal?: string) {
    }

    waitForFirstEvent() {
        return new Promise((resolve, reject) => {
            this.interpreter.once('NotifyAsyncOutput', (input: any) => {
                resolve(input);
            });
        });

    }

    public getTerminal(): any {
        return this.rawProcess.terminal;
    }
}
