
/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable } from '@theia/core/shared/inversify';
import { IRawTheme, Registry, IRawThemeSetting } from 'vscode-textmate';

export interface ThemeMix extends IRawTheme, monaco.editor.IStandaloneThemeData { }
export interface MixStandaloneTheme extends monaco.services.IStandaloneTheme {
    themeData: ThemeMix
}

@injectable()
export class MonacoThemeRegistry {

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
        const standaloneThemeService = monaco.services.StaticServices.standaloneThemeService.get();
        const theme = !name ? standaloneThemeService.getTheme() : standaloneThemeService._knownThemes.get(name);
        return theme as MixStandaloneTheme | undefined;
    }

    setTheme(name: string, data: ThemeMix): void {
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
                console.error(`Couldn't resolve includes theme ${json.include}.`);
            } else {
                const parentTheme = this.register(includes[json.include], includes);
                Object.assign(result.colors, parentTheme.colors);
                result.rules.push(...parentTheme.rules);
                result.settings.push(...parentTheme.settings);
            }
        }
        const tokenColors: Array<IRawThemeSetting> = json.tokenColors;
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
            const defaultTheme = monaco.services.StaticServices.standaloneThemeService.get()._knownThemes.get(result.base)!;
            const foreground = result.colors['editor.foreground'] || defaultTheme.getColor('editor.foreground');
            const background = result.colors['editor.background'] || defaultTheme.getColor('editor.background');
            result.settings.unshift({
                settings: {
                    foreground: this.normalizeColor(foreground),
                    background: this.normalizeColor(background)
                }
            });

            const reg = new Registry();
            reg.setTheme(result);
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

    protected normalizeColor(color: string | monaco.color.Color | undefined): string | undefined {
        if (!color) {
            return undefined;
        }

        const hex = String(color).toUpperCase();
        const length = hex.length;

        // #RRGGBB notation.
        if (length === 7 && hex.match(/#[A-Fa-f0-9]{6}/)) {
            return hex;
        }

        // #RRGGBBAA notation.
        if (length === 9 && hex.match(/#[A-Fa-f0-9]{8}/)) {
            const r = hex.charAt(1);
            const g = hex.charAt(3);
            const b = hex.charAt(5);
            return '#' + r + r + g + g + b + b;
        }

        // #RGB notation.
        if (length === 4 && hex.match(/#[A-Fa-f0-9]{3}/)) {
            const r = hex.charAt(1);
            const g = hex.charAt(2);
            const b = hex.charAt(3);
            return '#' + r + r + g + g + b + b;
        }

        // #RGBA notation.
        if (length === 5 && hex.match(/#[A-Fa-f0-9]{4}/)) {
            const r = hex.charAt(1);
            const g = hex.charAt(2);
            const b = hex.charAt(3);
            const a = hex.charAt(4);
            return '#' + r + r + g + g + b + b + a + a;
        }

        console.error(`Color '${hex}' cannot be normalized.`);
        return undefined;

    }
}

export namespace MonacoThemeRegistry {
    export const SINGLETON = new MonacoThemeRegistry();

    export const DARK_DEFAULT_THEME: string = SINGLETON.register(require('../../../data/monaco-themes/vscode/dark_theia.json'), {
        './dark_defaults.json': require('../../../data/monaco-themes/vscode/dark_defaults.json'),
        './dark_vs.json': require('../../../data/monaco-themes/vscode/dark_vs.json'),
        './dark_plus.json': require('../../../data/monaco-themes/vscode/dark_plus.json')
    }, 'dark-theia', 'vs-dark').name!;
    export const LIGHT_DEFAULT_THEME: string = SINGLETON.register(require('../../../data/monaco-themes/vscode/light_theia.json'), {
        './light_defaults.json': require('../../../data/monaco-themes/vscode/light_defaults.json'),
        './light_vs.json': require('../../../data/monaco-themes/vscode/light_vs.json'),
        './light_plus.json': require('../../../data/monaco-themes/vscode/light_plus.json'),
    }, 'light-theia', 'vs').name!;
    export const HC_DEFAULT_THEME: string = SINGLETON.register(require('../../../data/monaco-themes/vscode/hc_theia.json'), {
        './hc_black_defaults.json': require('../../../data/monaco-themes/vscode/hc_black_defaults.json'),
        './hc_black.json': require('../../../data/monaco-themes/vscode/hc_black.json')
    }, 'hc-theia', 'hc-black').name!;
}
