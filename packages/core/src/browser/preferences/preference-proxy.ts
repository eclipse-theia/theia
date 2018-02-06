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
export function createPreferenceProxy<T extends Configuration>(preferences: PreferenceService, schema: PreferenceSchema): PreferenceProxy<T> {
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(change => {
        if (change.preferenceName in schema.properties) {
            /* Can't simply use change.newValue as this could be a boolean */
            if (change.newValue !== undefined) {
                // Fire the pref if it's valid according to the schema
                if (validatePreference(schema, {
                    [change.preferenceName]: change.newValue
                })) {
                    onPreferenceChangedEmitter.fire(change);
                } else {
                    // Fire the default preference
                    onPreferenceChangedEmitter.fire({
                        preferenceName: change.preferenceName,
                        newValue: schema.properties[change.preferenceName].default || undefined
                    });
                }
            } else {
                /* Deleted preference, fire the default preference */
                onPreferenceChangedEmitter.fire({
                    preferenceName: change.preferenceName,
                    newValue: schema.properties[change.preferenceName].default || undefined,
                    oldValue: change.oldValue
                });
            }
        }
    }));

    /* Create a targer object with only the property names as properties, removing "type" and other stuff from the schema */
    const targetConfig: Configuration = {};
    Object.keys(schema.properties).forEach(prop => {
        targetConfig[prop];
    });
    // tslint:disable-next-line:no-any
    return new Proxy((targetConfig as any), {
        get: (_, p: string) => {
            if (p in schema.properties) {
                const preference = preferences.get(p, schema.properties[p].default);
                if (preference) {
                    if (validatePreference(schema, {
                        [p]: preference
                    })) {
                        return preference;
                    } else {
                        return schema.properties[p].default || undefined;
                    }
                }
                return undefined;
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
