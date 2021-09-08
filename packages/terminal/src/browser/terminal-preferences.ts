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

/* eslint-disable max-len */

import { interfaces } from '@theia/core/shared/inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@theia/core/lib/browser';
import { EDITOR_FONT_DEFAULTS } from '@theia/editor/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export const TerminalConfigSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        'terminal.enableCopy': {
            type: 'boolean',
            description: nls.localize('theia/terminal/enableCopy', 'Enable ctrl-c (cmd-c on macOS) to copy selected text'),
            default: true
        },
        'terminal.enablePaste': {
            type: 'boolean',
            description: nls.localize('theia/terminal/enablePaste', 'Enable ctrl-v (cmd-v on macOS) to paste from clipboard'),
            default: true
        },
        'terminal.integrated.fontFamily': {
            type: 'string',
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.fontFamily', 'Controls the font family of the terminal.'),
            default: EDITOR_FONT_DEFAULTS.fontFamily
        },
        'terminal.integrated.fontSize': {
            type: 'number',
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.fontSize', 'Controls the font size in pixels of the terminal.'),
            minimum: 6,
            default: EDITOR_FONT_DEFAULTS.fontSize
        },
        'terminal.integrated.fontWeight': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.fontWeight', 'The font weight to use within the terminal for non-bold text.'),
            default: 'normal'
        },
        'terminal.integrated.fontWeightBold': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.fontWeightBold', 'The font weight to use within the terminal for bold text.'),
            default: 'bold'
        },
        'terminal.integrated.drawBoldTextInBrightColors': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.drawBoldTextInBrightColors', 'Controls whether to draw bold text in bright colors.'),
            type: 'boolean',
            default: true,
        },
        'terminal.integrated.letterSpacing': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.letterSpacing', 'Controls the letter spacing of the terminal, this is an integer value which represents the amount of additional pixels to add between characters.'),
            type: 'number',
            default: 1
        },
        'terminal.integrated.lineHeight': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.lineHeight', 'Controls the line height of the terminal, this number is multiplied by the terminal font size to get the actual line-height in pixels.'),
            type: 'number',
            minimum: 1,
            default: 1
        },
        'terminal.integrated.scrollback': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.scrollback', 'Controls the maximum amount of lines the terminal keeps in its buffer.'),
            type: 'number',
            default: 1000
        },
        'terminal.integrated.fastScrollSensitivity': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.fastScrollSensitivity', 'Controls the scrolling speed when pressing \'alt\'.'),
            type: 'number',
            default: 5,
        },
        'terminal.integrated.rendererType': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.rendererType', 'Controls how the terminal is rendered.'),
            type: 'string',
            enum: ['canvas', 'dom'],
            default: 'canvas'
        },
        'terminal.integrated.copyOnSelection': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.copyOnSelection', 'Controls whether text selected in the terminal will be copied to the clipboard.'),
            type: 'boolean',
            default: false,
        },
        'terminal.integrated.cursorBlinking': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.cursorBlinking', 'Controls whether the terminal cursor blinks.'),
            type: 'boolean',
            default: false
        },
        'terminal.integrated.cursorStyle': {
            description: nls.localize('vscode/terminalConfiguration/terminal.integrated.cursorStyle', 'Controls the style of the terminal cursor.'),
            enum: ['block', 'underline', 'line'],
            default: 'block'
        },
        'terminal.integrated.cursorWidth': {
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.cursorWidth', 'Controls the width of the cursor when `#terminal.integrated.cursorStyle#` is set to `line`.'),
            type: 'number',
            default: 1
        },
        'terminal.integrated.shell.windows': {
            type: ['string', 'null'],
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shell.windows', 'The path of the shell that the terminal uses on Windows. (default: C:\\Windows\\System32\\cmd.exe).'),
            default: undefined
        },
        'terminal.integrated.shell.osx': {
            type: ['string', 'null'],
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shell.osx', 'The path of the shell that the terminal uses on macOS (default: \'/bin/bash\'}).'),
            default: undefined
        },
        'terminal.integrated.shell.linux': {
            type: ['string', 'null'],
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shell.linux', 'The path of the shell that the terminal uses on Linux (default: \'/bin/bash\'}).'),
            default: undefined
        },
        'terminal.integrated.shellArgs.windows': {
            type: 'array',
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shellArgs.windows', 'The command line arguments to use when on the Windows terminal.'),
            default: []
        },
        'terminal.integrated.shellArgs.osx': {
            type: 'array',
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shellArgs.osx', 'The command line arguments to use when on the macOS terminal.'),
            default: [
                '-l'
            ]
        },
        'terminal.integrated.shellArgs.linux': {
            type: 'array',
            markdownDescription: nls.localize('vscode/terminalConfiguration/terminal.integrated.shellArgs.linux', 'The command line arguments to use when on the Linux terminal.'),
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

export const TerminalPreferenceContribution = Symbol('TerminalPreferenceContribution');
export const TerminalPreferences = Symbol('TerminalPreferences');
export type TerminalPreferences = PreferenceProxy<TerminalConfiguration>;

export function createTerminalPreferences(preferences: PreferenceService, schema: PreferenceSchema = TerminalConfigSchema): TerminalPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindTerminalPreferences(bind: interfaces.Bind): void {
    bind(TerminalPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        const contribution = ctx.container.get<PreferenceContribution>(TerminalPreferenceContribution);
        return createTerminalPreferences(preferences, contribution.schema);
    }).inSingletonScope();
    bind(TerminalPreferenceContribution).toConstantValue({ schema: TerminalConfigSchema });
    bind(PreferenceContribution).toService(TerminalPreferenceContribution);
}
