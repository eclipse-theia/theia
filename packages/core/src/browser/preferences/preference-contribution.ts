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

import * as Ajv from 'ajv';
import { inject, injectable, interfaces, named, postConstruct } from 'inversify';
import { ContributionProvider, bindContributionProvider, escapeRegExpCharacters, Emitter, Event } from '../../common';
import { PreferenceScope } from './preference-service';
import { PreferenceProvider, PreferenceProviderPriority, PreferenceProviderDataChange } from './preference-provider';

// tslint:disable:no-any
// tslint:disable:forin

export const PreferenceContribution = Symbol('PreferenceContribution');
export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}

export interface PreferenceSchema {
    [name: string]: any,
    scope?: 'application' | 'window' | 'resource' | PreferenceScope,
    overridable?: boolean;
    properties: PreferenceSchemaProperties
}
export namespace PreferenceSchema {
    export function getDefaultScope(schema: PreferenceSchema): PreferenceScope {
        let defaultScope: PreferenceScope = PreferenceScope.Workspace;
        if (!PreferenceScope.is(schema.scope)) {
            defaultScope = PreferenceScope.fromString(<string>schema.scope) || PreferenceScope.Workspace;
        } else {
            defaultScope = schema.scope;
        }
        return defaultScope;
    }
}

export interface PreferenceSchemaProperties {
    [name: string]: PreferenceSchemaProperty
}

export interface PreferenceDataSchema {
    [name: string]: any,
    scope?: PreferenceScope,
    properties: {
        [name: string]: PreferenceDataProperty
    }
    patternProperties: {
        [name: string]: PreferenceDataProperty
    };
}

export interface PreferenceItem {
    type?: JsonType | JsonType[];
    minimum?: number;
    default?: any;
    enum?: string[];
    items?: PreferenceItem;
    properties?: { [name: string]: PreferenceItem };
    additionalProperties?: object;
    [name: string]: any;
    overridable?: boolean;
}

export interface PreferenceSchemaProperty extends PreferenceItem {
    description: string;
    scope?: 'application' | 'window' | 'resource' | PreferenceScope;
}

export interface PreferenceDataProperty extends PreferenceItem {
    description: string;
    scope?: PreferenceScope;
}
export namespace PreferenceDataProperty {
    export function fromPreferenceSchemaProperty(schemaProps: PreferenceSchemaProperty, defaultScope: PreferenceScope = PreferenceScope.Workspace): PreferenceDataProperty {
        if (!schemaProps.scope) {
            schemaProps.scope = defaultScope;
        } else if (typeof schemaProps.scope === 'string') {
            return Object.assign(schemaProps, { scope: PreferenceScope.fromString(schemaProps.scope) || defaultScope });
        }
        return <PreferenceDataProperty>schemaProps;
    }
}

export type JsonType = 'string' | 'array' | 'number' | 'integer' | 'object' | 'boolean' | 'null';

export function bindPreferenceSchemaProvider(bind: interfaces.Bind): void {
    bind(PreferenceSchemaProvider).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreferenceContribution);
}

export interface OverridePreferenceName {
    preferenceName: string
    overrideIdentifier: string
}

const OVERRIDE_PROPERTY = '\\[(.*)\\]$';
export const OVERRIDE_PROPERTY_PATTERN = new RegExp(OVERRIDE_PROPERTY);

const OVERRIDE_PATTERN_WITH_SUBSTITUTION = '\\[(${0})\\]$';

@injectable()
export class PreferenceSchemaProvider extends PreferenceProvider {

    protected readonly preferences: { [name: string]: any } = {};
    protected readonly combinedSchema: PreferenceDataSchema = { properties: {}, patternProperties: {} };

    @inject(ContributionProvider) @named(PreferenceContribution)
    protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>;
    protected validateFunction: Ajv.ValidateFunction;

    protected readonly onDidPreferenceSchemaChangedEmitter = new Emitter<void>();
    readonly onDidPreferenceSchemaChanged: Event<void> = this.onDidPreferenceSchemaChangedEmitter.event;
    protected fireDidPreferenceSchemaChanged(): void {
        this.onDidPreferenceSchemaChangedEmitter.fire(undefined);
    }

    @postConstruct()
    protected init(): void {
        this.preferenceContributions.getContributions().forEach(contrib => {
            this.doSetSchema(contrib.schema);
        });
        this.combinedSchema.additionalProperties = false;
        this.updateValidate();
        this.onDidPreferencesChanged(() => this.updateValidate());
        this._ready.resolve();
    }

    protected readonly overrideIdentifiers = new Set<string>();
    registerOverrideIdentifier(overrideIdentifier: string): void {
        if (this.overrideIdentifiers.has(overrideIdentifier)) {
            return;
        }
        this.overrideIdentifiers.add(overrideIdentifier);
        this.updateOverridePatternPropertiesKey();
    }

