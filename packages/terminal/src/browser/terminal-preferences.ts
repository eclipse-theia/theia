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

import { interfaces } from '@theia/core/shared/inversify';
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
        'terminal.integrated.drawBoldTextInBrightColors': {
            description: 'Controls whether to draw bold text in bright colors.',
            type: 'boolean',
            default: true,
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
        'terminal.integrated.scrollback': {
            description: 'Controls the maximum amount of lines the terminal keeps in its buffer.',
            type: 'number',
            default: 1000
        },
        'terminal.integrated.fastScrollSensitivity': {
            description: 'Controls the scrolling speed when pressing \'alt\'.',
            type: 'number',
            default: 5,
        },
        'terminal.integrated.rendererType': {
            description: 'Controls how the terminal is rendered.',
            type: 'string',
            enum: ['canvas', 'dom'],
            default: 'canvas'
        },
        'terminal.integrated.copyOnSelection': {
            description: 'Controls whether text selected in the terminal will be copied to the clipboard.',
            type: 'boolean',
            default: false,
        },
        'terminal.integrated.cursorBlinking': {
            description: 'Controls whether the terminal cursor blinks.',
            type: 'boolean',
            default: false
        },
        'terminal.integrated.cursorStyle': {
            description: 'Controls the style of the terminal cursor.',
            enum: ['block', 'underline', 'line'],
            default: 'block'
        },
        'terminal.integrated.cursorWidth': {
            description: 'Controls the width of the cursor when \'terminal.integrated.cursorStyle\' is set to \'line\'.',
            markdownDescription: 'Controls the width of the cursor when `#terminal.integrated.cursorStyle#` is set to `line`.',
            type: 'number',
            default: 1
        },
        'terminal.integrated.shell.windows': {
            type: ['string', 'null'],
            description: 'The path of the shell that the terminal uses on Windows. (default: C:\\Windows\\System32\\cmd.exe).',
            markdownDescription: 'The path of the shell that the terminal uses on Windows. (default: C:\\Windows\\System32\\cmd.exe).',
            default: undefined
        },
        'terminal.integrated.shell.osx': {
            type: ['string', 'null'],
            description: `The path of the shell that the terminal uses on macOS (default: ${process.env.SHELL || '/bin/bash'}).`,
            markdownDescription: `The path of the shell that the terminal uses on macOS (default: ${process.env.SHELL || '/bin/bash'}).`,
            default: undefined
        },
        'terminal.integrated.shell.linux': {
            type: ['string', 'null'],
            description: `The path of the shell that the terminal uses on Linux (default: ${process.env.SHELL || '/bin/bash'}).`,
            markdownDescription: `The path of the shell that the terminal uses on Linux (default: ${process.env.SHELL || '/bin/bash'}).`,
            default: undefined
        },
        'terminal.integrated.shellArgs.windows': {
            type: 'array',
            description: 'The command line arguments to use when on the Windows terminal.',
            markdownDescription: 'The command line arguments to use when on the Windows terminal.',
            default: []
        },
        'terminal.integrated.shellArgs.osx': {
            type: 'array',
            description: 'The command line arguments to use when on the macOS terminal.',
            markdownDescription: 'The command line arguments to use when on the macOS terminal.',
            default: [
                '-l'
            ]
        },
        'terminal.integrated.shellArgs.linux': {
            type: 'array',
            description: 'The command line arguments to use when on the Linux terminal.',
            markdownDescription: 'The command line arguments to use when on the Linux terminal.',
            default: []
        },
    }
};

export interface TerminalConfiguration {
    'terminal.enableCopy': boolean
    'terminal.enablePaste': boolean
    // xterm compatible, see https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/
    'terminal.integrated.fontFamily': string
    'terminal.integrated.fontSize': number
    'terminal.integrated.fontWeight': FontWeight
    'terminal.integrated.fontWeightBold': FontWeight,
    'terminal.integrated.drawBoldTextInBrightColors': boolean,
    'terminal.integrated.letterSpacing': number
    'terminal.integrated.lineHeight': number,
    'terminal.integrated.scrollback': number,
    'terminal.integrated.fastScrollSensitivity': number,
    'terminal.integrated.rendererType': TerminalRendererType,
    'terminal.integrated.copyOnSelection': boolean,
    'terminal.integrated.cursorBlinking': boolean,
    'terminal.integrated.cursorStyle': CursorStyleVSCode,
    'terminal.integrated.cursorWidth': number,
    'terminal.integrated.shell.windows': string | null | undefined,
    'terminal.integrated.shell.osx': string | null | undefined,
    'terminal.integrated.shell.linux': string | null | undefined,
    'terminal.integrated.shellArgs.windows': string[],
    'terminal.integrated.shellArgs.osx': string[],
    'terminal.integrated.shellArgs.linux': string[],
}

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type CursorStyle = 'block' | 'underline' | 'bar';
// VS Code uses 'line' to represent 'bar'. The following conversion is necessary to support their preferences.
export type CursorStyleVSCode = CursorStyle | 'line';
export type TerminalRendererType = 'canvas' | 'dom';
export const DEFAULT_TERMINAL_RENDERER_TYPE = 'canvas';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTerminalRendererType(arg: any): arg is TerminalRendererType {
    return typeof arg === 'string' && (arg === 'canvas' || arg === 'dom');
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
