/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { Disposable, DisposableCollection, Event, Emitter, deepFreeze } from '../../common';
import { PreferenceService, PreferenceChange } from "./preference-service";
import { PreferenceSchema } from "./preference-contribution";
import * as Ajv from "ajv";

export interface Configuration {
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
    const configuration = createConfiguration<T>(schema);
    const ajv = new Ajv();
    const validateFunction = ajv.compile(schema);
    const validate = (name: string, value: any) => validateFunction({ [name]: value });
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        if (e.preferenceName in configuration) {
            if (e.newValue !== undefined) {
                if (validate(e.preferenceName, e.newValue)) {
                    onPreferenceChangedEmitter.fire(e);
                } else {
                    onPreferenceChangedEmitter.fire({
                        preferenceName: e.preferenceName,
                        newValue: configuration[e.preferenceName]
                    });
                }
            } else {
                onPreferenceChangedEmitter.fire({
                    preferenceName: e.preferenceName,
                    newValue: configuration[e.preferenceName],
                    oldValue: e.oldValue
                });
            }
        }
    }));
    const unsupportedOperation = (_: any, property: string) => {
        throw new Error('Unsupported operation');
    };
    return new Proxy(configuration as any, {
        get: (_, property: string) => {
            if (property in configuration) {
                const preference = preferences.get(property, configuration[property]);
                if (validate(property, preference)) {
                    return preference;
                } else {
                    return configuration[property];
                }
            }
            if (property === 'onPreferenceChanged') {
                return onPreferenceChangedEmitter.event;
            }
            if (property === 'dispose') {
                return () => toDispose.dispose();
            }
            if (property === 'ready') {
                return preferences.ready;
            }
            throw new Error('unexpected property: ' + property);
        },
        set: unsupportedOperation,
        deleteProperty: unsupportedOperation,
        defineProperty: unsupportedOperation
    });
}

function createConfiguration<T extends Configuration>(schema: PreferenceSchema): T {
    const configuration = {} as T;
    // tslint:disable-next-line:forin
    for (const property in schema.properties) {
        configuration[property] = deepFreeze(schema.properties[property].default);
    }
    return configuration;
}
