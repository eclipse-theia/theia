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
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider, PreferenceProviderDataChange } from './preference-provider';
import {
    PreferenceSchema, PreferenceSchemaProperties, PreferenceDataSchema, PreferenceItem, PreferenceSchemaProperty, PreferenceDataProperty, JsonType
} from '../../common/preferences/preference-schema';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { FrontendApplicationConfig } from '@theia/application-package/lib/application-props';
import { bindPreferenceConfigurations, PreferenceConfigurations } from './preference-configurations';
export { PreferenceSchema, PreferenceSchemaProperties, PreferenceDataSchema, PreferenceItem, PreferenceSchemaProperty, PreferenceDataProperty, JsonType };

// tslint:disable:no-any
// tslint:disable:forin

export const PreferenceContribution = Symbol('PreferenceContribution');
export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}

export function bindPreferenceSchemaProvider(bind: interfaces.Bind): void {
    bindPreferenceConfigurations(bind);
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

export interface FrontendApplicationPreferenceConfig extends FrontendApplicationConfig {
    preferences: {
        [preferenceName: string]: any
    }
}
export namespace FrontendApplicationPreferenceConfig {
    export function is(config: FrontendApplicationConfig): config is FrontendApplicationPreferenceConfig {
        return 'preferences' in config && typeof config['preferences'] === 'object';
    }
}

@injectable()
export class PreferenceSchemaProvider extends PreferenceProvider {

    protected readonly preferences: { [name: string]: any } = {};
    protected readonly combinedSchema: PreferenceDataSchema = { properties: {}, patternProperties: {} };

    @inject(ContributionProvider) @named(PreferenceContribution)
    protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>;
    protected validateFunction: Ajv.ValidateFunction;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

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
        const scope = PreferenceScope.Default;
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
                this.combinedSchema.properties[preferenceName] = schemaProps;
                this.unsupportedPreferences.delete(preferenceName);

                const value = schemaProps.defaultValue = this.getDefaultValue(schemaProps, preferenceName);
                if (this.testOverrideValue(preferenceName, value)) {
                    for (const overridenPreferenceName in value) {
                        const overrideValue = value[overridenPreferenceName];
                        const overridePreferenceName = `${preferenceName}.${overridenPreferenceName}`;
                        changes.push(this.doSetPreferenceValue(overridePreferenceName, overrideValue, { scope, domain }));
                    }
                } else {
                    changes.push(this.doSetPreferenceValue(preferenceName, value, { scope, domain }));
                }
            }
        }
        return changes;
    }
    protected doSetPreferenceValue(preferenceName: string, newValue: any, { scope, domain }: {
        scope: PreferenceScope,
        domain?: string[]
    }): PreferenceProviderDataChange {
        const oldValue = this.preferences[preferenceName];
        this.preferences[preferenceName] = newValue;
        return { preferenceName, oldValue, newValue, scope, domain };
    }

    /** @deprecated since 0.6.0 pass preferenceName as the second arg */
    protected getDefaultValue(property: PreferenceItem): any;
    protected getDefaultValue(property: PreferenceItem, preferenceName: string): any;
    protected getDefaultValue(property: PreferenceItem, preferenceName?: string): any {
        const config = FrontendApplicationConfigProvider.get();
        if (preferenceName && FrontendApplicationPreferenceConfig.is(config) && preferenceName in config.preferences) {
            return config.preferences[preferenceName];
        }
        if (property.defaultValue !== undefined) {
            return property.defaultValue;
        }
        if (property.default !== undefined) {
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
        const schema = {
            ...this.combinedSchema,
            properties: {
                ...this.combinedSchema.properties
            }
        };
        for (const sectionName of this.configurations.getSectionNames()) {
            delete schema.properties[sectionName];
        }
        this.validateFunction = new Ajv().compile(schema);
    }

    protected readonly unsupportedPreferences = new Set<string>();
    validate(name: string, value: any): boolean {
        if (this.configurations.isSectionName(name)) {
            return true;
        }
        const result = this.validateFunction({ [name]: value }) as boolean;
        if (!result && !(name in this.combinedSchema.properties)) {
            // in order to avoid reporting it on each change
            if (!this.unsupportedPreferences.has(name)) {
                this.unsupportedPreferences.add(name);
                console.warn(`"${name}" preference is not supported`);
            }
        }
        return result;
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

    async setPreference(): Promise<boolean> {
        return false;
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

    testOverrideValue(name: string, value: any): value is PreferenceSchemaProperties {
        return PreferenceSchemaProperties.is(value) && OVERRIDE_PROPERTY_PATTERN.test(name);
    }
}
