/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { inject, injectable } from 'inversify';
import { DebugSessionManager } from './debug-session-manager';
import { IDebugger } from './debugger';

export const IDebugSession = Symbol("IDebugSession");
export const IDebugSessionFactory = Symbol("IDebugSessionFactory");

export interface IDebugSession {
    id: number,
    start(options: object): void;
    debugger: IDebugger;
}

@injectable()
export abstract class DebugSession implements IDebugSession {

    public readonly id: number;
    public abstract debugger: IDebugger;

    constructor( @inject(DebugSessionManager) protected readonly manager: DebugSessionManager) {
        this.id = manager.register(this);
    }

    public abstract start(options: object): void;
}
