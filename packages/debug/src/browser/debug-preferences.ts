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

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceSchema, PreferenceProxy, PreferenceService, createPreferenceProxy, PreferenceContribution } from '@theia/core/lib/browser/preferences';
import { interfaces } from '@theia/core/shared/inversify';

export const debugPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'debug.trace': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/debug/toggleTracing', 'Enable/disable tracing communications with debug adapters')
        },
        'debug.debugViewLocation': {
            enum: ['default', 'left', 'right', 'bottom'],
            default: 'default',
            description: nls.localize('theia/debug/debugViewLocation', 'Controls the location of the debug view.')
        },
        'debug.openDebug': {
            enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart', 'openOnDebugBreak'],
            default: 'openOnSessionStart',
            description: nls.localize('vscode/debug.contribution/openDebug', 'Controls when the debug view should open.')
        },
        'debug.internalConsoleOptions': {
            enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
            default: 'openOnFirstSessionStart',
            description: nls.localize('vscode/debug/internalConsoleOptions', 'Controls when the internal debug console should open.')
        },
        'debug.inlineValues': {
            type: 'boolean',
            default: false,
            description: nls.localize('vscode/debug.contribution/inlineValues', 'Show variable values inline in editor while debugging.')
        },
        'debug.showInStatusBar': {
            enum: ['never', 'always', 'onFirstSessionStart'],
            enumDescriptions: [
                nls.localize('vscode/debug.contribution/never', 'Never show debug in status bar'),
                nls.localize('vscode/debug.contribution/always', 'Always show debug in status bar'),
                nls.localize('vscode/debug.contribution/onFirstSessionStart', 'Show debug in status bar only after debug was started for the first time')
            ],
            description: nls.localize('vscode/debug.contribution/showInStatusBar', 'Controls when the debug status bar should be visible.'),
            default: 'onFirstSessionStart'
        },
        'debug.confirmOnExit': {
            description: 'Controls whether to confirm when the window closes if there are active debug sessions.',
            type: 'string',
            enum: ['never', 'always'],
            enumDescriptions: [
                'Never confirm.',
                'Always confirm if there are debug sessions.',
            ],
            default: 'never'
        }
    }
};

export class DebugConfiguration {
    'debug.trace': boolean;
    'debug.debugViewLocation': 'default' | 'left' | 'right' | 'bottom';
    'debug.openDebug': 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart' | 'openOnDebugBreak';
    'debug.internalConsoleOptions': 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
    'debug.inlineValues': boolean;
    'debug.showInStatusBar': 'never' | 'always' | 'onFirstSessionStart';
    'debug.confirmOnExit': 'never' | 'always';
}

export const DebugPreferenceContribution = Symbol('DebugPreferenceContribution');
export const DebugPreferences = Symbol('DebugPreferences');
export type DebugPreferences = PreferenceProxy<DebugConfiguration>;

export function createDebugPreferences(preferences: PreferenceService, schema: PreferenceSchema = debugPreferencesSchema): DebugPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindDebugPreferences(bind: interfaces.Bind): void {
    bind(DebugPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(DebugPreferenceContribution);
        return createDebugPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(DebugPreferenceContribution).toConstantValue({ schema: debugPreferencesSchema });
    bind(PreferenceContribution).toService(DebugPreferenceContribution);
}
