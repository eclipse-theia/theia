// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { nls } from '@theia/core/lib/common/nls';
import { PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService, createPreferenceProxy } from '@theia/core/lib/common/preferences';
import { interfaces } from '@theia/core/shared/inversify';

export const debugPreferencesSchema: PreferenceSchema = {
    properties: {
        'debug.trace': {
            type: 'boolean',
            default: false,
            description: nls.localize('theia/debug/toggleTracing', 'Enable/disable tracing communications with debug adapters')
        },
        'debug.openDebug': {
            enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart', 'openOnDebugBreak'],
            default: 'openOnSessionStart',
            description: nls.localizeByDefault('Controls when the debug view should open.')
        },
        'debug.internalConsoleOptions': {
            enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
            default: 'openOnFirstSessionStart',
            description: nls.localizeByDefault('Controls when the internal Debug Console should open.')
        },
        'debug.inlineValues': {
            type: 'boolean',
            default: false,
            description: nls.localizeByDefault('Show variable values inline in editor while debugging.')
        },
        'debug.showInStatusBar': {
            enum: ['never', 'always', 'onFirstSessionStart'],
            enumDescriptions: [
                nls.localizeByDefault('Never show debug in Status bar'),
                nls.localizeByDefault('Always show debug in Status bar'),
                nls.localizeByDefault('Show debug in Status bar only after debug was started for the first time')
            ],
            description: nls.localizeByDefault('Controls when the debug Status bar should be visible.'),
            default: 'onFirstSessionStart'
        },
        'debug.confirmOnExit': {
            description: nls.localizeByDefault('Controls whether to confirm when the window closes if there are active debug sessions.'),
            type: 'string',
            enum: ['never', 'always'],
            enumDescriptions: [
                nls.localizeByDefault('Never confirm.'),
                nls.localizeByDefault('Always confirm if there are debug sessions.'),
            ],
            default: 'never'
        },
        'debug.disassemblyView.showSourceCode': {
            description: nls.localizeByDefault('Show Source Code in Disassembly View.'),
            type: 'boolean',
            default: true,
        },
        'debug.autoExpandLazyVariables': {
            type: 'string',
            enum: ['on', 'off'],
            default: 'off',
            enumDescriptions: [
                nls.localizeByDefault('Always automatically expand lazy variables.'),
                nls.localizeByDefault('Never automatically expand lazy variables.')
            ],
            description: nls.localizeByDefault('Controls whether variables that are lazily resolved, such as getters, are automatically resolved and expanded by the debugger.')
        },
    }
};

export class DebugConfiguration {
    'debug.trace': boolean;
    'debug.openDebug': 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart' | 'openOnDebugBreak';
    'debug.internalConsoleOptions': 'neverOpen' | 'openOnSessionStart' | 'openOnFirstSessionStart';
    'debug.inlineValues': boolean;
    'debug.showInStatusBar': 'never' | 'always' | 'onFirstSessionStart';
    'debug.confirmOnExit': 'never' | 'always';
    'debug.disassemblyView.showSourceCode': boolean;
    'debug.autoExpandLazyVariables': 'on' | 'off';
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
