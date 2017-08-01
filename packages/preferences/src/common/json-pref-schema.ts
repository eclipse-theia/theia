/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, named } from "inversify";
import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import * as ajv from 'ajv';


export const PreferenceContribution = Symbol("PreferenceContribution");
export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}

export interface PreferenceSchema {
    properties: {
        [name: string]: object
    }
}
export class PreferenceSchemaFactory {
    protected readonly combinedSchema: PreferenceSchema;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(ContributionProvider)
        @named(PreferenceContribution)
        protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>,
    ) {

        preferenceContributions.getContributions().forEach(contrib => {

            for (const property in contrib.schema) {
                if (this.combinedSchema.properties[property]) {
                    this.logger.error("Preference name collision detected in the schema for property: " + property);
                } else {
                    this.combinedSchema.properties[property] = contrib.schema.properties[property];
                }
            }
        });

        try {
            ajv().compile(this.combinedSchema);
        } catch (error) {
            this.logger.error("Invalid json schemas: ", error);
        }
    }

    getSchema(): PreferenceSchema {
        return this.combinedSchema;
    }
}