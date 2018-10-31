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

import { ILogger, Emitter, Event } from '@theia/core/lib/common';

export interface IProcessExitEvent {
    readonly code: number,
    readonly signal?: string
}

export enum ProcessType {
    'Raw',
    'Terminal'
}

export interface ProcessOptions {
    readonly command: string,
    args?: string[],
    options?: object
}

export abstract class Process {
    protected _id: number = -1;
    readonly exitEmitter: Emitter<IProcessExitEvent> = new Emitter<IProcessExitEvent>();
    abstract readonly pid: number;
    protected _killed = false;

    constructor(
        protected readonly logger: ILogger,
        protected readonly type: ProcessType) {
    }

    setId(id: number): void {
        this._id = id;
    }

    get id(): number {
        return this._id;
    }

    abstract kill(signal?: string): void;

    get killed() {
        return this._killed;
    }

    get onExit(): Event<IProcessExitEvent> {
        return this.exitEmitter.event;
    }

    protected emitOnExit(code: number, signal?: string) {
        const exitEvent = { code, signal };
        this.handleOnExit(exitEvent);
        this.exitEmitter.fire(exitEvent);
    }

    protected handleOnExit(event: IProcessExitEvent) {
        this._killed = true;
        const signalSuffix = event.signal ? `, signal: ${event.signal}` : '';

        this.logger.debug(`Process ${this.pid} has exited with code ${event.code}${signalSuffix}.`);
    }
}
