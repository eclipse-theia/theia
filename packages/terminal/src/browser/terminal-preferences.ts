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
import { EDITOR_FONT_DEFAULTS } from '@theia/editor/lib/browser';

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
        },
        'terminal.integrated.fontFamily': {
            type: 'string',
            description: 'Controls the font family of the terminal.',
            default: EDITOR_FONT_DEFAULTS.fontFamily
        },
        'terminal.integrated.fontSize': {
            type: 'number',
            description: 'Controls the font size in pixels of the terminal.',
            minimum: 6,
            default: EDITOR_FONT_DEFAULTS.fontSize
        },
        'terminal.integrated.fontWeight': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: 'The font weight to use within the terminal for non-bold text.',
            default: 'normal'
        },
        'terminal.integrated.fontWeightBold': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: 'The font weight to use within the terminal for bold text.',
            default: 'bold'
        },
        'terminal.integrated.letterSpacing': {
            description: 'Controls the letter spacing of the terminal, this is an integer value which represents the amount of additional pixels to add between characters.',
            type: 'number',
            default: 1
        },
        'terminal.integrated.lineHeight': {
            description: 'Controls the line height of the terminal, this number is multiplied by the terminal font size to get the actual line-height in pixels.',
            type: 'number',
            minimum: 1,
            default: 1
        },
    }
};

export interface TerminalConfiguration {
    'terminal.enableCopy': boolean
    'terminal.enablePaste': boolean
    'terminal.integrated.fontFamily': string
    'terminal.integrated.fontSize': number
    'terminal.integrated.fontWeight': FontWeight
    'terminal.integrated.fontWeightBold': FontWeight
    'terminal.integrated.letterSpacing': number
    'terminal.integrated.lineHeight': number
}

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

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
