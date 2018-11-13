/********************************************************************************
 * Copyright (C) 2018 Bitsler and others.
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

export const TerminalConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'terminal.enableCopy': {
            type: 'boolean',
            description: 'Enable ctrl-c (cmd-c on macOS) to copy selected text',
            default: true
        },
        'terminal.enablePaste': {
            type: 'boolean',
            description: 'Enable ctrl-v (cmd-v on macOS) to paste from clipboard',
            default: true
        }
    }
};

export interface TerminalConfiguration {
    'terminal.enableCopy': boolean
    'terminal.enablePaste': boolean
}

export const TerminalPreferences = Symbol('TerminalPreferences');
export type TerminalPreferences = PreferenceProxy<TerminalConfiguration>;

export function createTerminalPreferences(preferences: PreferenceService): TerminalPreferences {
    return createPreferenceProxy(preferences, TerminalConfigSchema);
}

export function bindTerminalPreferences(bind: interfaces.Bind): void {
    bind(TerminalPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createTerminalPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: TerminalConfigSchema });
}
