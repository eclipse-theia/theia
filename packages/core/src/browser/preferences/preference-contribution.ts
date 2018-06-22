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

import { inject, injectable, named } from "inversify";
import { ContributionProvider, ILogger } from '../../common';

export const PreferenceContribution = Symbol("PreferenceContribution");
export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}

export const PreferenceSchema = Symbol("PreferenceSchema");

export interface PreferenceSchema {
    [name: string]: Object,
    properties: {
        [name: string]: PreferenceProperty
    }
}

export interface PreferenceProperty {
    description: string;
    type?: JsonType | JsonType[];
    minimum?: number;
    // tslint:disable-next-line:no-any
    default?: any;
    enum?: string[];
    additionalProperties?: object;
    // tslint:disable-next-line:no-any
    [name: string]: any;
}

export type JsonType = 'string' | 'array' | 'number' | 'integer' | 'object' | 'boolean' | 'null';

@injectable()
export class PreferenceSchemaProvider {
    protected readonly combinedSchema: PreferenceSchema;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(ContributionProvider) @named(PreferenceContribution)
        protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>
    ) {
        this.preferenceContributions.getContributions().forEach(contrib => {
            for (const property in contrib.schema) {
                if (this.combinedSchema.properties[property]) {
                    this.logger.error("Preference name collision detected in the schema for property: " + property);
                } else {
                    this.combinedSchema.properties[property] = contrib.schema.properties[property];
                }
            }
        });
    }

    getSchema(): PreferenceSchema {
        return this.combinedSchema;
    }
}
