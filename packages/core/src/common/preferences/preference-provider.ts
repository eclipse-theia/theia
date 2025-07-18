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

    canHandleScope(scope: PreferenceScope): boolean;

    get<T>(preferenceName: string, resourceUri?: string): T | undefined;
    setPreference(key: string, value: JSONValue, resourceUri?: string): Promise<boolean>
    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T>;

    getConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;
    getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;

    getPreferences(): JSONObject;
}

export namespace PreferenceUtils {
    /**
     * Handles deep equality with the possibility of `undefined`
     */
    export function deepEqual(a: JSONValue | undefined, b: JSONValue | undefined): boolean {
        if (a === b) { return true; }
        if (a === undefined || b === undefined) { return false; }
        return JSONExt.deepEqual(a, b);
    }

}
