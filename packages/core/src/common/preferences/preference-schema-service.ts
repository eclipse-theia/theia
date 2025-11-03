// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { inject, injectable, named, postConstruct } from 'inversify';
import { Disposable } from '../disposable';
import { Emitter } from '../event';
import { IJSONSchema } from '../json-schema';
import { JSONObject, JSONValue } from '@lumino/coreutils';
import { PreferenceDataProperty, PreferenceSchema, PreferenceSchemaService, DefaultValueChangedEvent, PreferenceContribution } from './preference-schema';
import { PreferenceScope, ValidPreferenceScopes } from './preference-scope';
import { PreferenceUtils } from './preference-provider';
import { ContributionProvider } from '../contribution-provider';
import { Deferred } from '../promise-util';

export const NO_OVERRIDE = {};
export const OVERRIDE_PROPERTY = '\\[(.*)\\]$';

@injectable()
export class PreferenceSchemaServiceImpl implements PreferenceSchemaService {
    // Storage structures
    protected readonly schemas = new Set<PreferenceSchema>();
    protected readonly properties = new Map<string, PreferenceDataProperty>();
    /**
     * This map stores default overrides. The primary map key is the base preference name.
     * The preference name maps to a second map keyed by the override identifier or a special object value `NO_OVERRIDE',
     * representing default overrides for the base property. The value in this second map is an array
     * of entries in reverse order of their insertion. This is necessary becuaus multiple clients might register
     * overrides for the same preference key/override combination. The elements in this array consist of a unique, generated
     * identifier and the actual override value. This allows us to always return the last registerd override even
     * when overrides are later removed.
     */
    protected readonly defaultOverrides = new Map<string, Map<string | object, [number, JSONValue][]>>();
    protected readonly _overrideIdentifiers = new Set<string>();

    protected readonly jsonSchemas: IJSONSchema[] = [];

    protected readonly _ready = new Deferred();

    get ready(): Promise<void> {
        return this._ready.promise;
    }

    get overrideIdentifiers(): ReadonlySet<string> {
        return this._overrideIdentifiers;
    }

    getSchemaProperties(): ReadonlyMap<string, PreferenceDataProperty> {
        return this.properties;
    }

    protected nextSchemaTitle = 1;
    protected nextOverrideValueId = 1;

    // Event emitters
    protected readonly defaultValueChangedEmitter = new Emitter<DefaultValueChangedEvent>();
    protected readonly schemaChangedEmitter = new Emitter<void>();

    // Public events
    readonly onDidChangeDefaultValue = this.defaultValueChangedEmitter.event;
    readonly onDidChangeSchema = this.schemaChangedEmitter.event;

    @inject(ValidPreferenceScopes)
    readonly validScopes: readonly PreferenceScope[];

    @inject(ContributionProvider) @named(PreferenceContribution)
    protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>;

    @postConstruct()
    protected init(): void {
        for (const scope of this.validScopes) {
            this.jsonSchemas[scope] = {
                type: 'object',
                properties: {},
                patternProperties: {},
                additionalProperties: false
            };
        }
        const promises: Promise<void>[] = [];
        this.preferenceContributions.getContributions().forEach(contrib => {
            if (contrib.schema) {
                this.addSchema(contrib.schema);
            }
            if (contrib.initSchema) {
                promises.push(contrib.initSchema(this));
            }
        });
        Promise.all(promises).then(() => this._ready.resolve());
    }

    dispose(): void {
        this.defaultValueChangedEmitter.dispose();
        this.schemaChangedEmitter.dispose();
    }

    registerOverrideIdentifier(overrideIdentifier: string): Disposable {
        if (!this._overrideIdentifiers.has(overrideIdentifier)) {
            this.addOverrideToJsonSchema(overrideIdentifier);
            this._overrideIdentifiers.add(overrideIdentifier);
            this.schemaChangedEmitter.fire();

            return Disposable.create(() => {
                if (this._overrideIdentifiers.delete(overrideIdentifier)) {
                    this.schemaChangedEmitter.fire();
                }
            });
        }
        return Disposable.NULL;
    }

