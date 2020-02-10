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

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

// https://github.com/Microsoft/vscode-java-debug/blob/bcd69b52e4d941323cae662a154afd2a7852f43d/package.json#L353-L405 adjusted to Theia APIs

import { interfaces } from 'inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent
} from '@theia/core/lib/browser/preferences';

export const javaDebugPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'java.debug.logLevel': {
            'type': 'string',
            'default': 'warn',
            'description': 'Minimum level of debugger logs.',
            'enum': [
                'error',
                'warn',
                'info',
                'verbose'
            ]
        },
        'java.debug.settings.showHex': {
            'type': 'boolean',
            'description': 'Show numbers in hex format in \"Variables\" viewlet.',
            'default': false
        },
        'java.debug.settings.showStaticVariables': {
            'type': 'boolean',
            'description': 'Show static variables in \"Variables\" viewlet.',
            'default': true
        },
        'java.debug.settings.showQualifiedNames': {
            'type': 'boolean',
            'description': 'Show fully qualified class names in \"Variables\" viewlet.',
            'default': false
        },
        'java.debug.settings.maxStringLength': {
            'type': 'number',
            // eslint-disable-next-line max-len
            'description': 'The maximum length of strings displayed in \"Variables\" or \"Debug Console\" viewlet, strings longer than this length will be trimmed, if 0 no trim is performed.',
            'default': 0
        },
        'java.debug.settings.enableHotCodeReplace': {
            'type': 'boolean',
            'description': 'Enable hot code replace for Java code.',
            'default': true
        },
        'java.debug.settings.enableRunDebugCodeLens': {
            'type': 'boolean',
            'description': 'Enable the run and debug code lens providers over main methods.',
            'default': true
        }
    }
};

export interface JavaDebugConfiguration {
    'java.debug.logLevel'?: 'error' | 'warn' | 'info' | 'verbose'
    'java.debug.settings.showHex': boolean
    'java.debug.settings.showStaticVariables': boolean
    'java.debug.settings.showQualifiedNames': boolean
    'java.debug.settings.maxStringLength': number
    'java.debug.settings.enableHotCodeReplace': boolean
    'java.debug.settings.enableRunDebugCodeLens': boolean
}
export type JavaDebugPreferenceChange = PreferenceChangeEvent<JavaDebugConfiguration>;

export const JavaDebugPreferences = Symbol('JavaDebugPreferences');
export type JavaDebugPreferences = PreferenceProxy<JavaDebugConfiguration>;

export function createJavaDebugPreferences(preferences: PreferenceService): JavaDebugPreferences {
    return createPreferenceProxy(preferences, javaDebugPreferenceSchema);
}

export function bindJavaDebugPreferences(bind: interfaces.Bind): void {
    bind(JavaDebugPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createJavaDebugPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: javaDebugPreferenceSchema });
}
