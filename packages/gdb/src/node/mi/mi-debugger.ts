/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { MIInterpreter } from './mi-interpreter'
import { MIProtocol as MI } from './mi-protocol';
import { IDebugProcess, IDebugger, IDebugProcessFactory, IDebugProcessFactoryProvider } from '@theia/debug/lib/node';
import { ILogger } from '@theia/core/lib/common';

export const IMIDebugger = Symbol("IMIDebugger");

export interface IMIDebugger extends IDebugger {
    start(options: IMIDebuggerOptions): Promise<any>;
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
    public readonly id: number;
    protected debugProcessFactory: IDebugProcessFactory;
    protected _debugProcess: Promise<IDebugProcess>;

    constructor(
        @inject(MIInterpreter) protected readonly interpreter: MIInterpreter,
        @inject(IDebugProcessFactoryProvider) protected readonly debugProcessFactoryProvider: IDebugProcessFactoryProvider,
        @inject(ILogger) protected readonly logger: ILogger) {
    }

    /* FIXME This needs to be done better since the real spawn is now in the constructor of the process */
    async spawn(): Promise<any> {
        const debugProcess = await this._debugProcess;

        return new Promise((resolve, reject) => {
            /* FIXME Dispose of these handler */
            debugProcess.onError((err: Error) => {
                reject(err)
            });
            debugProcess.onExit(event => {
                if (event.code > 0) {
                    reject(new Error(`Exited with code: ${event.code}`));
                }
            });

            this.interpreter.start(debugProcess.readStream, debugProcess.writeStream);
            this.interpreter.once('NotifyAsyncOutput', (input: any) => {
                resolve(input);
            });
        });
    }

    async start(options: IMIDebuggerOptions): Promise<any> {

        this._debugProcess = new Promise(resolve => {
            this.debugProcessFactoryProvider().then(factory => {
                resolve(factory({ 'command': options.command, 'args': options.args }));
            });
        });

        const debugProcess = await this._debugProcess;

        const p = new Promise((resolve, reject) => {
            this.spawn().then(() => {
                debugProcess.onExit(event => { this.onProcessExit(event.code, event.signal) });
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

    get debugProcess(): Promise<IDebugProcess> {
        return this._debugProcess;
    }
}