    addSchema(schema: PreferenceSchema): Disposable {
        this.schemas.add(schema);

        for (const [key, property] of Object.entries(schema.properties)) {
            if (this.properties.has(key)) {
                console.warn(`Property with id '${key}' already exists`);
                continue;
            }

            if (property.scope === undefined) {
                property.scope = schema.scope;
            }

            if (property.overridable === undefined) {
                property.overridable = schema.defaultOverridable;
            }

            this.properties.set(key, property);
            this.setJSONSchemasProperty(key, property);
            if (property.default !== undefined) {
                this.defaultValueChangedEmitter.fire(this.changeFor(key, undefined, this.defaultOverrides.get(key), undefined, property.default!));
            }

        }

        this.schemaChangedEmitter.fire();

        return Disposable.create(() => {
            if (this.schemas.delete(schema)) {
                for (const [key, property] of Object.entries(schema.properties)) {
                    this.deleteFromJSONSchemas(key, property);
                    this.properties.delete(key);
                    const overrides = this.defaultOverrides.get(key);

                    const baseOverride = overrides?.get(NO_OVERRIDE);
                    if (baseOverride !== undefined) {
                        this.defaultValueChangedEmitter.fire(this.changeFor(key, undefined, overrides, baseOverride, undefined));
                    } else if (property.default !== undefined) {
                        this.defaultValueChangedEmitter.fire(this.changeFor(key, undefined, overrides, property.default, undefined));
                    }
                    if (overrides) {
                        for (const [overrideKey, value] of overrides) {
                            if (typeof overrideKey === 'string') {
                                this.defaultValueChangedEmitter.fire(this.changeFor(key, overrideKey, overrides, value[0][1], undefined));
                            }
                        }
                    }
                }

                this.schemaChangedEmitter.fire();
            }
        });
    }

    isValidInScope(preferenceName: string, scope: PreferenceScope): boolean {
        const property = this.properties.get(preferenceName);

        if (!property) {
            return false;
        }

        // A property is valid in a scope if:
        // 1. It is included (undefined or true)
        // 2. Its scope is not defined (valid in all scopes) or its scope includes the given scope
        return (property.included !== false) &&
            (property.scope === undefined || property.scope >= scope);
    }

    getSchemaProperty(key: string): PreferenceDataProperty | undefined {
        return this.properties.get(key);
    }

    updateSchemaProperty(key: string, property: PreferenceDataProperty): void {
        const existing = this.properties.get(key);
        if (existing) {
            // Update the property with new values
            const updatedProperty = { ...existing, ...property };
            this.properties.set(key, updatedProperty);
            const hasNoBaseOverrideValue = this.defaultOverrides.get(key)?.get(NO_OVERRIDE) === undefined;
            if (hasNoBaseOverrideValue && !PreferenceUtils.deepEqual(property.default, existing.default)) {
                this.defaultValueChangedEmitter.fire(this.changeFor(key, undefined, this.defaultOverrides.get(key), undefined, property.default!));
            }

            this.setJSONSchemasProperty(key, updatedProperty);
            this.schemaChangedEmitter.fire();
        } else {
            console.warn(`Trying to update non-existent property ${key}`);
        }
    }

    registerOverride(key: string, overrideIdentifier: string | undefined, value: JSONValue): Disposable {
        const overrideId = overrideIdentifier || NO_OVERRIDE;
        const property = this.properties.get(key);
        if (!property) {
            console.warn(`Trying to register default override for non-existent preference: ${key}`);
        } else if (!property.overridable && overrideIdentifier) {
            console.warn(`Trying to register default override for identifier ${overrideIdentifier} for non-overridable preference: ${key}`);
        }

        let overrides = this.defaultOverrides.get(key);
        if (!overrides) {
            overrides = new Map();
            this.defaultOverrides.set(key, overrides);
        }

        const oldValue = this.getDefaultValue(key, overrideIdentifier);

        const overrideValueId = this.nextOverrideValueId;
        let override = overrides.get(overrideId);
        if (!override) {
            override = [];
            overrides.set(overrideId, override);
        }
        override.unshift([overrideValueId, value]);

        // Fire event only if the value actually changed
        if (!PreferenceUtils.deepEqual(oldValue, value)) {
            const evt = this.changeFor(key, overrideIdentifier, overrides, oldValue, value);
            this.defaultValueChangedEmitter.fire(evt);
        }

        if (property) {
            this.setJSONSchemasProperty(key, property);
        }

        return Disposable.create(() => {
            this.removeOverride(key, overrideIdentifier, overrideValueId);
        });
    }

    protected changeFor(key: string, overrideIdentifier: string | undefined,
        overrides: Map<string | object, [number, JSONValue][]> | undefined, oldValue: JSONValue | undefined, newValue: JSONValue | undefined): DefaultValueChangedEvent {
        const affectedOverrides = [];
        if (!overrideIdentifier) {
            for (const id of this._overrideIdentifiers) {
                if (!overrides?.has(id)) {
                    affectedOverrides.push(id);
                }
            }
        }
        return {
            key,
            overrideIdentifier: overrideIdentifier,
            otherAffectedOverrides: affectedOverrides,
            oldValue,
            newValue
        };
    }

