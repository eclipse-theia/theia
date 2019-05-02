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

export const typescriptPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'typescript.server.log': {
            'type': 'string',
            'enum': [
                'off',
                'terse',
                'normal',
                'verbose'
            ],
            'default': 'off',
            // tslint:disable-next-line:max-line-length
            'description': 'Enables logging of the TS server to a file. This log can be used to diagnose TS Server issues. The log may contain file paths, source code, and other potentially sensitive information from your project.'
        },
        'typescript.tsdk': {
            'type': [
                'string',
                'null'
            ],
            // tslint:disable-next-line:no-null-keyword
            'default': null,
            'description': 'Specifies the folder path containing the tsserver and lib*.d.ts files to use.',
            'scope': 'window'
        }
    }
};

export interface TypescriptConfiguration {
    'typescript.server.log': 'off' | 'terse' | 'normal' | 'verbose'
    'typescript.tsdk'?: string
}
export type TypescriptPreferenceChange = PreferenceChangeEvent<TypescriptConfiguration>;

export const TypescriptPreferences = Symbol('TypescriptPreferences');
export type TypescriptPreferences = PreferenceProxy<TypescriptConfiguration>;

export function createTypescriptPreferences(preferences: PreferenceService): TypescriptPreferences {
    return createPreferenceProxy(preferences, typescriptPreferenceSchema);
}

export function bindTypescriptPreferences(bind: interfaces.Bind): void {
    bind(TypescriptPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createTypescriptPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: typescriptPreferenceSchema });
}
