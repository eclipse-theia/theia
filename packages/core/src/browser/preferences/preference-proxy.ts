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

import { Disposable, DisposableCollection, Event, Emitter } from '../../common';
import { PreferenceService } from './preference-service';
import { PreferenceSchema, OverridePreferenceName } from './preference-contribution';

export interface PreferenceChangeEvent<T> {
    readonly preferenceName: keyof T;
    readonly newValue?: T[keyof T];
    readonly oldValue?: T[keyof T];
    affects(resourceUri?: string, overrideIdentifier?: string): boolean;
}

export interface PreferenceEventEmitter<T> {
    readonly onPreferenceChanged: Event<PreferenceChangeEvent<T>>;
    readonly ready: Promise<void>;
}

export interface PreferenceRetrieval<T> {
    get<K extends keyof T>(preferenceName: K | {
        preferenceName: K,
        overrideIdentifier?: string
    }, defaultValue?: T[K], resourceUri?: string): T[K];
}

export type PreferenceProxy<T> = Readonly<T> & Disposable & PreferenceEventEmitter<T> & PreferenceRetrieval<T>;

export function createPreferenceProxy<T>(preferences: PreferenceService, schema: PreferenceSchema): PreferenceProxy<T> {
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChangeEvent<T>>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        const overriden = preferences.overridenPreferenceName(e.preferenceName);
        const preferenceName: any = overriden ? overriden.preferenceName : e.preferenceName;
        if (schema.properties[preferenceName]) {
            const { newValue, oldValue } = e;
            onPreferenceChangedEmitter.fire({
                newValue, oldValue, preferenceName,
                affects: (resourceUri, overrideIdentifier) => {
                    if (overrideIdentifier !== undefined) {
                        if (overriden && overriden.overrideIdentifier !== overrideIdentifier) {
                            return false;
                        }
                    }
                    return e.affects(resourceUri);
                }
            });
        }
    }));

    const unsupportedOperation = (_: any, __: string) => {
        throw new Error('Unsupported operation');
    };
    const getValue: PreferenceRetrieval<any>['get'] = (arg, defaultValue, resourceUri) => {
        const preferenceName = typeof arg === 'object' && arg.overrideIdentifier ?
            preferences.overridePreferenceName(<OverridePreferenceName>arg) :
            <string>arg;
        return preferences.get(preferenceName, defaultValue, resourceUri);
    };
    return new Proxy({}, {
        get: (_, property: string) => {
            if (schema.properties[property]) {
                return preferences.get(property);
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
            if (property === 'get') {
                return getValue;
            }
            throw new Error(`unexpected property: ${property}`);
        },
        ownKeys: () => Object.keys(schema.properties),
        getOwnPropertyDescriptor: (_, property: string) => {
            if (schema.properties[property]) {
                return {
                    enumerable: true,
                    configurable: true
                };
            }
            return {};
        },
        set: unsupportedOperation,
        deleteProperty: unsupportedOperation,
        defineProperty: unsupportedOperation
    });
}
