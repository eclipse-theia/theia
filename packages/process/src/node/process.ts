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
export interface ProcessErrorEvent {
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
export interface ProcessOptions {
    readonly command: string,
    args?: string[],
    options?: object
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
    abstract readonly pid: number;
    protected _killed = false;

    constructor(
        protected readonly processManager: ProcessManager,
        protected readonly logger: ILogger,
        @unmanaged() protected readonly type: ProcessType,
        protected readonly options: ProcessOptions | ForkOptions
    ) {
        this.id = this.processManager.register(this);
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

    protected handleOnError(error: ProcessErrorEvent) {
        this._killed = true;
        this.logger.error(error);
    }

    // tslint:disable-next-line:no-any
    protected isForkOptions(options: any): options is ForkOptions {
        return !!options && !!options.modulePath;
    }
}
