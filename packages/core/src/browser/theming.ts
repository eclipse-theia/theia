// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '../common/event';
import { Disposable } from '../common/disposable';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { ApplicationProps } from '@theia/application-package/lib/application-props';
import { Theme, ThemeChangeEvent } from '../common/theme';
import { inject, injectable, postConstruct } from 'inversify';
import { Deferred } from '../common/promise-util';
import { PreferenceService } from './preferences';

const COLOR_THEME_PREFERENCE_KEY = 'workbench.colorTheme';
const NO_THEME = { id: 'no-theme', label: 'Not a real theme.', type: 'dark' } as const;

@injectable()
export class ThemeService {
    static readonly STORAGE_KEY = 'theme';

    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected themes: { [id: string]: Theme } = {};
    protected activeTheme: Theme = NO_THEME;
    protected readonly themeChange = new Emitter<ThemeChangeEvent>();
    protected readonly deferredInitializer = new Deferred();
    get initialized(): Promise<void> {
        return this.deferredInitializer.promise;
    }

    readonly onDidColorThemeChange: Event<ThemeChangeEvent> = this.themeChange.event;

    @postConstruct()
    protected init(): void {
        this.register(...BuiltinThemeProvider.themes);
        this.loadUserTheme();
        this.preferences.ready.then(() => {
            this.validateActiveTheme();
            this.preferences.onPreferencesChanged(changes => {
                if (COLOR_THEME_PREFERENCE_KEY in changes) {
                    this.validateActiveTheme();
                }
            });
        });
    }

    register(...themes: Theme[]): Disposable {
        for (const theme of themes) {
            this.themes[theme.id] = theme;
        }
        this.validateActiveTheme();
        return Disposable.create(() => {
            for (const theme of themes) {
                delete this.themes[theme.id];
                if (this.activeTheme === theme) {
                    this.setCurrentTheme(this.defaultTheme.id, false);
                }
            }
        });
    }

    protected validateActiveTheme(): void {
        if (this.preferences.isReady) {
            const configuredTheme = this.getConfiguredTheme();
            if (configuredTheme && configuredTheme !== this.activeTheme) {
                this.setCurrentTheme(configuredTheme.id, false);
            }
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

    protected tryGetTheme(themeId: string): Theme | undefined {
        return this.themes[themeId];
    }

    /** Should only be called at startup. */
    loadUserTheme(): void {
        const storedThemeId = window.localStorage.getItem(ThemeService.STORAGE_KEY) ?? this.defaultTheme.id;
        const theme = this.getTheme(storedThemeId);
        this.setCurrentTheme(theme.id, false);
        this.deferredInitializer.resolve();
    }

    /**
     * @param persist If `true`, the value of the `workbench.colorTheme` preference will be set to the provided ID.
     */
    setCurrentTheme(themeId: string, persist = true): void {
        const newTheme = this.tryGetTheme(themeId);
        const oldTheme = this.activeTheme;
        if (newTheme && newTheme !== oldTheme) {
            oldTheme?.deactivate?.();
            newTheme.activate?.();
            this.activeTheme = newTheme;
            this.themeChange.fire({ newTheme, oldTheme });
        }
        if (persist) {
            this.preferences.updateValue(COLOR_THEME_PREFERENCE_KEY, themeId);
        }
    }

    getCurrentTheme(): Theme {
        return this.activeTheme;
    }

    protected getConfiguredTheme(): Theme | undefined {
        const configuredId = this.preferences.get<string>(COLOR_THEME_PREFERENCE_KEY);
        return configuredId ? this.themes[configuredId.toString()] : undefined;
    }

    /**
     * The default theme. If that is not applicable, returns with the fallback theme.
     */
    get defaultTheme(): Theme {
        return this.tryGetTheme(FrontendApplicationConfigProvider.get().defaultTheme) ?? this.getTheme(ApplicationProps.DEFAULT.frontend.config.defaultTheme);
    }

    /**
     * Resets the state to the user's default, or to the fallback theme. Also discards any persisted state in the local storage.
     */
    reset(): void {
        this.setCurrentTheme(this.defaultTheme.id);
    }
}

export class BuiltinThemeProvider {

    static readonly darkTheme: Theme = {
        id: 'dark',
        type: 'dark',
        label: 'Dark (Theia)',
        editorTheme: 'dark-theia' // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
    };

    static readonly lightTheme: Theme = {
        id: 'light',
        type: 'light',
        label: 'Light (Theia)',
        editorTheme: 'light-theia' // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
    };

    static readonly hcTheme: Theme = {
        id: 'hc-theia',
        type: 'hc',
        label: 'High Contrast (Theia)',
        editorTheme: 'hc-theia' // loaded in /packages/monaco/src/browser/textmate/monaco-theme-registry.ts
    };

    static readonly themes = [
        BuiltinThemeProvider.darkTheme,
        BuiltinThemeProvider.lightTheme,
        BuiltinThemeProvider.hcTheme
    ];
}
