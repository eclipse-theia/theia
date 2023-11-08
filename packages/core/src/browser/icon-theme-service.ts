// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Emitter } from '../common/event';
import { Disposable, DisposableCollection } from '../common/disposable';
import { LabelProviderContribution, DidChangeLabelEvent } from './label-provider';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
import { PreferenceService, PreferenceSchemaProvider } from './preferences';
import debounce = require('lodash.debounce');

const ICON_THEME_PREFERENCE_KEY = 'workbench.iconTheme';

export interface IconThemeDefinition {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly hasFileIcons?: boolean;
    readonly hasFolderIcons?: boolean;
    readonly hidesExplorerArrows?: boolean;
    readonly showLanguageModeIcons?: boolean;
}

export interface IconTheme extends IconThemeDefinition {
    activate(): Disposable;
}

@injectable()
export class NoneIconTheme implements IconTheme, LabelProviderContribution {

    readonly id = 'none';
    readonly label = 'None';
    readonly description = 'Disable file icons';
    readonly hasFileIcons = true;
    readonly hasFolderIcons = true;

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly toDeactivate = new DisposableCollection();

    activate(): Disposable {
        if (this.toDeactivate.disposed) {
            this.toDeactivate.push(Disposable.create(() => this.fireDidChange()));
            this.fireDidChange();
        }
        return this.toDeactivate;
    }

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire({ affects: () => true });
    }

    canHandle(): number {
        if (this.toDeactivate.disposed) {
            return 0;
        }
        return Number.MAX_SAFE_INTEGER - 1024;
    }

    getIcon(): string {
        return '';
    }

}

@injectable()
export class IconThemeService {
    static readonly STORAGE_KEY = 'iconTheme';

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly _iconThemes = new Map<string, IconTheme>();
    get ids(): IterableIterator<string> {
        return this._iconThemes.keys();
    }
    get definitions(): IterableIterator<IconThemeDefinition> {
        return this._iconThemes.values();
    }
    getDefinition(id: string): IconThemeDefinition | undefined {
        return this._iconThemes.get(id);
    }

    @inject(NoneIconTheme) protected readonly noneIconTheme: NoneIconTheme;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;

    protected readonly onDidChangeCurrentEmitter = new Emitter<string>();
    readonly onDidChangeCurrent = this.onDidChangeCurrentEmitter.event;

    protected readonly toDeactivate = new DisposableCollection();

    protected activeTheme: IconTheme;

    @postConstruct()
    protected init(): void {
        this.register(this.fallback);
        this.setCurrent(this.fallback, false);
        this.preferences.ready.then(() => {
            this.validateActiveTheme();
            this.updateIconThemePreference();
            this.preferences.onPreferencesChanged(changes => {
                if (ICON_THEME_PREFERENCE_KEY in changes) {
                    this.validateActiveTheme();
                }
            });
        });
    }

    register(iconTheme: IconTheme): Disposable {
        if (this._iconThemes.has(iconTheme.id)) {
            console.warn(new Error(`Icon theme '${iconTheme.id}' has already been registered, skipping.`));
            return Disposable.NULL;
        }
        this._iconThemes.set(iconTheme.id, iconTheme);
        this.onDidChangeEmitter.fire(undefined);
        this.validateActiveTheme();
        this.updateIconThemePreference();
        return Disposable.create(() => {
            this.unregister(iconTheme.id);
            this.updateIconThemePreference();
        });
    }

    unregister(id: string): IconTheme | undefined {
        const iconTheme = this._iconThemes.get(id);
        if (!iconTheme) {
            return undefined;
        }
        this._iconThemes.delete(id);
        this.onDidChangeEmitter.fire(undefined);
        if (id === this.getCurrent().id) {
            this.setCurrent(this.default, false);
        }
        return iconTheme;
    }

    get current(): string {
        return this.getCurrent().id;
    }

    set current(id: string) {
        const newCurrent = this._iconThemes.get(id);
        if (newCurrent && this.getCurrent().id !== newCurrent.id) {
            this.setCurrent(newCurrent);
        }
    }

    getCurrent(): IconTheme {
        return this.activeTheme;
    }

    /**
     * @param persistSetting If `true`, the theme's id will be set as the value of the `workbench.iconTheme` preference. (default: `true`)
     */
    setCurrent(newCurrent: IconTheme, persistSetting = true): void {
        if (newCurrent !== this.getCurrent()) {
            this.activeTheme = newCurrent;
            this.toDeactivate.dispose();
            this.toDeactivate.push(newCurrent.activate());
            this.onDidChangeCurrentEmitter.fire(newCurrent.id);
        }
        if (persistSetting) {
            this.preferences.updateValue(ICON_THEME_PREFERENCE_KEY, newCurrent.id);
        }
    }

    protected getConfiguredTheme(): IconTheme | undefined {
        const configuredId = this.preferences.get<string>(ICON_THEME_PREFERENCE_KEY);
        return configuredId ? this._iconThemes.get(configuredId) : undefined;
    }

    protected validateActiveTheme(): void {
        if (this.preferences.isReady) {
            const configured = this.getConfiguredTheme();
            if (configured && configured !== this.getCurrent()) {
                this.setCurrent(configured, false);
            }
        }
    }

    protected updateIconThemePreference = debounce(() => this.doUpdateIconThemePreference(), 500);

    protected doUpdateIconThemePreference(): void {
        const preference = this.schemaProvider.getSchemaProperty(ICON_THEME_PREFERENCE_KEY);
        if (preference) {
            const sortedThemes = Array.from(this.definitions).sort((a, b) => a.label.localeCompare(b.label));
            this.schemaProvider.updateSchemaProperty(ICON_THEME_PREFERENCE_KEY, {
                ...preference,
                enum: sortedThemes.map(e => e.id),
                enumItemLabels: sortedThemes.map(e => e.label)
            });
        }
    }

    get default(): IconTheme {
        return this._iconThemes.get(FrontendApplicationConfigProvider.get().defaultIconTheme) || this.fallback;
    }

    get fallback(): IconTheme {
        return this.noneIconTheme;
    }
}
