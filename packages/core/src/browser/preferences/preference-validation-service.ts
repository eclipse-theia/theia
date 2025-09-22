// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { JSONObject, JSONValue } from '../../../shared/@lumino/coreutils';
import { inject, injectable } from '../../../shared/inversify';
import { IJSONSchema, JsonType } from '../../common/json-schema';
import { deepClone, unreachable } from '../../common';
import { PreferenceLanguageOverrideService } from '../../common/preferences/preference-language-override-service';
import { PreferenceSchemaService, PreferenceScope, PreferenceUtils, PreferenceDataProperty } from '../../common/preferences';

export interface PreferenceValidator<T> {
    name: string;
    validate(value: unknown): T;
}

export type ValueValidator = (value: JSONValue) => JSONValue;

export interface PreferenceValidationResult<T extends JSONValue> {
    original: JSONValue | undefined;
    valid: T;
    messages: string[];
}

type ValidatablePreferenceTuple = IJSONSchema & ({ items: IJSONSchema[] } | { prefixItems: IJSONSchema[] });

@injectable()
export class PreferenceValidationService {
    @inject(PreferenceSchemaService) protected readonly schemaService: PreferenceSchemaService;
    @inject(PreferenceLanguageOverrideService) protected readonly languageOverrideService: PreferenceLanguageOverrideService;

    validateOptions(options: Record<string, JSONValue>): Record<string, JSONValue> {
        const valid: Record<string, JSONValue> = {};
        let problemsDetected = false;
        for (const [preferenceName, value] of Object.entries(options)) {
            const validValue = this.validateByName(preferenceName, value);
            if (validValue !== value) {
                problemsDetected = true;
            }
            valid[preferenceName] = validValue;
        }
        return problemsDetected ? valid : options;
    }

    validateByName(preferenceName: string, value: JSONValue): JSONValue {
        const validValue = this.doValidateByName(preferenceName, value);
        // If value is undefined, it means the preference wasn't set, not that a bad value was set.
        if (validValue !== value && value !== undefined) {
            console.warn(`While validating options, found impermissible value for ${preferenceName}. Using valid value`, validValue, 'instead of configured value', value);
        }
        return validValue;
    }

    protected doValidateByName(preferenceName: string, value: JSONValue): JSONValue {
        const schema = this.getSchema(preferenceName);
        return this.validateBySchema(preferenceName, value, schema);
    }

    validateBySchema(key: string, value: JSONValue, schema: IJSONSchema | undefined): JSONValue {
        try {
            if (!schema) {
                console.warn('Request to validate preference with no schema registered:', key);
                return value;
            }
            if (schema.const !== undefined) {
                return this.validateConst(key, value, schema as IJSONSchema & { const: JSONValue });
            }
            if (Array.isArray(schema.enum)) {
                return this.validateEnum(key, value, schema as IJSONSchema & { enum: JSONValue[] });
            }
            if (Array.isArray(schema.anyOf)) {
                return this.validateAnyOf(key, value, schema as IJSONSchema & { anyOf: IJSONSchema[] });
            }
            if (Array.isArray(schema.oneOf)) {
                return this.validateOneOf(key, value, schema as IJSONSchema & { oneOf: IJSONSchema[] });
            }
            if (schema.type === undefined) {
                console.warn('Request to validate preference with no type information:', key);
                return value;
            }
            if (Array.isArray(schema.type)) {
                return this.validateMultiple(key, value, schema as IJSONSchema & { type: JsonType[] });
            }
            switch (schema.type) {
                case 'array':
                    return this.validateArray(key, value, schema);
                case 'boolean':
                    return this.validateBoolean(key, value, schema);
                case 'integer':
                    return this.validateInteger(key, value, schema);
                case 'null':
                    return null; // eslint-disable-line no-null/no-null
                case 'number':
                    return this.validateNumber(key, value, schema);
                case 'object':
                    return this.validateObject(key, value, schema);
                case 'string':
                    return this.validateString(key, value, schema);
                default:
                    unreachable(schema.type, `Request to validate preference with unknown type in schema: ${key}`);
            }
        } catch (e) {
            console.error('Encountered an error while validating', key, 'with value', value, 'against schema', schema, e);
            return value;
        }
    }

    protected getSchema(name: string): IJSONSchema | undefined {
        const combinedSchema = this.schemaService.getJSONSchema(PreferenceScope.Folder).properties!;
        if (combinedSchema[name]) {
            return combinedSchema[name];
        }
        const baseName = this.languageOverrideService.overriddenPreferenceName(name)?.preferenceName;
        return baseName !== undefined ? combinedSchema[baseName] : undefined;
    }

