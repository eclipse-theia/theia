/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Event, Emitter } from '../../application/common/event'
import { PreferenceChangedEvent } from './preference-event'
import { IPreferenceClient, IPreferenceServer } from './preference-protocol'

export const IPreferenceService = Symbol("IPreferenceService")

export interface IPreferenceService {
    readonly onPreferenceChanged: Event<PreferenceChangedEvent>;

    has(preferenceName: string): Promise<boolean>;

    get<T>(preferenceName: string): Promise<T | undefined>;
    get<T>(preferenceName: string, defaultValue?: T): Promise<T>;


    getBoolean(preferenceName: string): Promise<boolean | undefined>;
    getBoolean(preferenceName: string, defaultValue?: boolean): Promise<boolean>;


    getString(preferenceName: string): Promise<string | undefined>;
    getString(preferenceName: string, defaultValue?: string): Promise<string>;


    getNumber(preferenceName: string): Promise<number | undefined>;
    getNumber(preferenceName: string, defaultValue?: number): Promise<number>;

}

@injectable()
export class PreferenceService implements IPreferenceService, IPreferenceClient {

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChangedEvent>();

    constructor(
        @inject(IPreferenceServer) protected readonly server: IPreferenceServer
    ) { }

    /**
     * Used to register for preference changes
     * this.prefService.onPreferenceChanged (callback);
     */
    get onPreferenceChanged(): Event<PreferenceChangedEvent> {
        return this.onPreferenceChangedEmitter.event;
    }

    /**
     * Used to notify preference changed listeners
     * @param event PreferenceChangedEvent that contains changed preferences
     */
    onDidChangePreference(event: PreferenceChangedEvent): void {
        this.onPreferenceChangedEmitter.fire(event);
    }

    has(preferenceName: string): Promise<boolean> {
        return this.server.has(preferenceName);
    }

    get<T>(preferenceName: string, defaultValue?: T): Promise<T> {
        return this.server.get<T>(preferenceName).then(result => result !== undefined ? result : (defaultValue ? defaultValue : undefined));
    }

    getBoolean(preferenceName: string, defaultValue?: boolean): Promise<boolean | undefined> {
        return this.server.get(preferenceName).then(result => result !== undefined ? !!result : (defaultValue ? defaultValue : undefined));
    }

    getString(preferenceName: string, defaultValue?: string): Promise<string | undefined> {
        return this.server.get(preferenceName).then(result => {
            if (result !== undefined) {
                if (typeof result !== "string") {
                    return result.toString();
                } else {
                    return result;
                }
            }
            return defaultValue ? defaultValue : undefined
        })
    }

    getNumber(preferenceName: string, defaultValue?: number): Promise<number | undefined> {
        return this.server.get(preferenceName).then(result => {
            if (result !== undefined) {
                if (typeof result !== "number") {
                    return parseInt(result.toString(), 10);
                } else {
                    return result;
                }
            }
            return defaultValue ? defaultValue : undefined
        })
    }
}