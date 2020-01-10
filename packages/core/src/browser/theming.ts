/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { Emitter, Event } from '../common/event';
import { Disposable } from '../common/disposable';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';

export const ThemeServiceSymbol = Symbol('ThemeService');

export type ThemeType = 'light' | 'dark' | 'hc';

export interface Theme {
    readonly id: string;
    readonly type: ThemeType;
    readonly label: string;
    readonly description?: string;
    readonly editorTheme?: string;
    activate(): void;
    deactivate(): void;
}

export interface ThemeChangeEvent {
    readonly newTheme: Theme;
    readonly oldTheme?: Theme;
}

export class ThemeService {

    private themes: { [id: string]: Theme } = {};
    private activeTheme: Theme | undefined;
    private readonly themeChange = new Emitter<ThemeChangeEvent>();

    readonly onThemeChange: Event<ThemeChangeEvent> = this.themeChange.event;

    static get(): ThemeService {
        const global = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        return global[ThemeServiceSymbol] || new ThemeService();
    }

    protected constructor(
        protected _defaultTheme: string | undefined = FrontendApplicationConfigProvider.get().defaultTheme,
        protected fallbackTheme: string = 'dark'
    ) {
        const global = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        global[ThemeServiceSymbol] = this;
    }

    register(...themes: Theme[]): Disposable {
        for (const theme of themes) {
            this.themes[theme.id] = theme;
        }
        this.validateActiveTheme();
        return Disposable.create(() => {
            for (const theme of themes) {
                delete this.themes[theme.id];
            }
            this.validateActiveTheme();
        });
    }

    protected validateActiveTheme(): void {
        if (!this.activeTheme) {
            return;
        }
        const theme = this.themes[this.activeTheme.id];
        if (!theme) {
            this.loadUserTheme();
        } else if (theme !== this.activeTheme) {
            this.activeTheme = undefined;
            this.setCurrentTheme(theme.id);
        }
    }

    getThemes(): Theme[] {
        const result = [];
        for (const o in this.themes) {
            if (this.themes.hasOwnProperty(o)) {
                result.push(this.themes[o]);
            }
        }
        return result;
    }

    getTheme(themeId: string): Theme {
        return this.themes[themeId] || this.defaultTheme;
    }

    startupTheme(): void {
        const theme = this.getCurrentTheme();
        theme.activate();
    }

    loadUserTheme(): void {
        const theme = this.getCurrentTheme();
        this.setCurrentTheme(theme.id);
    }

    setCurrentTheme(themeId: string): void {
        const newTheme = this.getTheme(themeId);
        const oldTheme = this.activeTheme;
        if (oldTheme) {
            if (oldTheme.id === newTheme.id) {
                return;
            }
            oldTheme.deactivate();
        }
        newTheme.activate();
        this.activeTheme = newTheme;
        window.localStorage.setItem('theme', themeId);
        this.themeChange.fire({
            newTheme, oldTheme
        });
    }

    getCurrentTheme(): Theme {
        const themeId = window.localStorage.getItem('theme') || this.defaultTheme.id;
        return this.getTheme(themeId);
    }

    /**
     * The default theme. If that is not applicable, returns with the fallback theme.
     */
    get defaultTheme(): Theme {
        return this.themes[this._defaultTheme || this.fallbackTheme] || this.themes[this.fallbackTheme];
    }

    /**
     * Resets the state to the user's default, or to the fallback theme. Also discards any persisted state in the local storage.
     */
    reset(): void {
        this.setCurrentTheme(this.defaultTheme.id);
    }

}

export class BuiltinThemeProvider {

    // Webpack converts these `require` in some Javascript object that wraps the `.css` files
    static readonly darkCss = require('../../src/browser/style/variables-dark.useable.css');
    static readonly lightCss = require('../../src/browser/style/variables-bright.useable.css');

    static readonly darkTheme: Theme = {
        id: 'dark',
        type: 'dark',
        label: 'Dark (Theia)',
        editorTheme: 'dark-theia', // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
        activate(): void {
            BuiltinThemeProvider.darkCss.use();
        },
        deactivate(): void {
            BuiltinThemeProvider.darkCss.unuse();
        }
    };

    static readonly lightTheme: Theme = {
        id: 'light',
        type: 'light',
        label: 'Light (Theia)',
        editorTheme: 'light-theia', // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
        activate(): void {
            BuiltinThemeProvider.lightCss.use();
        },
        deactivate(): void {
            BuiltinThemeProvider.lightCss.unuse();
        }
    };

    static readonly hcTheme: Theme = {
        id: 'hc-theia',
        type: 'hc',
        label: 'High Contrast (Theia)',
        editorTheme: 'hc-theia', // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
        activate(): void {
            BuiltinThemeProvider.darkCss.use();
        },
        deactivate(): void {
            BuiltinThemeProvider.darkCss.unuse();
        }
    };

    static readonly themes = [
        BuiltinThemeProvider.darkTheme,
        BuiltinThemeProvider.lightTheme,
        BuiltinThemeProvider.hcTheme
    ];
}