    protected validateMultiple(key: string, value: JSONValue, schema: IJSONSchema & { type: JsonType[] }): JSONValue {
        const validation: IJSONSchema = deepClone(schema);
        const candidate = this.mapValidators(key, value, (function* (this: PreferenceValidationService): Iterable<ValueValidator> {
            for (const type of schema.type) {
                validation.type = type as JsonType;
                yield toValidate => this.validateBySchema(key, toValidate, validation);
            }
        }).bind(this)());
        if (candidate !== value && (schema.default !== undefined || schema.default !== undefined)) {
            const configuredDefault = this.getDefaultFromSchema(schema);
            return this.validateMultiple(key, configuredDefault, { ...schema, default: undefined });
        }
        return candidate;
    }

    protected validateAnyOf(key: string, value: JSONValue, schema: IJSONSchema & { anyOf: IJSONSchema[] }): JSONValue {
        const candidate = this.mapValidators(key, value, (function* (this: PreferenceValidationService): Iterable<ValueValidator> {
            for (const option of schema.anyOf) {
                yield toValidate => this.validateBySchema(key, toValidate, option);
            }
        }).bind(this)());
        if (candidate !== value && (schema.default !== undefined)) {
            const configuredDefault = this.getDefaultFromSchema(schema);
            return this.validateAnyOf(key, configuredDefault, { ...schema, default: undefined });
        }
        return candidate;
    }

    protected validateOneOf(key: string, value: JSONValue, schema: IJSONSchema & { oneOf: IJSONSchema[] }): JSONValue {
        let passed = false;
        for (const subSchema of schema.oneOf) {
            const validValue = this.validateBySchema(key, value, subSchema);
            if (!passed && validValue === value) {
                passed = true;
            } else if (passed && validValue === value) {
                passed = false;
                break;
            }
        }
        if (passed) {
            return value;
        }
        if (schema.default !== undefined) {
            const configuredDefault = this.getDefaultFromSchema(schema);
            return this.validateOneOf(key, configuredDefault, { ...schema, default: undefined });
        }
        console.log(`While validating ${key}, failed to find a valid value or default value. Using configured value ${value}.`);
        return value;
    }

    protected mapValidators(key: string, value: JSONValue, validators: Iterable<(value: JSONValue) => JSONValue>): JSONValue {
        const candidates = [];
        for (const validator of validators) {
            const candidate = validator(value);
            if (candidate === value) {
                return candidate;
            }
            candidates.push(candidate);
        }
        return candidates[0];
    }
    protected validateArray(key: string, value: JSONValue, schema: IJSONSchema): JSONValue[] {
        const candidate = Array.isArray(value) ? value : this.getDefaultFromSchema(schema);
        if (!Array.isArray(candidate)) {
            return [];
        }
        if (!schema.items && !schema.prefixItems) {
            console.warn('Requested validation of array without item specification:', key);
            return candidate;
        }
        if (Array.isArray(schema.items) || Array.isArray(schema.prefixItems)) {
            return this.validateTuple(key, value, schema as ValidatablePreferenceTuple);
        }
        const itemSchema = schema.items!;
        const valid = candidate.filter(item => this.validateBySchema(key, item, itemSchema) === item);
        return valid.length === candidate.length ? candidate : valid;
    }

    protected validateTuple(key: string, value: JSONValue, schema: ValidatablePreferenceTuple): JSONValue[] {
        const defaultValue = this.getDefaultFromSchema(schema);
        const maybeCandidate = Array.isArray(value) ? value : defaultValue;
        // If we find that the provided value is not valid, we immediately bail and try the default value instead.
        const shouldTryDefault = Array.isArray(schema.default) && !PreferenceUtils.deepEqual(defaultValue, maybeCandidate);
        const tryDefault = () => this.validateTuple(key, defaultValue, schema);
        const candidate = Array.isArray(maybeCandidate) ? maybeCandidate : [];
        // Only `prefixItems` is officially part of the JSON Schema spec, but `items` as array was part of a draft and was used by VSCode.
        const tuple = (schema.prefixItems ?? schema.items) as Required<IJSONSchema>['prefixItems'];
        const lengthIsWrong = candidate.length < tuple.length || (candidate.length > tuple.length && !schema.additionalItems);
        if (lengthIsWrong && shouldTryDefault) { return tryDefault(); }
        let valid = true;
        const validItems: JSONValue[] = [];
        for (const [index, subschema] of tuple.entries()) {
            const targetItem = candidate[index];
            const validatedItem = targetItem === undefined ? this.getDefaultFromSchema(subschema) : this.validateBySchema(key, targetItem, subschema);
            valid &&= validatedItem === targetItem;
            if (!valid && shouldTryDefault) { return tryDefault(); }
            validItems.push(validatedItem);
        };
        if (candidate.length > tuple.length) {
            if (!schema.additionalItems) {
                return validItems;
            } else if (schema.additionalItems === true && !valid) {
                validItems.push(...candidate.slice(tuple.length));
                return validItems;
            } else if (schema.additionalItems !== true) {
                const applicableSchema = schema.additionalItems;
                for (let i = tuple.length; i < candidate.length; i++) {
                    const targetItem = candidate[i];
                    const validatedItem = this.validateBySchema(key, targetItem, applicableSchema);
                    if (validatedItem === targetItem) {
                        validItems.push(targetItem);
                    } else {
                        valid = false;
                        if (shouldTryDefault) { return tryDefault(); }
                    }
                }
            }
        }
        return valid ? candidate : validItems;
    }

