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
import { ContributionProvider, bindContributionProvider } from '../../common';
import { PreferenceScope } from './preference-service';
import { PreferenceProvider, PreferenceProviderPriority, PreferenceProviderDataChange } from './preference-provider';

// tslint:disable:no-any

export const PreferenceContribution = Symbol('PreferenceContribution');
export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}

export interface PreferenceSchema {
    [name: string]: any,
    scope?: 'application' | 'window' | 'resource' | PreferenceScope,
    properties: {
        [name: string]: PreferenceSchemaProperty
    }
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

export interface PreferenceDataSchema {
    [name: string]: any,
    scope?: PreferenceScope,
    properties: {
        [name: string]: PreferenceDataProperty
    }
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

@injectable()
export class PreferenceSchemaProvider extends PreferenceProvider {

    protected readonly preferences: { [name: string]: any } = {};
    protected readonly combinedSchema: PreferenceDataSchema = { properties: {} };
    protected validateFunction: Ajv.ValidateFunction;

    @inject(ContributionProvider) @named(PreferenceContribution)
    protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>;

    @postConstruct()
    protected init(): void {
        this.preferenceContributions.getContributions().forEach(contrib => {
            this.doSetSchema(contrib.schema);
        });
        this.combinedSchema.additionalProperties = false;
        this.updateValidate();
        this._ready.resolve();
    }

    protected doSetSchema(schema: PreferenceSchema): void {
        const defaultScope = PreferenceSchema.getDefaultScope(schema);
        const props: string[] = [];
        for (const property of Object.keys(schema.properties)) {
            const schemaProps = schema.properties[property];
            if (this.combinedSchema.properties[property]) {
                console.error('Preference name collision detected in the schema for property: ' + property);
            } else {
                this.combinedSchema.properties[property] = PreferenceDataProperty.fromPreferenceSchemaProperty(schemaProps, defaultScope);
                props.push(property);
            }
        }
        for (const property of props) {
            this.preferences[property] = this.getDefaultValue(this.combinedSchema.properties[property]);
        }
    }

    protected getDefaultValue(property: PreferenceDataProperty): any {
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
        this.doSetSchema(schema);
        this.updateValidate();
        const changes: PreferenceProviderDataChange[] = [];
        for (const property of Object.keys(schema.properties)) {
            const schemaProps = schema.properties[property];
            changes.push({
                preferenceName: property, newValue: schemaProps.default, oldValue: undefined, scope: this.getScope(), domain: this.getDomain()
            });
        }
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

    isValidInScope(prefName: string, scope: PreferenceScope): boolean {
        const schemaProps = this.combinedSchema.properties[prefName];
        if (schemaProps) {
            return schemaProps.scope! >= scope;
        }
        return false;
    }
}
