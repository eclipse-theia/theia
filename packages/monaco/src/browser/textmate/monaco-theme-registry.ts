
// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { IRawTheme } from 'vscode-textmate';
import * as monaco from '@theia/monaco-editor-core';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { StandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneThemeService';
import { Color } from '@theia/monaco-editor-core/esm/vs/base/common/color';
import { MixStandaloneTheme, MonacoThemeColor, TextmateRegistryFactory, ThemeMix } from './monaco-theme-types';
import { ILogger } from '@theia/core';
import { ThemeType } from '@theia/core/lib/common/theme';

@injectable()
export class MonacoThemeRegistry {

    @inject(TextmateRegistryFactory) protected readonly registryFactory: TextmateRegistryFactory;

    @inject(ILogger) @named('monaco:MonacoThemeRegistry')
    protected readonly logger: ILogger;

    initializeDefaultThemes(): void {
        this.register(require('../../../data/monaco-themes/vscode/dark_theia.json'), {
            './dark_vs.json': require('../../../data/monaco-themes/vscode/dark_vs.json'),
            './dark_plus.json': require('../../../data/monaco-themes/vscode/dark_plus.json')
        }, 'dark-theia', 'vs-dark');
        this.register(require('../../../data/monaco-themes/vscode/light_theia.json'), {
            './light_vs.json': require('../../../data/monaco-themes/vscode/light_vs.json'),
            './light_plus.json': require('../../../data/monaco-themes/vscode/light_plus.json'),
        }, 'light-theia', 'vs');
        this.register(require('../../../data/monaco-themes/vscode/hc_theia.json'), {
            './hc_black.json': require('../../../data/monaco-themes/vscode/hc_black.json')
        }, 'hc-theia', 'hc-black');
        this.register(require('../../../data/monaco-themes/vscode/hc_theia_light.json'), {
            './hc_light.json': require('../../../data/monaco-themes/vscode/hc_light.json')
        }, 'hc-theia-light', 'hc-light');
    }

    getThemeData(): ThemeMix;
    getThemeData(name: string): ThemeMix | undefined;
    getThemeData(name?: string): ThemeMix | undefined {
        const theme = this.doGetTheme(name);
        return theme && theme.themeData;
    }

    getTheme(): MixStandaloneTheme;
    getTheme(name: string): MixStandaloneTheme | undefined;
    getTheme(name?: string): MixStandaloneTheme | undefined {
        return this.doGetTheme(name);
    }

    protected doGetTheme(name: string | undefined): MixStandaloneTheme | undefined {
        const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService) as StandaloneThemeService;
        const theme = !name ? standaloneThemeService.getColorTheme() : standaloneThemeService['_knownThemes'].get(name);
        return theme as MixStandaloneTheme | undefined;
    }

    setTheme(name: string, data: ThemeMix): void {
        // monaco lifts these two into token rules and throws on anything else, keeping the previous editor theme.
        // all other colors are read via monaco's `Color.fromHex`, which accepts shorthand hex as is.
        for (const key of ['editor.foreground', 'editor.background']) {
            if (key in data.colors) {
                const normalized = this.normalizeColor(data.colors[key]);
                if (normalized) {
                    data.colors[key] = normalized;
                } else {
                    delete data.colors[key];
                }
            }
        }
        // monaco auto refreshes a theme with new data
        monaco.editor.defineTheme(name, data);
    }

    /**
     * Register VS Code compatible themes
     */
    register(json: any, includes?: { [includePath: string]: any }, givenName?: string, monacoBase?: monaco.editor.BuiltinTheme): ThemeMix {
        const name = givenName || json.name!;
        const result: ThemeMix = {
            name,
            base: monacoBase || 'vs',
            inherit: true,
            colors: {},
            rules: [],
            settings: []
        };
        if (typeof json.include !== 'undefined') {
            if (!includes || !includes[json.include]) {
                this.logger.error(`Couldn't resolve includes theme ${json.include}.`);
            } else {
                const parentTheme = this.register(includes[json.include], includes);
                Object.assign(result.colors, parentTheme.colors);
                result.rules.push(...parentTheme.rules);
                result.settings.push(...parentTheme.settings);
            }
        }
        const tokenColors: IRawTheme['settings'] = json.tokenColors;
        if (Array.isArray(tokenColors)) {
            for (const tokenColor of tokenColors) {
                if (tokenColor.scope && tokenColor.settings) {
                    result.settings.push({
                        scope: tokenColor.scope,
                        settings: {
                            foreground: this.normalizeColor(tokenColor.settings.foreground),
                            background: this.normalizeColor(tokenColor.settings.background),
                            fontStyle: tokenColor.settings.fontStyle
                        }
                    });
                }
            }
        }
        if (json.colors) {
            Object.assign(result.colors, json.colors);
            result.encodedTokensColors = Object.keys(result.colors).map(key => result.colors[key]);
        }
        if (monacoBase && givenName) {
            for (const setting of result.settings) {
                this.transform(setting, rule => result.rules.push(rule));
            }

            // the default rule (scope empty) is always the first rule. Ignore all other default rules.
            const defaultTheme = (StandaloneServices.get(IStandaloneThemeService) as StandaloneThemeService)['_knownThemes'].get(result.base)!;
            const foreground = result.colors['editor.foreground'] || defaultTheme.getColor('editor.foreground');
            const background = result.colors['editor.background'] || defaultTheme.getColor('editor.background');
            result.settings.unshift({
                settings: {
                    foreground: this.normalizeColor(foreground),
                    background: this.normalizeColor(background)
                }
            });

            const reg = this.registryFactory(result);
            result.encodedTokensColors = reg.getColorMap();
            // index 0 has to be set to null as it is 'undefined' by default, but monaco code expects it to be null
            // eslint-disable-next-line no-null/no-null
            result.encodedTokensColors[0] = null!;
            this.setTheme(givenName, result);
        }
        return result;
    }

    protected transform(tokenColor: any, acceptor: (rule: monaco.editor.ITokenThemeRule) => void): void {
        if (typeof tokenColor.scope === 'undefined') {
            tokenColor.scope = [''];
        } else if (typeof tokenColor.scope === 'string') {
            tokenColor.scope = tokenColor.scope.split(',').map((scope: string) => scope.trim());
        }

        for (const scope of tokenColor.scope) {
            acceptor({
                ...tokenColor.settings, token: scope
            });
        }
    }

    protected normalizeColor(color: string | Color | undefined): string | undefined {
        if (!color) {
            return undefined;
        }
        const expanded = MonacoThemeColor.expandShorthandHex(String(color));
        if (!MonacoThemeColor.isTokenColor(expanded)) {
            // ignoring not normalized colors to avoid breaking token color indexes between monaco and vscode-textmate
            this.logger.error(`Color '${expanded}' is NOT normalized, it must be a 6 or 8 digit hex value.`);
            return undefined;
        }
        // monaco discards alpha for token colors, drop it here so that its color map stays aligned with vscode-textmate's
        return expanded.slice(0, 7);
    }
}

export namespace MonacoThemeRegistry {
    export const DARK_DEFAULT_THEME = 'dark-theia';
    export const LIGHT_DEFAULT_THEME = 'light-theia';
    export const HC_DEFAULT_THEME = 'hc-theia';
    export const HC_LIGHT_THEME = 'hc-theia-light';

    /**
     * The default editor theme for a color theme that does not provide one of its own.
     * It has to match the type, otherwise e.g. a light theme is rendered on a dark base.
     */
    export function getDefaultTheme(type: ThemeType): string {
        switch (type) {
            case 'light': return LIGHT_DEFAULT_THEME;
            case 'hc': return HC_DEFAULT_THEME;
            case 'hcLight': return HC_LIGHT_THEME;
            default: return DARK_DEFAULT_THEME;
        }
    }
}
