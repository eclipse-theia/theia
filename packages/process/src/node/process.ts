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

import { injectable, unmanaged } from 'inversify';
import { ProcessManager } from './process-manager';
import { ILogger, Emitter, Event } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/node';
import { isOSX, isWindows } from '@theia/core';
import { Readable, Writable } from 'stream';
import { exec } from 'child_process';
import * as fs from 'fs';

export interface IProcessExitEvent {
    // Exactly one of code and signal will be set.
    readonly code?: number,
    readonly signal?: string
}

/**
 * Data emitted when a process has been successfully started.
 */
export interface IProcessStartEvent {
}

/**
 * Data emitted when a process has failed to start.
 */
export interface ProcessErrorEvent extends Error {
    /** An errno-like error string (e.g. ENOENT).  */
    code: string;
}

export enum ProcessType {
    'Raw',
    'Terminal'
}

/**
 * Options to spawn a new process (`spawn`).
 *
 * For more information please refer to the spawn function of Node's
 * child_process module:
 *
 *   https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
 */
export interface ProcessOptions<T = string> {
    readonly command: string,
    args?: T[],
    options?: {
        // tslint:disable-next-line:no-any
        [key: string]: any
    }
}

/**
 * Options to fork a new process using the current Node interpeter (`fork`).
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
export abstract class Process {

    readonly id: number;
    protected readonly startEmitter: Emitter<IProcessStartEvent> = new Emitter<IProcessStartEvent>();
    protected readonly exitEmitter: Emitter<IProcessExitEvent> = new Emitter<IProcessExitEvent>();
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
        protected readonly processManager: ProcessManager,
        protected readonly logger: ILogger,
        @unmanaged() protected readonly type: ProcessType,
        protected readonly options: ProcessOptions | ForkOptions
    ) {
        this.id = this.processManager.register(this);
        this.initialCwd = options && options.options && 'cwd' in options.options && options.options['cwd'].toString() || __dirname;
    }

    abstract kill(signal?: string): void;

    get killed() {
        return this._killed;
    }

    get onStart(): Event<IProcessStartEvent> {
        return this.startEmitter.event;
    }

    get onExit(): Event<IProcessExitEvent> {
        return this.exitEmitter.event;
    }

    get onError(): Event<ProcessErrorEvent> {
        return this.errorEmitter.event;
    }

    protected emitOnStarted() {
        this.startEmitter.fire({});
    }

    /**
     * Emit the onExit event for this process.  Only one of code and signal
     * should be defined.
     */
    protected emitOnExit(code?: number, signal?: string) {
        const exitEvent: IProcessExitEvent = { code, signal };
        this.handleOnExit(exitEvent);
        this.exitEmitter.fire(exitEvent);
    }

    protected handleOnExit(event: IProcessExitEvent) {
        this._killed = true;
        const signalSuffix = event.signal ? `, signal: ${event.signal}` : '';
        const executable = this.isForkOptions(this.options) ? this.options.modulePath : this.options.command;

        this.logger.debug(`Process ${this.pid} has exited with code ${event.code}${signalSuffix}.`,
            executable, this.options.args);
    }

    protected emitOnError(err: ProcessErrorEvent) {
        this.handleOnError(err);
        this.errorEmitter.fire(err);
    }

    protected async emitOnErrorAsync(error: ProcessErrorEvent) {
        process.nextTick(this.emitOnError.bind(this), error);
    }

    protected handleOnError(error: ProcessErrorEvent) {
        this._killed = true;
        this.logger.error(error);
    }

    // tslint:disable-next-line:no-any
    protected isForkOptions(options: any): options is ForkOptions {
        return !!options && !!options.modulePath;
    }

    protected readonly initialCwd: string;

    /**
     * @returns the current working directory as a URI (usually file:// URI)
     */
    public getCwdURI(): Promise<string> {
        if (isOSX) {
            return new Promise<string>(resolve => {
                exec('lsof -p ' + this.pid + ' | grep cwd', (error, stdout, stderr) => {
                    if (stdout !== '') {
                        resolve(FileUri.create(stdout.substring(stdout.indexOf('/'), stdout.length - 1)).toString());
                    } else {
                        resolve(FileUri.create(this.initialCwd).toString());
                    }
                });
            });
        } else if (!isWindows) {
            return new Promise<string>(resolve => {
                resolve(FileUri.create(this.initialCwd).toString());
            });
        } else {
            return new Promise<string>(resolve => {
                fs.readlink('/proc/' + this.pid + '/cwd', (err, linkedstr) => {
                    if (err || !linkedstr) {
                        resolve(FileUri.create(this.initialCwd).toString());
                    } else {
                        resolve(FileUri.create(linkedstr).toString());
                    }
                });
            });
        }
    }
}
