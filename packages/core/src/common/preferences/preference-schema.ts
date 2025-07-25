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
    /**
     * Resolves after static contribution have been processed
     */
    readonly ready: Promise<void>;
    /**
     * Register an override identifier for language specific preferences
     * @param overrideIdentifier The identifier to register
     * @returns A disposable to unregister the identifier
     */
    registerOverrideIdentifier(overrideIdentifier: string): Disposable;
    readonly overrideIdentifiers: ReadonlySet<string>;

    /**
     * Add a preference schema. It is an error to register the same property in two different schemas
     * @param schema The schema to add
     * @returns A disposable to remove the schema
     */
    addSchema(schema: PreferenceSchema): Disposable;

    /**
     * The scopes which this preference schema service handles. Any properties that are not applicable within the
     * valid scopes will be ignored
     */
    readonly validScopes: readonly PreferenceScope[];
    /**
     * Check if a preference is valid in a specific scope
     * @param preferenceName The preference name
     * @param scope The scope to check
     * @returns True if the preference is valid in the given scope
     */
    isValidInScope(preferenceName: string, scope: PreferenceScope): boolean;
    getSchemaProperty(key: string): PreferenceDataProperty | undefined;
    getSchemaProperties(): ReadonlyMap<string, PreferenceDataProperty>;

    /**
     * Update a property in the schema. The corresponding JSON Schemas, etc. will be updated
     * @param key The property key
     * @param property The updated property
     */
    updateSchemaProperty(key: string, property: PreferenceDataProperty): void;

    /**
     * Register an override for a preference default value. If multiple overrides are registered for the same value,
     * the last override will be in effect. Removing the last override will make the second-to-last override active, etc.
     * @param key The preference key
     * @param overrideIdentifier The override identifier, undefined for global default
     * @param value The default value
     * @returns A disposable to unregister the override
     */
    registerOverride(key: string, overrideIdentifier: string | undefined, value: JSONValue): Disposable;
    /**
     * Get the default value for a preference. This is the value a client will see for the given key/override
     * @param key The preference key
     * @param overrideIdentifier The override identifier, undefined for global default
     * @returns The default value or undefined if not found
     */
    getDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined;
    /**
     * Gets the default value for a preference. This method not fall back to the global value if no override is given
     * @param key The preference key
     * @param overrideIdentifier The override identifier, undefined for global default
     * @returns The default value or undefined if not found
     */
    inspectDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined;

    /**
     * Gets a JSON schema a preference.json file for the given scope.
     * @param scope The scope to generate schema for
     * @returns The JSON schema
     */
    getJSONSchema(scope: PreferenceScope): IJSONSchema;
    /**
     * Get the collection of all defined default values as JSONObject of the form like in a preferences.json
     *
     * #### Example usage
     * ```json
     * {
     *   "my.preference": "a string default",
     *   "[typescript]": {
     *      "another.preference": 39
     *   }
     * }
     */
    getDefaultValues(): JSONObject;

    // Public events
    onDidChangeDefaultValue: Event<DefaultValueChangedEvent>;
    onDidChangeSchema: Event<void>;
}

