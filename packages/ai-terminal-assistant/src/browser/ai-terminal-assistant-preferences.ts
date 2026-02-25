// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { createPreferenceProxy, nls, PreferenceContribution, PreferenceProxy, PreferenceSchema, PreferenceService } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';

export const ASSISTANT_MODE_PREF = 'terminal.aiAssistant.mode';

export const AiTerminalAssistantPreferenceSchema: PreferenceSchema = {
    properties: {
        [ASSISTANT_MODE_PREF]: {
            type: 'string',
            enum: ['standalone', 'dedicated'],
            enumDescriptions: [
                nls.localize('theia/terminal/aiTerminalAssistant/modeStandalone', 'Run commands directly in an isolated AI assistant window.'),
                nls.localize('theia/terminal/aiTerminalAssistant/modeDedicated', 'Watch and summarize output from your existing terminal sessions.')
            ],
            default: 'standalone',
            description: nls.localize('theia/terminal/aiTerminalAssistant/changeMode', 'Controls the AI Terminal Assistant display mode')
        }
    }
}

export const AiTerminalAssistantPreferenceContribution = {
    schema: AiTerminalAssistantPreferenceSchema
};

export interface AiTerminalAssistantConfiguration {
    'terminal.aiAssistant.mode': 'standalone' | 'dedicated';
}

export type AiTerminalAssistantPreferences = PreferenceProxy<AiTerminalAssistantConfiguration>;

export const AiTerminalAssistantPreferences = Symbol('AiTerminalAssistantPreferences');

export function createAiTerminalAssistantPreferences(
    preferences: PreferenceService,
    schema: PreferenceSchema = AiTerminalAssistantPreferenceSchema
): AiTerminalAssistantPreferences {
    return createPreferenceProxy(preferences, schema);
}

 export function bindAiTerminalAssistantPreferences(bind: interfaces.Bind): void {
    bind(AiTerminalAssistantPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createAiTerminalAssistantPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: AiTerminalAssistantPreferenceSchema });
}