    protected removeOverride(key: string, overrideIdentifier: string | undefined, overrideValueId: number): void {
        const overrideId = overrideIdentifier || NO_OVERRIDE;
        const overrides = this.defaultOverrides.get(key);
        if (overrides) {
            const values = overrides.get(overrideId);
            if (values) {
                const index = values.findIndex(v => v[0] === overrideValueId);
                if (index) {
                    const oldValue = this.getDefaultValue(key, overrideIdentifier);
                    values.splice(index, 1);
                    const newValue = this.getDefaultValue(key, overrideIdentifier);
                    if (!PreferenceUtils.deepEqual(oldValue, newValue)) {

                        const affectedOverrides = [];
                        if (!overrideIdentifier) {
                            for (const id of this._overrideIdentifiers) {
                                if (!overrides.has(id)) {
                                    affectedOverrides.push(id);
                                }
                            }
                        }

                        this.defaultValueChangedEmitter.fire({
                            key,
                            overrideIdentifier,
                            otherAffectedOverrides: affectedOverrides,
                            oldValue,
                            newValue
                        });
                    }
                }
                if (values.length === 0) {
                    overrides.delete(overrideId);
                }
            }
            if (overrides.size === 0) {
                this.defaultOverrides.delete(key);
            }
        }
    }

    getDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined {
        const overrideId = overrideIdentifier || NO_OVERRIDE;
        const overrides = this.defaultOverrides.get(key);
        if (overrides) {
            const values = overrides.get(overrideId);
            if (values) {
                return values[0][1]; // there will be no empty values arrays in the data structure
            }
        }

        const property = this.properties.get(key);
        return property?.default;
    }

    inspectDefaultValue(key: string, overrideIdentifier: string | undefined): JSONValue | undefined {
        const overrideId = overrideIdentifier || NO_OVERRIDE;
        const overrides = this.defaultOverrides.get(key);
        if (overrides) {
            const values = overrides.get(overrideId);
            if (values) {
                return values[0][1]; // there will be no empty values arrays in the data structure
            }
        }

        if (!overrideIdentifier) {
            const property = this.properties.get(key);
            return property?.default;
        }
        return undefined;
    }

    getJSONSchema(scope: PreferenceScope): IJSONSchema {
        return this.jsonSchemas[scope];
    }

    protected setJSONSchemasProperty(key: string, property: PreferenceDataProperty): void {
        for (const scope of this.validScopes) {
            if (this.isValidInScope(key, scope)) {
                this.setJSONSchemaProperty(this.jsonSchemas[scope], key, property);
            }
        }
    }
    protected deleteFromJSONSchemas(key: string, property: PreferenceDataProperty): void {
        for (const scope of this.validScopes) {
            if (this.isValidInScope(key, scope)) {
                const schema = this.jsonSchemas[scope];
                for (const name of Object.keys(schema.properties!)) {
                    if (name.match(OVERRIDE_PROPERTY)) {
                        const value = schema.properties![name] as IJSONSchema;
                        delete value.properties![key];
                    } else {
                        delete schema.properties![key];
                    }
                }
            }
        }
    }

    protected setJSONSchemaProperty(schema: IJSONSchema, key: string, property: PreferenceDataProperty): void {
        // Add property to the schema
        const prop = { ...property, default: this.getDefaultValue(key, undefined) };
        schema.properties![key] = prop;
        delete prop['scope'];
        delete prop['overridable'];
        if (property.overridable) {
            for (const overrideIdentifier of this._overrideIdentifiers) {
                const overrideSchema: IJSONSchema = schema.properties![`[${overrideIdentifier}]`] || {
                    type: 'object',
                    properties: {},
                    patternProperties: {},
                    additionalProperties: false
                };
                schema.properties![`[${overrideIdentifier}]`] = overrideSchema;
                overrideSchema.properties![key] = { ...property, default: this.getDefaultValue(key, overrideIdentifier) };
            }
        }
    }

    addOverrideToJsonSchema(overrideIdentifier: string): void {
        for (const scope of this.validScopes) {
            const schema = this.jsonSchemas[scope];
            const overrideSchema: IJSONSchema = {
                type: 'object',
                properties: {},
                patternProperties: {},
                additionalProperties: false
            };
            schema.properties![`[${overrideIdentifier}]`] = overrideSchema;
            for (const [key, property] of this.properties.entries()) {
                if (property.overridable && this.isValidInScope(key, scope)) {
                    overrideSchema.properties![key] = { ...property, default: this.getDefaultValue(key, overrideIdentifier) };
                }
            }
        }
    }

    getDefaultValues(): JSONObject {
        const result: JSONObject = {};

        for (const [key, property] of this.properties.entries()) {
            if (this.isValidInScope(key, PreferenceScope.Default)) {
                if (property.default !== undefined) {
                    result[key] = property.default;
                }
                const overrides = this.defaultOverrides.get(key);
                if (overrides) {
                    for (const [overrideId, values] of overrides.entries()) {
                        if (overrideId === NO_OVERRIDE) {
                            result[key] = values[0][1];
                        } else {
                            const overrideKey = `[${overrideId}]`;
                            const target: JSONObject = result[overrideKey] as JSONObject || {};
                            target[key] = values[0][1];
                            result[overrideKey] = target;
                        }
                    }
                }
            }
        }

        return result;
    }
}
