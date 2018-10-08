/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';

export const HostedPluginConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'hosted-plugin.watchMode': {
            type: 'boolean',
            description: 'Run watcher on plugin under development',
            default: true
        },
        'hosted-plugin.debugMode': {
            type: 'string',
            description: 'Using inspect or inspect-brk for Node.js debug',
            default: 'inspect',
            enum: ['inspect', 'inspect-brk']
        }
    }
};

export interface HostedPluginConfiguration {
    'hosted-plugin.watchMode': boolean;
    'hosted-plugin.debugMode': string;
}

export const HostedPluginPreferences = Symbol('HostedPluginPreferences');
export type HostedPluginPreferences = PreferenceProxy<HostedPluginConfiguration>;

export function createNavigatorPreferences(preferences: PreferenceService): HostedPluginPreferences {
    return createPreferenceProxy(preferences, HostedPluginConfigSchema);
}

export function bindHostedPluginPreferences(bind: interfaces.Bind): void {
    bind(HostedPluginPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createNavigatorPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: HostedPluginConfigSchema });
}
