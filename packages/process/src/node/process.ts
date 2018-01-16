/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, unmanaged } from "inversify";
import { ProcessManager } from './process-manager';
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

@injectable()
export abstract class Process {

    readonly id: number;
    readonly exitEmitter: Emitter<IProcessExitEvent>;
    readonly errorEmitter: Emitter<Error>;
    abstract readonly pid: number;
    protected _killed = false;

    constructor(
        protected readonly processManager: ProcessManager,
        protected readonly logger: ILogger,
        @unmanaged() protected readonly type: ProcessType,
        protected readonly options: ProcessOptions) {

        this.exitEmitter = new Emitter<IProcessExitEvent>();
        this.errorEmitter = new Emitter<Error>();
        this.id = this.processManager.register(this);
    }

    abstract kill(signal?: string): void;

    get killed() {
        return this._killed;
    }

    get onExit(): Event<IProcessExitEvent> {
        return this.exitEmitter.event;
    }

    get onError(): Event<Error> {
        return this.errorEmitter.event;
    }

    protected emitOnExit(code: number, signal?: string) {
        const exitEvent = { code, signal };
        this.handleOnExit(exitEvent);
        this.exitEmitter.fire(exitEvent);
    }

    protected handleOnExit(event: IProcessExitEvent) {
        this._killed = true;
        const signalSuffix = event.signal ? `, signal: ${event.signal}` : '';

        this.logger.debug(`Process ${this.pid} has exited with code ${event.code}${signalSuffix}.`,
            this.options.command, this.options.args);
    }

    protected emitOnError(err: Error) {
        this.handleOnError(err);
        this.errorEmitter.fire(err);
    }

    protected handleOnError(error: Error) {
        this._killed = true;
        this.logger.error(error.toString());
    }

}
