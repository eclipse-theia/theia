/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { interfaces } from 'inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent
} from '@theia/core/lib/browser/preferences';
import { JsonSchemaConfiguration } from '@theia/core/lib/browser/json-schema-store';

export const jsonPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'json.schemas': {
            'type': 'array',
            'description': 'Associate schemas to JSON files in the current project',
            'items': {
                'type': 'object',
                'default': {
                    'fileMatch': [
                        '/myfile'
                    ],
                    'url': 'schemaURL'
                },
                'properties': {
                    'url': {
                        'type': 'string',
                        'default': '/user.schema.json',
                        'description': 'A URL to a schema or a relative path to a schema in the current directory'
                    },
                    'fileMatch': {
                        'type': 'array',
                        'items': {
                            'type': 'string',
                            'default': 'MyFile.json',
                            'description': 'A file pattern that can contain \'*\' to match against when resolving JSON files to schemas.'
                        },
                        'minItems': 1,
                        'description': 'An array of file patterns to match against when resolving JSON files to schemas.'
                    }
                }
            }
        },
        'json.format.enable': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable/disable default JSON formatter'
        },
    }
};

export interface JsonConfiguration {
    'json.schemas': JsonSchemaConfiguration[]
    'json.format.enable': boolean
}
export type JsonPreferenceChange = PreferenceChangeEvent<JsonConfiguration>;

export const JsonPreferences = Symbol('JsonPreferences');
export type JsonPreferences = PreferenceProxy<JsonConfiguration>;

export function createJsonPreferences(preferences: PreferenceService): JsonPreferences {
    return createPreferenceProxy(preferences, jsonPreferenceSchema);
}

export function bindJsonPreferences(bind: interfaces.Bind): void {
    bind(JsonPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createJsonPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: jsonPreferenceSchema });
}
