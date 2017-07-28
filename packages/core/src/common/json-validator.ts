/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as ajv from 'ajv';
import { inject, named } from "inversify"
import { ContributionProvider } from './contribution-provider'
import { ILogger } from './logger'

export interface CombinedSchema {
    allOf: Object[];
}

export const JsonSchemaContribution = Symbol("JsonSchemaContribution");
export const JsonValidator = Symbol("JsonValidator");
export interface JsonSchemaContribution {
    schema: {};
}

export interface JsonValidator {
    getSchema(): CombinedSchema;
    validateJson(toValidate: string): boolean;
}

export class PrefJsonValidator implements JsonValidator {
    protected combinedSchema: CombinedSchema = { allOf: [] };

    protected validate: ajv.ValidateFunction;
    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(ContributionProvider)
        @named(JsonSchemaContribution)
        protected readonly schemaContributions: ContributionProvider<JsonSchemaContribution>,
    ) {
        let combinedSchemas: Object[] = [];

        schemaContributions.getContributions().forEach(contrib => {
            combinedSchemas.push(contrib);
        });

        this.combinedSchema.allOf = combinedSchemas;

        try {
            this.validate = ajv().compile(this.combinedSchema);
        } catch (error) {
            this.logger.error("Invalid json schemas: ", error);
        }
    }

    getSchema(): CombinedSchema {
        return this.combinedSchema;
    }

    validateJson(toValidate: string): boolean {
        if (this.validate(toValidate)) {
            return true
        } else {
            return false;
        }
    }
}