    protected readonly overridePatternProperties: Required<Pick<PreferenceDataProperty, 'properties'>> & PreferenceDataProperty = {
        type: 'object',
        description: 'Configure editor settings to be overridden for a language.',
        errorMessage: 'Unknown Identifier. Use language identifiers',
        properties: {}
    };
    protected overridePatternPropertiesKey: string | undefined;
    protected updateOverridePatternPropertiesKey(): void {
        const oldKey = this.overridePatternPropertiesKey;
        const newKey = this.computeOverridePatternPropertiesKey();
        if (oldKey === newKey) {
            return;
        }
        if (oldKey) {
            delete this.combinedSchema.patternProperties[oldKey];
        }
        this.overridePatternPropertiesKey = newKey;
        if (newKey) {
            this.combinedSchema.patternProperties[newKey] = this.overridePatternProperties;
        }
        this.fireDidPreferenceSchemaChanged();
    }
    protected computeOverridePatternPropertiesKey(): string | undefined {
        let param: string = '';
        for (const overrideIdentifier of this.overrideIdentifiers.keys()) {
            if (param.length) {
                param += '|';
            }
            param += new RegExp(escapeRegExpCharacters(overrideIdentifier)).source;
        }
        return param.length ? OVERRIDE_PATTERN_WITH_SUBSTITUTION.replace('${0}', param) : undefined;
    }

    protected doSetSchema(schema: PreferenceSchema): PreferenceProviderDataChange[] {
        const scope = this.getScope();
        const domain = this.getDomain();
        const changes: PreferenceProviderDataChange[] = [];
        const defaultScope = PreferenceSchema.getDefaultScope(schema);
        const overridable = schema.overridable || false;
        for (const preferenceName of Object.keys(schema.properties)) {
            if (this.combinedSchema.properties[preferenceName]) {
                console.error('Preference name collision detected in the schema for property: ' + preferenceName);
            } else {
                const schemaProps = PreferenceDataProperty.fromPreferenceSchemaProperty(schema.properties[preferenceName], defaultScope);
                if (typeof schemaProps.overridable !== 'boolean' && overridable) {
                    schemaProps.overridable = true;
                }
                if (schemaProps.overridable) {
                    this.overridePatternProperties.properties[preferenceName] = schemaProps;
                }
                const newValue = schemaProps.default = this.getDefaultValue(schemaProps);
                this.combinedSchema.properties[preferenceName] = schemaProps;
                this.preferences[preferenceName] = newValue;
                changes.push({ preferenceName, newValue, scope, domain });
            }
        }
        return changes;
    }

    protected getDefaultValue(property: PreferenceItem): any {
        if (property.default) {
            return property.default;
        }
        const type = Array.isArray(property.type) ? property.type[0] : property.type;
        switch (type) {
            case 'boolean':
                return false;
            case 'integer':
            case 'number':
                return 0;
            case 'string':
                return '';
            case 'array':
                return [];
            case 'object':
                return {};
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected updateValidate(): void {
        this.validateFunction = new Ajv().compile(this.combinedSchema);
    }

    validate(name: string, value: any): boolean {
        return this.validateFunction({ [name]: value }) as boolean;
    }

    getCombinedSchema(): PreferenceDataSchema {
        return this.combinedSchema;
    }

    setSchema(schema: PreferenceSchema): void {
        const changes = this.doSetSchema(schema);
        this.fireDidPreferenceSchemaChanged();
        this.emitPreferencesChangedEvent(changes);
    }

    getPreferences(): { [name: string]: any } {
        return this.preferences;
    }

    async setPreference(): Promise<void> {
        throw new Error('Unsupported');
    }

    canProvide(preferenceName: string, resourceUri?: string): { priority: number, provider: PreferenceProvider } {
        return { priority: PreferenceProviderPriority.Default, provider: this };
    }

    isValidInScope(preferenceName: string, scope: PreferenceScope): boolean {
        const preference = this.getPreferenceProperty(preferenceName);
        if (preference) {
            return preference.scope! >= scope;
        }
        return false;
    }

    *getPreferenceNames(): IterableIterator<string> {
        for (const preferenceName in this.combinedSchema.properties) {
            yield preferenceName;
            for (const overridePreferenceName of this.getOverridePreferenceNames(preferenceName)) {
                yield overridePreferenceName;
            }
        }
    }

    *getOverridePreferenceNames(preferenceName: string): IterableIterator<string> {
        const preference = this.combinedSchema.properties[preferenceName];
        if (preference && preference.overridable) {
            for (const overrideIdentifier of this.overrideIdentifiers) {
                yield this.overridePreferenceName({ preferenceName, overrideIdentifier });
            }
        }
    }

    getPreferenceProperty(preferenceName: string): PreferenceItem | undefined {
        const overriden = this.overridenPreferenceName(preferenceName);
        return this.combinedSchema.properties[overriden ? overriden.preferenceName : preferenceName];
    }

    overridePreferenceName({ preferenceName, overrideIdentifier }: OverridePreferenceName): string {
        return `[${overrideIdentifier}].${preferenceName}`;
    }
    overridenPreferenceName(name: string): OverridePreferenceName | undefined {
        const index = name.indexOf('.');
        if (index === -1) {
            return undefined;
        }
        const matches = name.substr(0, index).match(OVERRIDE_PROPERTY_PATTERN);
        const overrideIdentifier = matches && matches[1];
        if (!overrideIdentifier || !this.overrideIdentifiers.has(overrideIdentifier)) {
            return undefined;
        }
        const preferenceName = name.substr(index + 1);
        return { preferenceName, overrideIdentifier };
    }

    testOverrideValue(name: string, value: any): boolean {
        return typeof value === 'object' && OVERRIDE_PROPERTY_PATTERN.test(name);
    }
}
