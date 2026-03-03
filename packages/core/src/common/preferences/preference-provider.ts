// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { JSONExt, JSONObject, JSONValue } from '@lumino/coreutils';
import { Event } from '../event';
import { PreferenceScope } from '../preferences/preference-scope';
import { URI } from '../uri';
import { Disposable } from 'vscode-languageserver-protocol';

export interface PreferenceProviderDataChange {
    /**
     * The name of the changed preference.
     */
    readonly preferenceName: string;
    /**
     * The new value of the changed preference.
     * Can be `undefined` for multiple reasons:
     * - The preference has been reset to its default value.
     * - The preference has been reset and has no value explicitly stored.
     * If `undefined`, use the preference service to determine the effective new value if needed.
     */
    readonly newValue?: JSONValue;
    /**
     * The old value of the changed preference.
     */
    readonly oldValue?: JSONValue;
    /**
     * The {@link PreferenceScope} of the changed preference.
     */
    readonly scope: PreferenceScope;
    /**
     * URIs of the scopes in which this change applies.
     */
    readonly domain?: string[];
}

export namespace PreferenceProviderDataChange {
    export function affects(change: PreferenceProviderDataChange, resourceUri?: string): boolean {
        const resourcePath = resourceUri && new URI(resourceUri).path;
        const domain = change.domain;
        return !resourcePath || !domain || domain.some(uri => new URI(uri).path.relativity(resourcePath) >= 0);
    }
}

export interface PreferenceResolveResult<T> {
    configUri?: URI;
    value?: T
}

export interface PreferenceProviderDataChanges {
    [preferenceName: string]: PreferenceProviderDataChange;
}
export const PreferenceProvider = Symbol('PreferenceProvider');

export interface PreferenceProvider extends Disposable {
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges>;
    ready: Promise<void>

    /**
     * Whether t
     * @param scope the scope to handle
     */
    canHandleScope(scope: PreferenceScope): boolean;

    /**
     * Retrieve the stored value for the given preference and resource URI.
     *
     * @param preferenceName the preference identifier.
     * @param resourceUri the uri of the resource for which the preference is stored. This is used to retrieve
     * a potentially different value for the same preference for different resources, for example `files.encoding`.
     *
     * @returns the value stored for the given preference and resourceUri if it exists, otherwise `undefined`.
     */
    get<T>(preferenceName: string, resourceUri?: string): T | undefined;
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
    setPreference(key: string, value: JSONValue, resourceUri?: string): Promise<boolean>
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
    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T>;

    /**
     * Retrieve the configuration URI for the given resource URI.
     * @param resourceUri the uri of the resource or `undefined`.
     * @param sectionName the section to return the URI for, e.g. `tasks` or `launch`. Defaults to settings.
     *
     * @returns the corresponding resource URI or `undefined` if there is no valid URI.
     */
    getConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;
    /**
     * Retrieves the first valid configuration URI contained by the given resource.
     * @param resourceUri the uri of the container resource or `undefined`.
     *
     * @returns the first valid configuration URI contained by the given resource `undefined`
     * if there is no valid configuration URI at all.
     */
    getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;

    /**
     * Return a JSONObject with all preferences stored in this preference provider
     */
    getPreferences(resourceUri?: string): JSONObject;
}

export namespace PreferenceUtils {
    export function merge(source: JSONValue | undefined, target: JSONValue): JSONValue {
        if (source === undefined || !JSONExt.isObject(source)) {
            return JSONExt.deepCopy(target);
        }
        if (JSONExt.isPrimitive(target)) {
            return {};
        }
        for (const [key, value] of Object.entries(target)) {
            if (key in source) {
                const sourceValue = source[key];
                if (JSONExt.isObject(sourceValue) && JSONExt.isObject(value)) {
                    merge(sourceValue, value);
                    continue;
                } else if (JSONExt.isArray(sourceValue) && JSONExt.isArray(value)) {
                    source[key] = [...JSONExt.deepCopy(sourceValue), ...JSONExt.deepCopy(value)];
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
    export function deepEqual(a: JSONValue | undefined, b: JSONValue | undefined): boolean {
        if (a === b) { return true; }
        if (a === undefined || b === undefined) { return false; }
        return JSONExt.deepEqual(a, b);
    }

}
