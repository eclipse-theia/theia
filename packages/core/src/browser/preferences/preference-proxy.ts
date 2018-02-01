/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable, DisposableCollection, Event, Emitter } from '../../common';
import { PreferenceService, PreferenceChange } from "./preference-service";
import { PreferenceSchema } from "./preference-contribution";
import * as Ajv from "ajv";

export interface Configuration {
    // tslint:disable-next-line:no-any
    [preferenceName: string]: any;
}
export interface PreferenceChangeEvent<T> {
    readonly preferenceName: keyof T
    readonly newValue?: T[keyof T]
    readonly oldValue?: T[keyof T]
}
export interface PreferenceEventEmitter<T> {
    readonly onPreferenceChanged: Event<PreferenceChangeEvent<T>>;

    readonly ready: Promise<void>;
}

export type PreferenceProxy<T> = Readonly<T> & Disposable & PreferenceEventEmitter<T>;
export function createPreferenceProxy<T extends Configuration>(preferences: PreferenceService, configuration: T, schema: PreferenceSchema): PreferenceProxy<T> {
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        if (e.preferenceName in schema.properties) {
            if (e.newValue) {
                // Fire the pref if it's valid according to the schema
                if (validatePreference(schema, {
                    [e.preferenceName]: e.newValue
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
                // TODO If it's deleted, fire the default preference
                onPreferenceChangedEmitter.fire(e);
            }
        }
    }));
    // tslint:disable-next-line:no-any
    return new Proxy(configuration as any, {
        get: (_, p: string) => {
            if (p in schema.properties) {
                if (p in configuration) {
                    const preference = preferences.get(p, configuration[p]);
                    if (validatePreference(schema, {
                        [p]: preference
                    })) {
                        return preference;
                    } else {
                        return configuration[p];
                    }
                } else {
                    return schema.properties[p].default || undefined;
                }
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
    });
}

function validatePreference(schema: PreferenceSchema, preference: Object): boolean {
    const ajv = new Ajv();
    const result = ajv.validate(schema, preference);
    // The return signature of `validate` is `boolean | Thenable<boolean>`.
    // Since it has never been a thenable and this method is needed in a synchonous context, we throw an error if it is not a boolean.
    if (typeof result === 'boolean') {
        return result;
    }
    throw new Error(`Ajv#validate return unexpected value ${result}`);
}
