// *****************************************************************************
// Copyright (C) 2018 Bitsler and others.
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

/* eslint-disable max-len */

import { interfaces } from '@theia/core/shared/inversify';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema, PreferenceSchemaProperties } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { editorGeneratedPreferenceProperties } from '@theia/editor/lib/browser/editor-generated-preference-schema';
import { OS } from '@theia/core';
import { terminalAnsiColorMap } from './terminal-theme-service';

const commonProfileProperties: PreferenceSchemaProperties = {
    env: {
        type: 'object',
        additionalProperties: {
            type: 'string'
        },
        markdownDescription: nls.localizeByDefault('An object with environment variables that will be added to the terminal profile process. Set to `null` to delete environment variables from the base environment.'),
    },
    overrideName: {
        type: 'boolean',
        description: nls.localizeByDefault('Whether or not to replace the dynamic terminal title that detects what program is running with the static profile name.')
    },
    icon: {
        type: 'string',
        markdownDescription: nls.localize('theia/terminal/profileIcon', 'A codicon ID to associate with the terminal icon.\nterminal-tmux:"$(terminal-tmux)"')
    },
    color: {
        type: 'string',
        enum: Object.getOwnPropertyNames(terminalAnsiColorMap),
        description: nls.localize('theia/terminal/profileColor', 'A terminal theme color ID to associate with the terminal.')
    }
};

const stringOrStringArray: IJSONSchema = {
    oneOf: [
        { type: 'string' },
        {
            type: 'array',
            items: {
                type: 'string'
            }
        }
    ]
};

const pathProperty: IJSONSchema = {
    description: nls.localize('theia/terminal/profilePath', 'The path of the shell that this profile uses.'),
    ...stringOrStringArray
};

