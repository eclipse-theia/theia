/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection } from '../../application/common';
import { PreferenceServer, PreferenceChangedEvent } from './preference-protocol';

export {
    PreferenceChangedEvent
}

@injectable()
export class PreferenceService implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChangedEvent>();

    constructor(
        @inject(PreferenceServer) protected readonly server: PreferenceServer
    ) {
        server.setClient({
            onDidChangePreference: event => this.onDidChangePreference(event)
        });
        this.toDispose.push(server);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onDidChangePreference(event: PreferenceChangedEvent): void {
        this.onPreferenceChangedEmitter.fire(event);
    }

    get onPreferenceChanged(): Event<PreferenceChangedEvent> {
        return this.onPreferenceChangedEmitter.event;
    }

    has(preferenceName: string): Promise<boolean> {
        return this.server.has(preferenceName);
    }

    get<T>(preferenceName: string): Promise<T | undefined>;
    get<T>(preferenceName: string, defaultValue: T): Promise<T>;
    get<T>(preferenceName: string, defaultValue?: T): Promise<T | undefined> {
        return this.server.get<T>(preferenceName).then(value =>
            value !== undefined ? value : defaultValue
        );
    }

    getBoolean(preferenceName: string): Promise<boolean | undefined>;
    getBoolean(preferenceName: string, defaultValue: boolean): Promise<boolean>;
    getBoolean(preferenceName: string, defaultValue?: boolean): Promise<boolean | undefined> {
        return this.server.get(preferenceName).then(value =>
            value !== undefined ? !!value : defaultValue
        );
    }

    getString(preferenceName: string): Promise<string | undefined>;
    getString(preferenceName: string, defaultValue: string): Promise<string>;
    getString(preferenceName: string, defaultValue?: string): Promise<string | undefined> {
        return this.server.get(preferenceName).then(value => {
            if (value === undefined) {
                return defaultValue;
            }
            if (typeof value === "string") {
                return value;
            }
            return value.toString();
        });
    }

    getNumber(preferenceName: string): Promise<number | undefined>;
    getNumber(preferenceName: string, defaultValue: number): Promise<number>;
    getNumber(preferenceName: string, defaultValue?: number): Promise<number | undefined> {
        return this.server.get(preferenceName).then(value => {
            if (value === undefined) {
                return defaultValue;
            }
            if (typeof value === "number") {
                return value;
            }
            return Number(value);
        });
    }

}