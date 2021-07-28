/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import debounce = require('p-debounce');
import { injectable, inject } from 'inversify';
import { JSONExt, JSONValue } from '@phosphor/coreutils';
import URI from '../../common/uri';
import { Disposable, DisposableCollection, Emitter, Event } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceScope } from './preference-scope';
import { PreferenceLanguageOverrideService } from './preference-language-override-service';

export interface PreferenceProviderDataChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
    readonly scope: PreferenceScope;
    readonly domain?: string[];
}

export namespace PreferenceProviderDataChange {
    export function affects(change: PreferenceProviderDataChange, resourceUri?: string): boolean {
        const resourcePath = resourceUri && new URI(resourceUri).path;
        const domain = change.domain;
        return !resourcePath || !domain || domain.some(uri => new URI(uri).path.relativity(resourcePath) >= 0);
    }
}

export interface PreferenceProviderDataChanges {
    [preferenceName: string]: PreferenceProviderDataChange;
}

export interface PreferenceResolveResult<T> {
    configUri?: URI
    value?: T
}
/**
 * The {@link PreferenceProvider} is used to store and retrieve preference values. A {@link PreferenceProvider} does not operate in a global scope but is
 * configured for one or more {@link PreferenceScope}s. The (default implementation for the) {@link PreferenceService} aggregates all {@link PreferenceProvider}s and
 * serves as a common facade for manipulating preference values.
 */
@injectable()
export abstract class PreferenceProvider implements Disposable {

    @inject(PreferenceLanguageOverrideService) protected readonly preferenceOverrideService: PreferenceLanguageOverrideService;

    protected readonly onDidPreferencesChangedEmitter = new Emitter<PreferenceProviderDataChanges>();
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    protected readonly _ready = new Deferred<void>();

    constructor() {
        this.toDispose.push(this.onDidPreferencesChangedEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected deferredChanges: PreferenceProviderDataChanges | undefined;
    protected _pendingChanges: Promise<boolean> = Promise.resolve(false);
    get pendingChanges(): Promise<boolean> {
        return this._pendingChanges;
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
        return this._pendingChanges = this.fireDidPreferencesChanged();
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

    /**
     * Retrieve the stored value for the given preference and resource URI.
     *
     * @param preferenceName the preference identifier.
     * @param resourceUri the uri of the resource for which the preference is stored. This is used to retrieve
     * a potentially different value for the same preference for different resources, for example `files.encoding`.
     *
     * @returns the value stored for the given preference and resourceUri if it exists, otherwise `undefined`.
     */
    get<T>(preferenceName: string, resourceUri?: string): T | undefined {
        return this.resolve<T>(preferenceName, resourceUri).value;
    }

    /**
     * Resolve the value for the given preference and resource URI.
     *
     * @param preferenceName the preference identifier.
     * @param resourceUri the URI of the resource for which this provider should resolve the preference. This is used to retrieve
     * a potentially different value for the same preference for different resources, for example `files.encoding`.
     *
     * @returns an object containing the value stored for the given preference and resourceUri if it exists,
     * otherwise `undefined`.
     */
    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        const value = this.getPreferences(resourceUri)[preferenceName];
        if (value !== undefined) {
            return {
                value,
                configUri: this.getConfigUri(resourceUri)
            };
        }
        return {};
    }

    abstract getPreferences(resourceUri?: string): { [p: string]: any };

    /**
     * Stores a new value for the given preference key in the provider.
     * @param key the preference key (typically the name).
     * @param value the new preference value.
     * @param resourceUri the URI of the resource for which the preference is stored.
     *
     * @returns a promise that only resolves if all changes were delivered.
     * If changes were made then implementation must either
     * await on `this.emitPreferencesChangedEvent(...)` or
     * `this.pendingChanges` if changes are fired indirectly.
     */
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

    /**
     * Retrieve the configuration URI for the given resource URI.
     * @param resourceUri the uri of the resource or `undefined`.
     * @param sectionName the section to return the URI for, e.g. `tasks` or `launch`. Defaults to settings.
     *
     * @returns the corresponding resource URI or `undefined` if there is no valid URI.
     */
    getConfigUri(resourceUri?: string, sectionName?: string): URI | undefined {
        return undefined;
    }

    /**
     * Retrieves the first valid configuration URI contained by the given resource.
     * @param resourceUri the uri of the container resource or `undefined`.
     *
     * @returns the first valid configuration URI contained by the given resource `undefined`
     * if there is no valid configuration URI at all.
     */
    getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;

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

    protected getParsedContent(jsonData: any): { [key: string]: any } {
        const preferences: { [key: string]: any } = {};
        if (typeof jsonData !== 'object') {
            return preferences;
        }
        // eslint-disable-next-line guard-for-in
        for (const preferenceName in jsonData) {
            const preferenceValue = jsonData[preferenceName];
            if (this.preferenceOverrideService.testOverrideValue(preferenceName, preferenceValue)) {
                // eslint-disable-next-line guard-for-in
                for (const overriddenPreferenceName in preferenceValue) {
                    const overriddenValue = preferenceValue[overriddenPreferenceName];
                    preferences[`${preferenceName}.${overriddenPreferenceName}`] = overriddenValue;
                }
            } else {
                preferences[preferenceName] = preferenceValue;
            }
        }
        return preferences;
    }
}
