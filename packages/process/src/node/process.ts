// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { injectable, unmanaged } from '@theia/core/shared/inversify';
import { ILogger, Emitter, Event, isObject } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/node';
import { isOSX, isWindows } from '@theia/core';
import { Readable, Writable } from 'stream';
import { exec } from 'child_process';
import * as fs from 'fs';
import { IProcessStartEvent, IProcessExitEvent, ProcessErrorEvent, ProcessType, ManagedProcessManager, ManagedProcess } from '../common/process-manager-types';
export { IProcessStartEvent, IProcessExitEvent, ProcessErrorEvent, ProcessType };

/**
 * Options to spawn a new process (`spawn`).
 *
 * For more information please refer to the spawn function of Node's
 * child_process module:
 *
 *   https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
 */
export interface ProcessOptions {
    readonly command: string,
    args?: string[],
    options?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any
    }
}

/**
 * Options to fork a new process using the current Node interpreter (`fork`).
 *
 * For more information please refer to the fork function of Node's
 * child_process module:
 *
 *   https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
 */
export interface ForkOptions {
    readonly modulePath: string,
    args?: string[],
    options?: object
}

@injectable()
export abstract class Process implements ManagedProcess {

    readonly id: number;
    protected readonly startEmitter: Emitter<IProcessStartEvent> = new Emitter<IProcessStartEvent>();
    protected readonly exitEmitter: Emitter<IProcessExitEvent> = new Emitter<IProcessExitEvent>();
    protected readonly closeEmitter: Emitter<IProcessExitEvent> = new Emitter<IProcessExitEvent>();
    protected readonly errorEmitter: Emitter<ProcessErrorEvent> = new Emitter<ProcessErrorEvent>();
    protected _killed = false;

    /**
     * The OS process id.
     */
    abstract readonly pid: number;

    /**
     * The stdout stream.
     */
    abstract readonly outputStream: Readable;

    /**
     * The stderr stream.
     */
    abstract readonly errorStream: Readable;

    /**
     * The stdin stream.
     */
    abstract readonly inputStream: Writable;

    constructor(
        protected readonly processManager: ManagedProcessManager,
        protected readonly logger: ILogger,
        @unmanaged() protected readonly type: ProcessType,
        protected readonly options: ProcessOptions | ForkOptions
    ) {
        this.id = this.processManager.register(this);
        this.initialCwd = options && options.options && 'cwd' in options.options && options.options['cwd'].toString() || __dirname;
    }

    abstract kill(signal?: string): void;

    get killed(): boolean {
        return this._killed;
    }

    get onStart(): Event<IProcessStartEvent> {
        return this.startEmitter.event;
    }

    /**
     * Wait for the process to exit, streams can still emit data.
     */
    get onExit(): Event<IProcessExitEvent> {
        return this.exitEmitter.event;
    }

    get onError(): Event<ProcessErrorEvent> {
        return this.errorEmitter.event;
    }

    /**
     * Waits for both process exit and for all the streams to be closed.
     */
    get onClose(): Event<IProcessExitEvent> {
        return this.closeEmitter.event;
    }

    protected emitOnStarted(): void {
        this.startEmitter.fire({});
    }

    /**
     * Emit the onExit event for this process.  Only one of code and signal
     * should be defined.
     */
    protected emitOnExit(code?: number, signal?: string): void {
        const exitEvent: IProcessExitEvent = { code, signal };
        this.handleOnExit(exitEvent);
        this.exitEmitter.fire(exitEvent);
    }

    /**
     * Emit the onClose event for this process.  Only one of code and signal
     * should be defined.
     */
    protected emitOnClose(code?: number, signal?: string): void {
        this.closeEmitter.fire({ code, signal });
    }

    protected handleOnExit(event: IProcessExitEvent): void {
        this._killed = true;
        const signalSuffix = event.signal ? `, signal: ${event.signal}` : '';
        const executable = this.isForkOptions(this.options) ? this.options.modulePath : this.options.command;

        this.logger.debug(`Process ${this.pid} has exited with code ${event.code}${signalSuffix}.`,
            executable, this.options.args);
    }

    protected emitOnError(err: ProcessErrorEvent): void {
        this.handleOnError(err);
        this.errorEmitter.fire(err);
    }

    protected async emitOnErrorAsync(error: ProcessErrorEvent): Promise<void> {
        process.nextTick(this.emitOnError.bind(this), error);
    }

    protected handleOnError(error: ProcessErrorEvent): void {
        this._killed = true;
        this.logger.error(error);
    }

    protected isForkOptions(options: unknown): options is ForkOptions {
        return isObject<ForkOptions>(options) && !!options.modulePath;
    }

    protected readonly initialCwd: string;

    /**
     * @returns the current working directory as a URI (usually file:// URI)
     */
    public getCwdURI(): Promise<string> {
        if (isOSX) {
            return new Promise<string>(resolve => {
                exec('lsof -OPln -p ' + this.pid + ' | grep cwd', (error, stdout, stderr) => {
                    if (stdout !== '') {
                        resolve(FileUri.create(stdout.substring(stdout.indexOf('/'), stdout.length - 1)).toString());
                    } else {
                        resolve(FileUri.create(this.initialCwd).toString());
                    }
                });
            });
        } else if (!isWindows) {
            return new Promise<string>(resolve => {
                fs.readlink('/proc/' + this.pid + '/cwd', (err, linkedstr) => {
                    if (err || !linkedstr) {
                        resolve(FileUri.create(this.initialCwd).toString());
                    } else {
                        resolve(FileUri.create(linkedstr).toString());
                    }
                });
            });
        } else {
            return new Promise<string>(resolve => {
                resolve(FileUri.create(this.initialCwd).toString());
            });
        }
    }
}
