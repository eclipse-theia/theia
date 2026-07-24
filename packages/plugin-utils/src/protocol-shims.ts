// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

/**
 * Structural subset of `@theia/core` / `@theia/task` types used by normalize-contributions.
 * Keep in sync with:
 * `packages/core/src/common/json-schema.ts`,
 * `packages/core/src/common/preferences/preference-schema.ts`,
 * `packages/core/src/common/color.ts`,
 * `packages/task/src/common/task-protocol.ts`.
 */

export type JSONPrimitive = boolean | number | string | null;

export type JSONValue = JSONPrimitive | JSONObject | JSONValue[];

export interface JSONObject {
    [key: string]: JSONValue;
}

export type JsonType = 'string' | 'array' | 'number' | 'integer' | 'object' | 'boolean' | 'null';

export interface IJSONSchema {
    id?: string;
    $id?: string;
    $schema?: string;
    type?: JsonType | JsonType[];
    owner?: string;
    group?: string;
    title?: string;
    default?: JSONValue;
    definitions?: IJSONSchemaMap;
    description?: string;
    properties?: IJSONSchemaMap;
    patternProperties?: IJSONSchemaMap;
    additionalProperties?: boolean | IJSONSchema;
    minProperties?: number;
    maxProperties?: number;
    dependencies?: IJSONSchemaMap | { [prop: string]: string[] };
    items?: IJSONSchema | IJSONSchema[];
    prefixItems?: IJSONSchema[];
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    additionalItems?: boolean | IJSONSchema;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: boolean | number;
    exclusiveMaximum?: boolean | number;
    multipleOf?: number;
    required?: string[];
    $ref?: string;
    anyOf?: IJSONSchema[];
    allOf?: IJSONSchema[];
    oneOf?: IJSONSchema[];
    not?: IJSONSchema;
    enum?: JSONValue[];
    format?: string;
    const?: JSONValue;
    contains?: IJSONSchema;
    propertyNames?: IJSONSchema;
    $comment?: string;
    if?: IJSONSchema;
    then?: IJSONSchema;
    else?: IJSONSchema;
    defaultSnippets?: IJSONSchemaSnippet[];
    errorMessage?: string;
    patternErrorMessage?: string;
    deprecationMessage?: string;
    markdownDeprecationMessage?: string;
    enumItemLabels?: string[];
    enumDescriptions?: string[];
    markdownEnumDescriptions?: string[];
    markdownDescription?: string;
    doNotSuggest?: boolean;
    allowComments?: boolean;
    allowTrailingCommas?: boolean;
}

export interface IJSONSchemaMap {
    [name: string]: IJSONSchema;
}

export interface IJSONSchemaSnippet {
    label?: string;
    description?: string;
    body?: JSONValue;
    bodyText?: string;
}

/** Keep numeric values aligned with `PreferenceScope` in `@theia/core`. */
export enum PreferenceScope {
    Default = 0,
    User = 1,
    Workspace = 2,
    Folder = 3,
}

export interface PreferenceDataProperty extends IJSONSchema {
    overridable?: boolean;
    included?: boolean;
    hidden?: boolean;
    scope?: PreferenceScope;
    typeDetails?: unknown;
    tags?: string[];
}

export interface PreferenceSchema {
    scope?: PreferenceScope;
    title?: string;
    defaultOverridable?: boolean;
    properties: { [name: string]: PreferenceDataProperty };
}

export interface ColorDefinition {
    id: string;
    defaults?: unknown;
    description: string;
}

export interface TaskDefinition {
    taskType: string;
    source: string;
    properties: {
        required?: string[];
        all: string[];
        schema: IJSONSchema;
    };
}

/** Same segment as `CSSIcon.iconNameSegment` in `@theia/core`. */
export const ICON_NAME_SEGMENT = '[A-Za-z0-9]+';
