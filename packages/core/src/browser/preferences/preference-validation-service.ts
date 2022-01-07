/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { JsonType, PreferenceDataProperty } from '../../common/preferences/preference-schema';
import { JSONObject, JSONValue } from '../../../shared/@phosphor/coreutils';
import { PreferenceSchemaProvider } from './preference-contribution';
import { PreferenceLanguageOverrideService } from './preference-language-override-service';
import { inject, injectable } from '../../../shared/inversify';
import { IJSONSchema } from 'src/common/json-schema';

export interface PreferenceValidator<T> {
    name: string;
    validate(value: unknown): T;
}

type ValidationInformation = Pick<PreferenceDataProperty, 'enum' | 'type' | 'maximum' | 'minimum' | 'items' | 'anyOf'>;

export interface PreferenceValidationResult<T extends JSONValue> {
    original: JSONValue | undefined;
    valid: T;
    messages: string[];
}

@injectable()
export class PreferenceValidationService {
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(PreferenceLanguageOverrideService) protected readonly languageOverrideService: PreferenceLanguageOverrideService;

    validateOptions(options: Record<string, JSONValue>): Record<string, JSONValue> {
        const valid: Record<string, JSONValue> = {};
        let problemsDetected = false;
        for (const [preferenceName, value] of Object.entries(options)) {
            const validValue = this.validateBySchema(preferenceName, value);
            if (validValue !== value) {
                problemsDetected = true;
                console.warn(`While validating options, found impermissible value for ${preferenceName}. Using valid value`, validValue, 'instead of configured value', value);
            }
            valid[preferenceName] = validValue;
        }
        return problemsDetected ? valid : options;
    }

    validateBySchema(key: string, value: JSONValue, schema: ValidationInformation | undefined = this.getSchema(key)): JSONValue {
        if (!schema) {
            console.warn('Request to validate preference with no schema registered:', key);
            return value;
        }
        if (Array.isArray(schema.enum)) {
            return this.validateEnum(value, schema as Required<Pick<PreferenceDataProperty, 'enum'>>);
        }
        if (Array.isArray(schema.anyOf)) {
            return this.validateAnyOf(key, value, schema as ValidationInformation & { anyOf: IJSONSchema[] });
        }
        if (schema.type === undefined) {
            console.warn('Request to validate preference with no type information:', key);
            return value;
        }
        if (Array.isArray(schema.type)) {
            return this.validateMultiple(key, value, schema as ValidationInformation & { type: JsonType[] });
        }
        switch (schema.type) {
            case 'array':
                return this.validateArray(value, schema, key);
            case 'boolean':
                return this.validateBoolean(value, schema);
            case 'integer':
                return this.validateInteger(value, schema);
            case 'null':
                return null; // eslint-disable-line no-null/no-null
            case 'number':
                return this.validateNumber(value, schema);
            case 'object':
                return this.validateObject(value, schema);
            case 'string':
                return this.validateString(value, schema);
            default:
                this.validateNever(schema.type, key);
                return value;
        }
    }

    protected getSchema(name: string, overrideIdentifier?: string): ValidationInformation | undefined {
        const combinedSchema = this.schemaProvider.getCombinedSchema().properties;
        if (combinedSchema[name]) {
            return combinedSchema[name];
        }
        const baseName = this.languageOverrideService.overriddenPreferenceName(name)?.preferenceName;
        return baseName !== undefined ? combinedSchema[baseName] : undefined;
    }

    protected validateMultiple(key: string, value: JSONValue, schema: ValidationInformation & { type: JsonType[] }): JSONValue {
        const validation: ValidationInformation = {
            enum: schema.enum,
            minimum: schema.minimum,
            maximum: schema.maximum,
            items: schema.items,
        };
        const candidates = [];
        for (const type of schema.type) {
            validation.type = type as JsonType;
            const candidate = this.validateBySchema(key, value, validation);
            if (candidate === value) {
                return value;
            }
            candidates.push(candidate);
        }
        return candidates[0];
    }

    protected validateAnyOf(key: string, value: JSONValue, schema: Required<Pick<ValidationInformation, 'anyOf'>>): JSONValue {
        const candidates = [];
        for (const validator of schema.anyOf) {
            const candidate = this.validateBySchema(key, value, validator as ValidationInformation);
            if (candidate === value) {
                return value;
            }
            candidates.push(candidate);
        }
        return candidates[0];
    }

    protected validateArray(value: JSONValue, schema: ValidationInformation, key: string): JSONValue[] {
        const candidate = Array.isArray(value) ? value : this.schemaProvider.getDefaultValue(schema);
        if (!Array.isArray(candidate)) {
            return [];
        }
        if (!schema.items?.type) {
            // TODO: Could be improved, either using a real validator like AJV or just by implementing more of the options available in JSON schemas.
            console.warn('Requested validation of array without item type:', key);
            return candidate;
        }
        const valid = [];
        for (const item of candidate) {
            const validated = this.validateBySchema(key, item, { type: schema.items.type });
            if (validated === item) {
                valid.push(item);
            }
        }
        return valid.length === candidate.length ? candidate : valid;
    }

    protected validateEnum(value: JSONValue, schema: Required<Pick<ValidationInformation, 'enum'>>): JSONValue {
        const options = schema.enum as JSONValue[];
        if (options.includes(value)) {
            return value;
        }
        const configuredDefault = this.schemaProvider.getDefaultValue(schema);
        if (options.includes(configuredDefault)) {
            return configuredDefault;
        }
        return options[0];
    }

    protected validateBoolean(value: JSONValue, schema: ValidationInformation): boolean {
        if (value === true || value === false) {
            return value;
        }
        if (value === 'false') {
            return false;
        }
        return Boolean(this.schemaProvider.getDefaultValue(schema));
    }

    protected validateInteger(value: JSONValue, schema: ValidationInformation): number {
        return Math.round(this.validateNumber(value, schema));
    }

    protected validateNumber(value: JSONValue, schema: ValidationInformation): number {
        let validated = Number(value);
        if (validated === NaN) {
            const configuredDefault = Number(this.schemaProvider.getDefaultValue(schema));
            validated = configuredDefault === NaN ? 0 : configuredDefault;
        }
        if (schema.minimum !== undefined) {
            validated = Math.max(validated, schema.minimum);
        }
        if (schema.maximum !== undefined) {
            validated = Math.min(validated, schema.maximum);
        }
        return validated;
    }

    protected validateObject(value: JSONValue, schema: ValidationInformation): JSONObject {
        // TODO: Could by improved with either AJV or more sophisticated handling of the JSON schema.
        const isObject = (candidate: JSONValue): candidate is JSONObject => typeof value === 'object' && !!value;
        if (isObject(value)) {
            return value;
        }
        const configuredDefault = this.schemaProvider.getDefaultValue(schema);
        if (isObject(configuredDefault)) {
            return configuredDefault;
        }
        return {};
    }

    protected validateString(value: JSONValue, schema: ValidationInformation): string {
        if (typeof value === 'string') {
            return value;
        }
        if (value instanceof String) {
            return value.toString();
        }
        const configuredDefault = this.schemaProvider.getDefaultValue(schema);
        return (configuredDefault ?? '').toString();
    }

    protected validateNever(nothing: never, key: string): void {
        console.error(`Request to validate preference with unknown type in schema: ${key}, ${nothing}`);
    }
}
