// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import * as idb from 'idb';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ThemeService } from '@theia/core/lib/browser/theming';
import * as monaco from '@theia/monaco-editor-core';
import { injectable } from '@theia/core/shared/inversify';
import type { ThemeMix } from './textmate/monaco-theme-types';
import { Theme } from '@theia/core/lib/common/theme';
import { Emitter, Event, isObject } from '@theia/core';

let _monacoDB: Promise<idb.IDBPDatabase> | undefined;
if ('indexedDB' in window) {
    _monacoDB = idb.openDB('theia-monaco', 1, {
        upgrade: db => {
            if (!db.objectStoreNames.contains('themes')) {
                db.createObjectStore('themes', { keyPath: 'id' });
            }
        }
    });
}

export const monacoDB = _monacoDB;

export interface MonacoThemeState {
    id: string,
    label: string,
    description?: string,
    uiTheme: monaco.editor.BuiltinTheme
    data: ThemeMix
}
export namespace MonacoThemeState {
    export function is(state: unknown): state is MonacoThemeState {
        return isObject(state) && 'id' in state && 'label' in state && 'uiTheme' in state && 'data' in state;
    }
}

export async function getThemes(): Promise<MonacoThemeState[]> {
    if (!monacoDB) {
        return [];
    }
    const db = await monacoDB;
    const result = await db.transaction('themes', 'readonly').objectStore('themes').getAll();
    return result.filter(MonacoThemeState.is);
}

export function putTheme(state: MonacoThemeState): Disposable {
    const toDispose = new DisposableCollection(Disposable.create(() => { /* mark as not disposed */ }));
    doPutTheme(state, toDispose);
    return toDispose;
}
async function doPutTheme(state: MonacoThemeState, toDispose: DisposableCollection): Promise<void> {
    if (!monacoDB) {
        return;
    }
    const db = await monacoDB;
    if (toDispose.disposed) {
        return;
    }
    const id = state.id;
    await db.transaction('themes', 'readwrite').objectStore('themes').put(state);
    if (toDispose.disposed) {
        await deleteTheme(id);
        return;
    }
    toDispose.push(Disposable.create(() => deleteTheme(id)));
}

export async function deleteTheme(id: string): Promise<void> {
    if (!monacoDB) {
        return;
    }
    const db = await monacoDB;
    await db.transaction('themes', 'readwrite').objectStore('themes').delete(id);
}

export function stateToTheme(state: MonacoThemeState): Theme {
    const { id, label, description, uiTheme, data } = state;
    const type = uiTheme === 'vs' ? 'light' : uiTheme === 'vs-dark' ? 'dark' : 'hc';
    return {
        type,
        id,
        label,
        description,
        editorTheme: data.name!
    };
}

@injectable()
export class ThemeServiceWithDB extends ThemeService {
    protected onDidRetrieveThemeEmitter = new Emitter<MonacoThemeState>();
    get onDidRetrieveTheme(): Event<MonacoThemeState> {
        return this.onDidRetrieveThemeEmitter.event;
    }

    override loadUserTheme(): void {
        this.loadUserThemeWithDB();
    }

    protected async loadUserThemeWithDB(): Promise<void> {
        const themeId = window.localStorage.getItem(ThemeService.STORAGE_KEY) ?? this.defaultTheme.id;
        const theme = this.themes[themeId] ?? await getThemes().then(themes => {
            const matchingTheme = themes.find(candidate => candidate.id === themeId);
            if (matchingTheme) {
                this.onDidRetrieveThemeEmitter.fire(matchingTheme);
                return stateToTheme(matchingTheme);
            }
        }) ?? this.getTheme(themeId);
        // In case the theme comes from the DB.
        if (!this.themes[theme.id]) {
            this.themes[theme.id] = theme;
        }
        this.setCurrentTheme(theme.id, false);
        this.deferredInitializer.resolve();
    }
}
