/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonSchema, CombinedSchema } from "./json-schema";
import { inject, named } from "inversify";
import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import * as ajv from 'ajv';


export const JsonSchemaContribution = Symbol("JsonSchemaContribution");
export interface JsonSchemaContribution {
    schema: {};
}

export class JsonPrefSchema implements JsonSchema {
    protected combinedSchema: CombinedSchema = { allOf: [] };

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
            ajv().compile(this.combinedSchema);
        } catch (error) {
            this.logger.error("Invalid json schemas: ", error);
        }
    }

    getSchema(): CombinedSchema {
        return this.combinedSchema;
    }
}