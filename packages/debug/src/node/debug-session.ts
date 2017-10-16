/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import { DebugSessionManager } from './debug-session-manager';

export const IDebugSession = Symbol("IDebugSession");

export interface IDebugSession {
    start(options: object): void;
    getTerminal(): any;
}

@injectable()
export class DebugSession implements IDebugSession {

    protected readonly id: number;

    constructor(protected readonly manager: DebugSessionManager) {
        this.id = manager.register(this);
    }

    public start(options: object): void {
    }

    public getTerminal(): any {
        return undefined;
    }
}
