// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { PluginDebugPort } from '../common';

export const HostedPluginConfigSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'hosted-plugin.watchMode': {
            type: 'boolean',
            description: nls.localize('theia/plugin-dev/watchMode', 'Run watcher on plugin under development'),
            default: true
        },
        'hosted-plugin.debugMode': {
            type: 'string',
            description: nls.localize('theia/plugin-dev/debugMode', 'Using inspect or inspect-brk for Node.js debug'),
            default: 'inspect',
            enum: ['inspect', 'inspect-brk']
        },
        'hosted-plugin.launchOutFiles': {
            type: 'array',
            items: {
                type: 'string'
            },
            markdownDescription: nls.localize(
                'theia/plugin-dev/launchOutFiles',
                'Array of glob patterns for locating generated JavaScript files (`${pluginPath}` will be replaced by plugin actual path).'
            ),
            default: ['${pluginPath}/out/**/*.js']
        },
        'hosted-plugin.debugPorts': {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    'serverName': {
                        type: 'string',
                        description: nls.localize('theia/plugin-dev/debugPorts/serverName',
                            'The plugin host server name, e.g. "hosted-plugin" as in "--hosted-plugin-inspect=" ' +
                            'or "headless-hosted-plugin" as in "--headless-hosted-plugin-inspect="'),
                    },
                    'debugPort': {
                        type: 'number',
                        minimum: 0,
                        maximum: 65535,
                        description: nls.localize('theia/plugin-dev/debugPorts/debugPort', 'Port to use for this server\'s Node.js debug'),
                    }
                },
            },
            default: undefined,
            description: nls.localize('theia/plugin-dev/debugPorts', 'Port configuration per server for Node.js debug'),
        }
    }
};

export interface HostedPluginConfiguration {
    'hosted-plugin.watchMode': boolean;
    'hosted-plugin.debugMode': string;
    'hosted-plugin.launchOutFiles': string[];
    'hosted-plugin.debugPorts': PluginDebugPort[];
}

export const HostedPluginPreferenceContribution = Symbol('HostedPluginPreferenceContribution');
export const HostedPluginPreferences = Symbol('HostedPluginPreferences');
export type HostedPluginPreferences = PreferenceProxy<HostedPluginConfiguration>;

export function createNavigatorPreferences(preferences: PreferenceService, schema: PreferenceSchema = HostedPluginConfigSchema): HostedPluginPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindHostedPluginPreferences(bind: interfaces.Bind): void {
    bind(HostedPluginPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(HostedPluginPreferenceContribution);
        return createNavigatorPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(HostedPluginPreferenceContribution).toConstantValue({ schema: HostedPluginConfigSchema });
    bind(PreferenceContribution).toService(HostedPluginPreferenceContribution);
}
