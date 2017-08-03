/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable, DisposableCollection, Event, Emitter } from '@theia/core/lib/common';
import { PreferenceService, PreferenceChange } from "./preference-service";
import { PreferenceSchema } from "./preference-contribution"
import * as Ajv from "ajv";

export type Configuration = {
    [preferenceName: string]: any
}
export type PreferenceEventEmitter<T> = {
    readonly onPreferenceChanged: Event<{
        readonly preferenceName: keyof T
        readonly newValue?: T[keyof T]
        readonly oldValue?: T[keyof T]
    }>;

    readonly ready: Promise<void>;
};
export type PreferenceProxy<T> = Readonly<T> & Disposable & PreferenceEventEmitter<T>;
export function createPreferenceProxy<T extends Configuration>(preferences: PreferenceService, configuration: T, schema: PreferenceSchema): PreferenceProxy<T> {
    const ajv = new Ajv();
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        if (e.preferenceName in configuration) {
            if (e.newValue) {
                // Fire the pref if it's valid according to the schema
                if (ajv.validate(schema, {
                    properties: {
                        [e.preferenceName]: e.newValue
                    }
                })) {
                    onPreferenceChangedEmitter.fire(e);
                } else {
                    // Fire the default preference
                    onPreferenceChangedEmitter.fire({
                        preferenceName: e.preferenceName,
                        newValue: configuration[e.preferenceName]
                    });
                }
            } else {
                // Fire the default preference
                onPreferenceChangedEmitter.fire({
                    preferenceName: e.preferenceName,
                    newValue: configuration[e.preferenceName]
                });
            }
        }
    }));
    return new Proxy({} as any, {
        get: (_, p: string) => {
            if (p in configuration) {
                return preferences.get(p, configuration[p]);
            }
            if (p === 'onPreferenceChanged') {
                return onPreferenceChangedEmitter.event;
            }
            if (p === 'dispose') {
                return () => toDispose.dispose();
            }
            if (p === 'ready') {
                return () => preferences.ready;
            }
            throw new Error('unexpected property: ' + p);
        }
    })
}