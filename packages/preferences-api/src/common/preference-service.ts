/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Event, Emitter, Disposable, DisposableCollection } from '@theia/core/lib/common';
import { PreferenceServer, PreferenceChangedEvent } from './preference-protocol';

export {
    PreferenceChangedEvent
}

@injectable()
export class PreferenceService implements Disposable {
    protected prefCache: { [key: string]: any } = {};

    protected readonly toDispose = new DisposableCollection();
    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChangedEvent>();
    protected isReady: Promise<void>;

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

    ready(): Promise<void> {
        return this.isReady;
    }

    protected onDidChangePreference(event: PreferenceChangedEvent): void {
        if (this.prefCache === undefined) { // First event
            this.prefCache = event.newValue;
        } else {
            // Pref removed
            if (event.oldValue !== undefined && event.newValue === undefined) {
                delete this.prefCache[event.preferenceName];
            } else if (event.newValue !== undefined) {
                this.prefCache[event.preferenceName] = event.newValue;
            }
            this.onPreferenceChangedEmitter.fire(event);
        }

        Promise.resolve(this.ready);
        this.onPreferenceChangedEmitter.fire(event);
    }

    get onPreferenceChanged(): Event<PreferenceChangedEvent> {
        return this.onPreferenceChangedEmitter.event;
    }

    has(preferenceName: string): boolean {
        return this.prefCache[preferenceName] !== undefined;
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue?: T): T | undefined {
        const value = this.prefCache[preferenceName];
        return value !== null && value !== undefined ? value : defaultValue;
    }

    getBoolean(preferenceName: string): boolean | undefined;
    getBoolean(preferenceName: string, defaultValue: boolean): boolean;
    getBoolean(preferenceName: string, defaultValue?: boolean): boolean | undefined {
        const value = this.prefCache[preferenceName];
        return value !== null && value !== undefined ? !!value : defaultValue;
    }

    getString(preferenceName: string): string | undefined;
    getString(preferenceName: string, defaultValue: string): string;
    getString(preferenceName: string, defaultValue?: string): string | undefined {
        const value = this.prefCache[preferenceName];
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === "string") {
            return value;
        }
        return value.toString();
    }

    getNumber(preferenceName: string): number | undefined;
    getNumber(preferenceName: string, defaultValue: number): number;
    getNumber(preferenceName: string, defaultValue?: number): number | undefined {
        const value = this.prefCache[preferenceName];

        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === "number") {
            return value;
        }
        return Number(value);
    }
}