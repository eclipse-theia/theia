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

import { PreferenceSchema, PreferenceProxy, PreferenceService, createPreferenceProxy, PreferenceContribution } from '@theia/core/lib/browser/preferences';
import { interfaces } from 'inversify';

export const debugPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'debug.trace': {
            type: 'boolean',
            default: false,
            description: 'Enable/disable tracing communications with debug adapters'
        }
    }
};

export class DebugConfiguration {
    'debug.trace': boolean;
}

export const DebugPreferences = Symbol('DebugPreferences');
export type DebugPreferences = PreferenceProxy<DebugConfiguration>;

export function createDebugreferences(preferences: PreferenceService): DebugPreferences {
    return createPreferenceProxy(preferences, debugPreferencesSchema);
}

export function bindDebugPreferences(bind: interfaces.Bind): void {
    bind(DebugPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createDebugreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: debugPreferencesSchema });
}