    protected validateConst(key: string, value: JSONValue, schema: IJSONSchema & { const: JSONValue }): JSONValue {
        if (PreferenceUtils.deepEqual(value, schema.const)) {
            return value;
        }
        return schema.const;
    }

    protected validateEnum(key: string, value: JSONValue, schema: IJSONSchema & { enum: JSONValue[] }): JSONValue {
        const options = schema.enum;
        if (options.some(option => PreferenceUtils.deepEqual(option, value))) {
            return value;
        }
        const configuredDefault = this.getDefaultFromSchema(schema);
        if (options.some(option => PreferenceUtils.deepEqual(option, configuredDefault))) {
            return configuredDefault;
        }
        return options[0];
    }

    protected validateBoolean(key: string, value: JSONValue, schema: IJSONSchema): boolean {
        if (value === true || value === false) {
            return value;
        }
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        return Boolean(this.getDefaultFromSchema(schema));
    }

    protected validateInteger(key: string, value: JSONValue, schema: IJSONSchema): number {
        return Math.round(this.validateNumber(key, value, schema));
    }

    protected validateNumber(key: string, value: JSONValue, schema: IJSONSchema): number {
        let validated = Number(value);
        if (isNaN(validated)) {
            const configuredDefault = Number(this.getDefaultFromSchema(schema));
            validated = isNaN(configuredDefault) ? 0 : configuredDefault;
        }
        if (schema.minimum !== undefined) {
            validated = Math.max(validated, schema.minimum);
        }
        if (schema.maximum !== undefined) {
            validated = Math.min(validated, schema.maximum);
        }
        return validated;
    }

    protected validateObject(key: string, value: JSONValue, schema: IJSONSchema): JSONObject {
        if (this.objectMatchesSchema(key, value, schema)) {
            return value;
        }
        const configuredDefault = this.getDefaultFromSchema(schema);
        if (this.objectMatchesSchema(key, configuredDefault, schema)) {
            return configuredDefault;
        }
        return {};
    }

    // This evaluates most of the fields that commonly appear on PreferenceItem, but it could be improved to evaluate all possible JSON schema specifications.
    protected objectMatchesSchema(key: string, value: JSONValue, schema: IJSONSchema): value is JSONObject {
        if (!value || typeof value !== 'object') {
            return false;
        }
        if (schema.required && schema.required.some(requiredField => !(requiredField in value))) {
            return false;
        }
        if (schema.additionalProperties === false && schema.properties && Object.keys(value).some(fieldKey => !(fieldKey in schema.properties!))) {
            return false;
        }
        const additionalPropertyValidator = schema.additionalProperties !== true && !!schema.additionalProperties && schema.additionalProperties as IJSONSchema;
        for (const [fieldKey, fieldValue] of Object.entries(value)) {
            const fieldLabel = `${key}#${fieldKey}`;
            if (schema.properties && fieldKey in schema.properties) {
                const valid = this.validateBySchema(fieldLabel, fieldValue, schema.properties[fieldKey]);
                if (valid !== fieldValue) {
                    return false;
                }
            } else if (additionalPropertyValidator) {
                const valid = this.validateBySchema(fieldLabel, fieldValue, additionalPropertyValidator);
                if (valid !== fieldValue) {
                    return false;
                }
            }
        }
        return true;
    }

    protected validateString(key: string, value: JSONValue, schema: IJSONSchema): string {
        if (typeof value === 'string') {
            return value;
        }
        if (value instanceof String) {
            return value.toString();
        }
        const configuredDefault = this.getDefaultFromSchema(schema);
        return (configuredDefault ?? '').toString();
    }

    protected getDefaultFromSchema(schema: IJSONSchema): JSONValue {
        return this.getDefaultValue(schema);
    }

    getDefaultValue(property: PreferenceDataProperty): JSONValue {
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
        // eslint-disable-next-line no-null/no-null
        return null;
    }
}
