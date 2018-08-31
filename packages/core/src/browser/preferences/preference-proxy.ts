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
import { PreferenceService, PreferenceChange } from './preference-service';
import { PreferenceSchema } from './preference-contribution';

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
export function createPreferenceProxy<T>(preferences: PreferenceService, schema: PreferenceSchema): PreferenceProxy<T> {
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        if (schema.properties[e.preferenceName]) {
            onPreferenceChangedEmitter.fire(e);
        }
    }));
    const unsupportedOperation = (_: any, __: string) => {
        throw new Error('Unsupported operation');
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
            throw new Error('unexpected property: ' + property);
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
