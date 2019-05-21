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

import { injectable, inject } from 'inversify';
import { CommandRegistry, CommandContribution, CommandHandler, Command } from '../common/command';
import { Emitter, Event } from '../common/event';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from './quick-open/quick-open-model';
import { QuickOpenService } from './quick-open/quick-open-service';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { MenuContribution, MenuModelRegistry } from '../common/';
import { CommonMenus } from './common-frontend-contribution';

export const ThemeServiceSymbol = Symbol('ThemeService');

export interface Theme {
    readonly id: string;
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
        const global = window as any; // tslint:disable-line
        return global[ThemeServiceSymbol] || new ThemeService();
    }

    protected constructor(
        protected _defaultTheme: string | undefined = FrontendApplicationConfigProvider.get().defaultTheme,
        protected fallbackTheme: string = 'dark'
    ) {
        const global = window as any; // tslint:disable-line
        global[ThemeServiceSymbol] = this;
    }

    register(...themes: Theme[]): void {
        for (const theme of themes) {
            this.themes[theme.id] = theme;
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

@injectable()
export class ThemingCommandContribution implements CommandContribution, MenuContribution, CommandHandler, Command, QuickOpenModel {

    id = 'change_theme';
    category = 'Settings';
    label = 'Change Color Theme';
    private resetTo: string | undefined;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(QuickOpenService)
    protected readonly openService: QuickOpenService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this, this);
    }

    registerMenus(menus: MenuModelRegistry) {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_THEME, {
            commandId: this.id,
            label: this.label,
            order: 'a30'
        });
    }

    execute() {
        this.resetTo = this.themeService.getCurrentTheme().id;
        this.openService.open(this, {
            placeholder: 'Select Color Theme (Up/Down Keys to Preview)',
            fuzzyMatchLabel: true,
            selectIndex: () => this.activeIndex(),
            onClose: () => {
                if (this.resetTo) {
                    this.themeService.setCurrentTheme(this.resetTo);
                }
            }
        });
    }

    private activeIndex() {
        const current = this.themeService.getCurrentTheme().id;
        const themes = this.themeService.getThemes();
        return themes.findIndex(theme => theme.id === current);
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        const items = this.themeService.getThemes().map(t =>
            new QuickOpenItem({
                label: t.label,
                description: t.description,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.resetTo = undefined;
                    }
                    this.themeService.setCurrentTheme(t.id);
                    return true;
                }
            }));
        acceptor(items);
    }
}

export class BuiltinThemeProvider {

    // Webpack converts these `require` in some Javascript object that wraps the `.css` files
    static readonly darkCss = require('../../src/browser/style/variables-dark.useable.css');
    static readonly lightCss = require('../../src/browser/style/variables-bright.useable.css');

    static readonly darkTheme = {
        id: 'dark',
        label: 'Dark Theme',
        description: 'Bright fonts on dark backgrounds.',
        editorTheme: 'dark-plus', // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
        activate() {
            BuiltinThemeProvider.darkCss.use();
        },
        deactivate() {
            BuiltinThemeProvider.darkCss.unuse();
        }
    };

    static readonly lightTheme = {
        id: 'light',
        label: 'Light Theme',
        description: 'Dark fonts on light backgrounds.',
        editorTheme: 'light-plus', // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
        activate() {
            BuiltinThemeProvider.lightCss.use();
        },
        deactivate() {
            BuiltinThemeProvider.lightCss.unuse();
        }
    };

    static readonly themes = [
        BuiltinThemeProvider.darkTheme,
        BuiltinThemeProvider.lightTheme,
    ];
}
