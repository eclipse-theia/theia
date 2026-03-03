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
import { PreferenceService } from '@theia/core/lib/common';
import { createPreferenceProxy, PreferenceProxy } from '@theia/core/lib/common/preferences/preference-proxy';
import { nls } from '@theia/core/lib/common/nls';
import { editorGeneratedPreferenceProperties } from '@theia/editor/lib/common/editor-generated-preference-schema';
import { OS } from '@theia/core';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { ColorDefaults } from '@theia/core/lib/common/color';

/**
 * It should be aligned with https://github.com/microsoft/vscode/blob/0dfa355b3ad185a6289ba28a99c141ab9e72d2be/src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts#L40
 */
export const terminalAnsiColorMap: { [key: string]: { index: number, defaults: ColorDefaults } } = {
    'terminal.ansiBlack': {
        index: 0,
        defaults: {
            light: '#000000',
            dark: '#000000',
            hcDark: '#000000',
            hcLight: '#292929'
        }
    },
    'terminal.ansiRed': {
        index: 1,
        defaults: {
            light: '#cd3131',
            dark: '#cd3131',
            hcDark: '#cd0000',
            hcLight: '#cd3131'
        }
    },
    'terminal.ansiGreen': {
        index: 2,
        defaults: {
            light: '#00BC00',
            dark: '#0DBC79',
            hcDark: '#00cd00',
            hcLight: '#00bc00'
        }
    },
    'terminal.ansiYellow': {
        index: 3,
        defaults: {
            light: '#949800',
            dark: '#e5e510',
            hcDark: '#cdcd00',
            hcLight: '#949800'
        }
    },
    'terminal.ansiBlue': {
        index: 4,
        defaults: {
            light: '#0451a5',
            dark: '#2472c8',
            hcDark: '#0000ee',
            hcLight: '#0451a5'
        }
    },
    'terminal.ansiMagenta': {
        index: 5,
        defaults: {
            light: '#bc05bc',
            dark: '#bc3fbc',
            hcDark: '#cd00cd',
            hcLight: '#bc05bc'
        }
    },
    'terminal.ansiCyan': {
        index: 6,
        defaults: {
            light: '#0598bc',
            dark: '#11a8cd',
            hcDark: '#00cdcd',
            hcLight: '#0598b'
        }
    },
    'terminal.ansiWhite': {
        index: 7,
        defaults: {
            light: '#555555',
            dark: '#e5e5e5',
            hcDark: '#e5e5e5',
            hcLight: '#555555'
        }
    },
    'terminal.ansiBrightBlack': {
        index: 8,
        defaults: {
            light: '#666666',
            dark: '#666666',
            hcDark: '#7f7f7f',
            hcLight: '#666666'
        }
    },
    'terminal.ansiBrightRed': {
        index: 9,
        defaults: {
            light: '#cd3131',
            dark: '#f14c4c',
            hcDark: '#ff0000',
            hcLight: '#cd3131'
        }
    },
    'terminal.ansiBrightGreen': {
        index: 10,
        defaults: {
            light: '#14CE14',
            dark: '#23d18b',
            hcDark: '#00ff00',
            hcLight: '#00bc00'
        }
    },
    'terminal.ansiBrightYellow': {
        index: 11,
        defaults: {
            light: '#b5ba00',
            dark: '#f5f543',
            hcDark: '#ffff00',
            hcLight: '#b5ba00'
        }
    },
    'terminal.ansiBrightBlue': {
        index: 12,
        defaults: {
            light: '#0451a5',
            dark: '#3b8eea',
            hcDark: '#5c5cff',
            hcLight: '#0451a5'
        }
    },
    'terminal.ansiBrightMagenta': {
        index: 13,
        defaults: {
            light: '#bc05bc',
            dark: '#d670d6',
            hcDark: '#ff00ff',
            hcLight: '#bc05bc'
        }
    },
    'terminal.ansiBrightCyan': {
        index: 14,
        defaults: {
            light: '#0598bc',
            dark: '#29b8db',
            hcDark: '#00ffff',
            hcLight: '#0598bc'
        }
    },
    'terminal.ansiBrightWhite': {
        index: 15,
        defaults: {
            light: '#a5a5a5',
            dark: '#e5e5e5',
            hcDark: '#ffffff',
            hcLight: '#a5a5a5'
        }
    }
};

const commonProfileProperties: PreferenceSchema['properties'] = {
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
        // TODO: This preference currently features no implementation but is only available for plugins to use.
        'terminal.integrated.commandsToSkipShell': {
            type: 'array',
            markdownDescription: nls.localizeByDefault('A set of command IDs whose keybindings will not be sent to the shell but instead always be handled by VS Code. This allows keybindings that would normally be consumed by the shell to act instead the same as when the terminal is not focused, for example `Ctrl+P` to launch Quick Open.\n\n&nbsp;\n\nMany commands are skipped by default. To override a default and pass that command\'s keybinding to the shell instead, add the command prefixed with the `-` character. For example add `-workbench.action.quickOpen` to allow `Ctrl+P` to reach the shell.\n\n&nbsp;\n\nThe following list of default skipped commands is truncated when viewed in Settings Editor. To see the full list, {1} and search for the first command from the list below.\n\n&nbsp;\n\nDefault Skipped Commands:\n\n{0}'),
            items: {
                type: 'string'
            },
            default: []
        },
        'terminal.integrated.confirmOnExit': {
            type: 'string',
            description: nls.localizeByDefault('Controls whether to confirm when the window closes if there are active terminal sessions. Background terminals like those launched by some extensions will not trigger the confirmation.'),
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
