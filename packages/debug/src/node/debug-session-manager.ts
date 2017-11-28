/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import { IDebugSession } from './debug-session';


@injectable()
export class DebugSessionManager {

    protected readonly sessions: Map<number, IDebugSession> = new Map();
    protected id: number = 0;

    /* The current session id as selected from the UI, for now this is the last
     * registred session */
    public currentId: number = 0;

    register(session: IDebugSession): number {
        const id = this.id;
        this.sessions.set(id, session);
        this.id++;

        this.currentId = id;
        return id;
    }

    getCurrent() {
        return this.sessions.get(this.currentId);
    }

    get(id: number): IDebugSession | undefined {
        return this.sessions.get(id);
    }

    delete(id: number): void {
        this.sessions.delete(id);
    }
}