// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
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

import { JSONObject, JSONValue } from '@lumino/coreutils';
import { IJSONSchema } from '../json-schema';
import { PreferenceScope } from './preference-scope';
import { Event } from '../event';
import { Disposable } from '../disposable';

export const PreferenceContribution = Symbol('PreferenceContribution');
/**
 * A {@link PreferenceContribution} allows adding additional custom preferences.
 * For this, the {@link PreferenceContribution} has to provide a valid JSON Schema specifying which preferences
 * are available including their types and description.
 *
 * ### Example usage
 * ```typescript
 * const MyPreferencesSchema: PreferenceSchema = {
 *     'scope': PreferenceScope.Default,
 *     'properties': {
 *         'myext.decorations.enabled': {
 *             'type': 'boolean',
 *             'description': 'Show file status',
 *             'default': true
 *         },
 *         // [...]
 *     }
 * }
 * @injectable()
 * export class MyPreferenceContribution implements PreferenceContribution{
 *     schema= MyPreferencesSchema;
 * }
 * ```
 */
export interface PreferenceContribution {
    readonly schema?: PreferenceSchema;
    initSchema?(service: PreferenceSchemaService): Promise<void>
}

export interface IndexedAccess<T> {
    [name: string]: T;
}

export interface PreferenceSchema {
    scope?: PreferenceScope,
    title?: string,
    defaultOverridable?: boolean;
    properties: IndexedAccess<PreferenceDataProperty>;
}

export interface PreferenceDataProperty extends IJSONSchema {
    overridable?: boolean;
    /** If false, the preference will not be included in the schema or the UI. */
    included?: boolean;
    /** If true, this item will registered as part of the preference schema, but hidden in the preference editor UI. */
    hidden?: boolean;
    scope?: PreferenceScope;
    typeDetails?: any;
    tags?: string[]
}

export interface DefaultValueChangedEvent {
    key: string;
    overrideIdentifier?: string;
    otherAffectedOverrides: string[];
    oldValue: JSONValue | undefined;
    newValue: JSONValue | undefined;
}
export const PreferenceSchemaService = Symbol('PreferenceSchemaService');
export interface PreferenceSchemaService {
    readonly ready: Promise<void>;
    registerOverrideIdentifier(overrideIdentifier: string): Disposable;
    readonly overrideIdentifiers: ReadonlySet<string>;
    addSchema(schema: PreferenceSchema): Disposable;
    readonly validScopes: readonly PreferenceScope[];
    isValidInScope(preferenceName: string, scope: PreferenceScope): boolean;
    getSchemaProperty(key: string): PreferenceDataProperty | undefined;
    getProperties(): ReadonlyMap<string, PreferenceDataProperty>;
    updateSchemaProperty(key: string, property: PreferenceDataProperty): void;
    registerOverride(key: string, overrideIdentifier: string | undefined, value: JSONValue): Disposable;
    getDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined;
    inspectDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined;
    getJSONSchema(scope: PreferenceScope): IJSONSchema;
    getDefaultValues(): JSONObject;

    onDidChangeDefaultValue: Event<DefaultValueChangedEvent>;
    onDidChangeSchema: Event<void>;
}

