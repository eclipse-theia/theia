/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { ILogger } from '../../common/logger';
import * as child from 'child_process';
import * as stream from 'stream';
import { Emitter, Event } from '../../common/event';
import { Disposable } from '../../common/disposable';

export interface IProcessExitEvent {
    code: number,
    signal?: string
}

@injectable()
export abstract class Process implements Disposable {

    abstract readonly type: 'Raw' | 'Terminal';
    abstract pid: number;
    killed = false;
    abstract output: stream.Readable;
    protected abstract process: child.ChildProcess | undefined;
    protected abstract terminal: any;
    protected readonly exitEmitter = new Emitter<IProcessExitEvent>();
    protected readonly errorEmitter = new Emitter<Error>();

    constructor(protected readonly logger: ILogger) {
        this.exitEmitter.event(this.handleOnExit.bind(this));
        this.errorEmitter.event(this.handleOnError.bind(this));
    }

    abstract kill(signal?: string): void;

    get onExit(): Event<IProcessExitEvent> {
        return this.exitEmitter.event;

    }

    get onError(): Event<Error> {
        return this.errorEmitter.event;

    }

    dispose() {
        if (this.killed === false) {
            const p = new Promise<void>(resolve => {
                this.kill();
                this.exitEmitter.event(event => resolve());
            });
            p.then(() => {
                this.exitEmitter.dispose();
                this.errorEmitter.dispose();
            });
        } else {
            this.exitEmitter.dispose();
            this.errorEmitter.dispose();
        }
    }

    protected emitOnExit(code: number, signal?: string) {
        this.exitEmitter.fire({ 'code': code, 'signal': signal });
    }

    protected handleOnExit(event: IProcessExitEvent) {
        this.killed = true;
        let logMsg = `Process ${this.pid} has exited with code ${event.code}`;

        if (event.signal !== undefined) {
            logMsg += `, signal : ${event.signal}.`;
        }
        this.logger.info(logMsg);

    }

    protected emitOnError(err: Error) {
        this.errorEmitter.fire(err);
    }

    protected handleOnError(error: Error) {
        this.killed = true;
        this.logger.error(error.toString());
    }
}