function shellArgsDeprecatedMessage(type: OS.Type): string {
    return nls.localize('theia/terminal/shell.deprecated', 'This is deprecated, the new recommended way to configure your default shell is by creating a terminal profile in \'terminal.integrated.profiles.{0}\' and setting its profile name as the default in \'terminal.integrated.defaultProfile.{0}.\'', type.toString().toLowerCase());
}

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
            markdownDescription: nls.localizeByDefault('Controls the font family of the terminal. Defaults to {0}\'s value.', '`#editor.fontFamily#`'),
            default: editorGeneratedPreferenceProperties['editor.fontFamily'].default,
        },
        'terminal.integrated.fontSize': {
            type: 'number',
            description: nls.localizeByDefault('Controls the font size in pixels of the terminal.'),
            minimum: 6,
            default: editorGeneratedPreferenceProperties['editor.fontSize'].default
        },
        'terminal.integrated.fontWeight': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: nls.localizeByDefault('The font weight to use within the terminal for non-bold text. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000.'),
            default: 'normal'
        },
        'terminal.integrated.fontWeightBold': {
            type: 'string',
            enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
            description: nls.localizeByDefault('The font weight to use within the terminal for bold text. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000.'),
            default: 'bold'
        },
        'terminal.integrated.drawBoldTextInBrightColors': {
            description: nls.localizeByDefault('Controls whether bold text in the terminal will always use the \"bright\" ANSI color variant.'),
            type: 'boolean',
            default: true,
        },
        'terminal.integrated.letterSpacing': {
            description: nls.localizeByDefault('Controls the letter spacing of the terminal. This is an integer value which represents the number of additional pixels to add between characters.'),
            type: 'number',
            default: 1
        },
        'terminal.integrated.lineHeight': {
            description: nls.localizeByDefault('Controls the line height of the terminal. This number is multiplied by the terminal font size to get the actual line-height in pixels.'),
            type: 'number',
            minimum: 1,
            default: 1
        },
        'terminal.integrated.scrollback': {
            description: nls.localizeByDefault('Controls the maximum number of lines the terminal keeps in its buffer. We pre-allocate memory based on this value in order to ensure a smooth experience. As such, as the value increases, so will the amount of memory.'),
            type: 'number',
            default: 1000
        },
        'terminal.integrated.fastScrollSensitivity': {
            markdownDescription: nls.localizeByDefault('Scrolling speed multiplier when pressing `Alt`.'),
            type: 'number',
            default: 5,
        },
        'terminal.integrated.rendererType': {
            description: nls.localize('theia/terminal/rendererType', 'Controls how the terminal is rendered.'),
            type: 'string',
            enum: ['canvas', 'dom'],
            default: 'canvas',
            deprecationMessage: nls.localize('theia/terminal/rendererTypeDeprecationMessage', 'The renderer type is no longer supported as an option.')
        },
        'terminal.integrated.copyOnSelection': {
            description: nls.localizeByDefault('Controls whether text selected in the terminal will be copied to the clipboard.'),
            type: 'boolean',
            default: false,
        },
        'terminal.integrated.cursorBlinking': {
            description: nls.localizeByDefault('Controls whether the terminal cursor blinks.'),
            type: 'boolean',
            default: false
        },
        'terminal.integrated.cursorStyle': {
            description: nls.localizeByDefault('Controls the style of terminal cursor when the terminal is focused.'),
            enum: ['block', 'underline', 'line'],
            default: 'block'
        },
        'terminal.integrated.cursorWidth': {
            markdownDescription: nls.localizeByDefault('Controls the width of the cursor when {0} is set to {1}.', '`#terminal.integrated.cursorStyle#`', '`line`'),
            type: 'number',
            default: 1
        },
        'terminal.integrated.shell.windows': {
            type: ['string', 'null'],
            typeDetails: { isFilepath: true },
            markdownDescription: nls.localize('theia/terminal/shellWindows', 'The path of the shell that the terminal uses on Windows. (default: \'{0}\').', 'C:\\Windows\\System32\\cmd.exe'),
            default: undefined,
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.Windows),
        },
        'terminal.integrated.shell.osx': {
            type: ['string', 'null'],
            markdownDescription: nls.localize('theia/terminal/shellOsx', 'The path of the shell that the terminal uses on macOS (default: \'{0}\'}).', '/bin/bash'),
            default: undefined,
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.OSX),
        },
        'terminal.integrated.shell.linux': {
            type: ['string', 'null'],
            markdownDescription: nls.localize('theia/terminal/shellLinux', 'The path of the shell that the terminal uses on Linux (default: \'{0}\'}).', '/bin/bash'),
            default: undefined,
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.Linux),
        },
        'terminal.integrated.shellArgs.windows': {
            type: 'array',
            markdownDescription: nls.localize('theia/terminal/shellArgsWindows', 'The command line arguments to use when on the Windows terminal.'),
            default: [],
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.Windows),
        },
        'terminal.integrated.shellArgs.osx': {
            type: 'array',
            markdownDescription: nls.localize('theia/terminal/shellArgsOsx', 'The command line arguments to use when on the macOS terminal.'),
            default: [
                '-l'
            ],
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.OSX),
        },
        'terminal.integrated.shellArgs.linux': {
            type: 'array',
            markdownDescription: nls.localize('theia/terminal/shellArgsLinux', 'The command line arguments to use when on the Linux terminal.'),
            default: [],
            deprecationMessage: shellArgsDeprecatedMessage(OS.Type.Linux),
        },
        'terminal.integrated.confirmOnExit': {
            type: 'string',
            description: nls.localizeByDefault('Controls whether to confirm when the window closes if there are active terminal sessions.'),
            enum: ['never', 'always', 'hasChildProcesses'],
            enumDescriptions: [
                nls.localizeByDefault('Never confirm.'),
                nls.localizeByDefault('Always confirm if there are terminals.'),
                nls.localizeByDefault('Confirm if there are any terminals that have child processes.'),
            ],
            default: 'never'
        },
        'terminal.integrated.enablePersistentSessions': {
            type: 'boolean',
            description: nls.localizeByDefault('Persist terminal sessions/history for the workspace across window reloads.'),
            default: true
        },
        'terminal.integrated.defaultProfile.windows': {
            type: 'string',
            description: nls.localize('theia/terminal/defaultProfile', 'The default profile used on {0}', OS.Type.Windows.toString())

        },
        'terminal.integrated.defaultProfile.linux': {
            type: 'string',
            description: nls.localize('theia/terminal/defaultProfile', 'The default profile used on {0}', OS.Type.Linux.toString())

        },
        'terminal.integrated.defaultProfile.osx': {
            type: 'string',
            description: nls.localize('theia/terminal/defaultProfile', 'The default profile used on {0}', OS.Type.OSX.toString())
        },
        'terminal.integrated.profiles.windows': {
            markdownDescription: nls.localize('theia/terminal/profiles', 'The profiles to present when creating a new terminal. Set the path property manually with optional args.\nSet an existing profile to `null` to hide the profile from the list, for example: `"{0}": null`.', 'cmd'),
            anyOf: [
                {
                    type: 'object',
                    properties: {
                    },
                    additionalProperties: {
                        oneOf: [{
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: pathProperty,
                                args: {
                                    ...stringOrStringArray,
                                    description: nls.localize('theia/terminal/profileArgs', 'The shell arguments that this profile uses.'),

                                },
                                ...commonProfileProperties
                            },
                            required: ['path']
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                source: {
                                    type: 'string',
                                    description: nls.localizeByDefault('A profile source that will auto detect the paths to the shell. Note that non-standard executable locations are not supported and must be created manually in a new profile.')
                                },
                                args: {
                                    ...stringOrStringArray,
                                    description: nls.localize('theia/terminal/profileArgs', 'The shell arguments that this profile uses.'),

                                },
                                ...commonProfileProperties
                            },
                            required: ['source'],
                            default: {
                                path: 'C:\\Windows\\System32\\cmd.exe'
                            }

                        }, {
                            type: 'null'
                        }]
                    },
                    default: {
                        cmd: {
                            path: 'C:\\Windows\\System32\\cmd.exe'
                        }
                    }
                },
                { type: 'null' }
            ]
        },
        'terminal.integrated.profiles.linux': {
            markdownDescription: nls.localize('theia/terminal/profiles', 'The profiles to present when creating a new terminal. Set the path property manually with optional args.\nSet an existing profile to `null` to hide the profile from the list, for example: `"{0}": null`.', 'bash'),
            anyOf: [{
                type: 'object',
                properties: {
                },
                additionalProperties: {
                    oneOf: [
                        {
                            type: 'object',
                            properties: {
                                path: pathProperty,
                                args: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: nls.localize('theia/terminal/profileArgs', 'The shell arguments that this profile uses.'),
                                },
                                ...commonProfileProperties
                            },
                            required: ['path'],
                            additionalProperties: false,
                        },
                        { type: 'null' }
                    ]
                },
                default: {
                    path: '${env:SHELL}',
                    args: ['-l']
                }

            },
            { type: 'null' }
            ]
        },
        'terminal.integrated.profiles.osx': {
            markdownDescription: nls.localize('theia/terminal/profiles', 'The profiles to present when creating a new terminal. Set the path property manually with optional args.\nSet an existing profile to `null` to hide the profile from the list, for example: `"{0}": null`.', 'zsh'),
            anyOf: [{
                type: 'object',
                properties: {
                },
                additionalProperties: {
                    oneOf: [
                        {
                            type: 'object',
                            properties: {
                                path: pathProperty,
                                args: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: nls.localize('theia/terminal/profileArgs', 'The shell arguments that this profile uses.'),
                                },
                                ...commonProfileProperties
                            },
                            required: ['path'],
                            additionalProperties: false,
                        },
                        { type: 'null' }
                    ]
                },
                default: {
                    path: '${env:SHELL}',
                    args: ['-l']
                }

            },
            { type: 'null' }
            ]
        },
    }
};

export type Profiles = null | {
    [key: string]: {
        path?: string | string[],
        source?: string,
        args?: string | string[],
        env?: { [key: string]: string },
        overrideName?: boolean;
        icon?: string,
        color?: string
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
    'terminal.integrated.defaultProfile.windows': string,
    'terminal.integrated.defaultProfile.linux': string,
    'terminal.integrated.defaultProfile.osx': string,
    'terminal.integrated.profiles.windows': Profiles
    'terminal.integrated.profiles.linux': Profiles,
    'terminal.integrated.profiles.osx': Profiles,
    'terminal.integrated.confirmOnExit': ConfirmOnExitType
    'terminal.integrated.enablePersistentSessions': boolean
}

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type CursorStyle = 'block' | 'underline' | 'bar';
// VS Code uses 'line' to represent 'bar'. The following conversion is necessary to support their preferences.
export type CursorStyleVSCode = CursorStyle | 'line';
export type TerminalRendererType = 'canvas' | 'dom';
export type ConfirmOnExitType = 'never' | 'always' | 'hasChildProcesses';
export const DEFAULT_TERMINAL_RENDERER_TYPE = 'canvas';
export function isTerminalRendererType(arg: unknown): arg is TerminalRendererType {
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
