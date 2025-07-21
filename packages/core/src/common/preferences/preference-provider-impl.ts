// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import debounce = require('p-debounce');
import { injectable } from 'inversify';
import { JSONExt, JSONObject, JSONValue } from '@lumino/coreutils';
import URI from '../../common/uri';
import { DisposableCollection, Emitter, Event, isObject, PreferenceLanguageOverrideService } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceProviderDataChanges, PreferenceResolveResult } from './preference-provider';

export abstract class PreferenceProviderBase {

    protected readonly onDidPreferencesChangedEmitter = new Emitter<PreferenceProviderDataChanges>();
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    protected deferredChanges: PreferenceProviderDataChanges | undefined;

    constructor() {
        this.toDispose.push(this.onDidPreferencesChangedEmitter);
    }

    /**
     * Informs the listeners that one or more preferences of this provider are changed.
     * The listeners are able to find what was changed from the emitted event.
     */
    protected emitPreferencesChangedEvent(changes: PreferenceProviderDataChanges | PreferenceProviderDataChange[]): Promise<boolean> {
        if (Array.isArray(changes)) {
            for (const change of changes) {
                this.mergePreferenceProviderDataChange(change);
            }
        } else {
            for (const preferenceName of Object.keys(changes)) {
                this.mergePreferenceProviderDataChange(changes[preferenceName]);
            }
        }
        return this.fireDidPreferencesChanged();
    }

    protected mergePreferenceProviderDataChange(change: PreferenceProviderDataChange): void {
        if (!this.deferredChanges) {
            this.deferredChanges = {};
        }
        const current = this.deferredChanges[change.preferenceName];
        const { newValue, scope, domain } = change;
        if (!current) {
            // new
            this.deferredChanges[change.preferenceName] = change;
        } else if (current.oldValue === newValue) {
            // delete
            delete this.deferredChanges[change.preferenceName];
        } else {
            // update
            Object.assign(current, { newValue, scope, domain });
        }
    }

    protected fireDidPreferencesChanged = debounce(() => {
        const changes = this.deferredChanges;
        this.deferredChanges = undefined;
        if (changes && Object.keys(changes).length) {
            this.onDidPreferencesChangedEmitter.fire(changes);
            return true;
        }
        return false;
    }, 0);

    dispose(): void {
        this.toDispose.dispose();
    }

}

/**
 * The {@link PreferenceProvider} is used to store and retrieve preference values. A {@link PreferenceProvider} does not operate in a global scope but is
 * configured for one or more {@link PreferenceScope}s. The (default implementation for the) {@link PreferenceService} aggregates all {@link PreferenceProvider}s and
 * serves as a common facade for manipulating preference values.
 */
@injectable()
export abstract class PreferenceProviderImpl extends PreferenceProviderBase implements PreferenceProvider {

    protected readonly _ready = new Deferred<void>();

    constructor() {
        super();
    }

    get<T>(preferenceName: string, resourceUri?: string): T | undefined {
        return this.resolve<T>(preferenceName, resourceUri).value;
    }

    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        const value = this.getPreferences(resourceUri)[preferenceName];
        if (value !== undefined) {
            return {
                value: value as T,
                configUri: this.getConfigUri(resourceUri)
            };
        }
        return {};
    }

    abstract getPreferences(resourceUri?: string): JSONObject;
    abstract setPreference(key: string, value: any, resourceUri?: string): Promise<boolean>;

    /**
     * Resolved when the preference provider is ready to provide preferences
     * It should be resolved by subclasses.
     */
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    /**
     * Retrieve the domain for this provider.
     *
     * @returns the domain or `undefined` if this provider is suitable for all domains.
     */
    getDomain(): string[] | undefined {
        return undefined;
    }

    getConfigUri(resourceUri?: string, sectionName?: string): URI | undefined {
        return undefined;
    }

    getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;

    protected getParsedContent(jsonData: any): { [key: string]: any } {
        const preferences: { [key: string]: any } = {};
        if (!isObject(jsonData)) {
            return preferences;
        }
        for (const [preferenceName, preferenceValue] of Object.entries(jsonData)) {
            if (PreferenceLanguageOverrideService.testOverrideValue(preferenceName, preferenceValue)) {
                for (const [overriddenPreferenceName, overriddenValue] of Object.entries(preferenceValue)) {
                    preferences[`${preferenceName}.${overriddenPreferenceName}`] = overriddenValue;
                }
            } else {
                preferences[preferenceName] = preferenceValue;
            }
        }
        return preferences;
    }

    static merge(source: JSONValue | undefined, target: JSONValue): JSONValue {
        if (source === undefined || !JSONExt.isObject(source)) {
            return JSONExt.deepCopy(target);
        }
        if (JSONExt.isPrimitive(target)) {
            return {};
        }
        for (const key of Object.keys(target)) {
            const value = (target as any)[key];
            if (key in source) {
                if (JSONExt.isObject(source[key]) && JSONExt.isObject(value)) {
                    this.merge(source[key], value);
                    continue;
                } else if (JSONExt.isArray(source[key]) && JSONExt.isArray(value)) {
                    source[key] = [...JSONExt.deepCopy(source[key] as any), ...JSONExt.deepCopy(value)];
                    continue;
                }
            }
            source[key] = JSONExt.deepCopy(value);
        }
        return source;
    }

    /**
     * Handles deep equality with the possibility of `undefined`
     */
    static deepEqual(a: JSONValue | undefined, b: JSONValue | undefined): boolean {
        if (a === b) { return true; }
        if (a === undefined || b === undefined) { return false; }
        return JSONExt.deepEqual(a, b);
    }

    canHandleScope(scope: PreferenceScope): boolean {
        return true;
    }
}
