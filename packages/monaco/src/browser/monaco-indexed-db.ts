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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as idb from 'idb';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { BuiltinThemeProvider, ThemeService, ThemeServiceSymbol } from '@theia/core/lib/browser/theming';
import { Theme } from '@theia/core/lib/common/theme';
import * as monaco from '@theia/monaco-editor-core';

type ThemeMix = import('./textmate/monaco-theme-registry').ThemeMix;

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
    export function is(state: Object | undefined): state is MonacoThemeState {
        return !!state && typeof state === 'object' && 'id' in state && 'label' in state && 'uiTheme' in state && 'data' in state;
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
    const builtInTheme = uiTheme === 'vs' ? BuiltinThemeProvider.lightCss : BuiltinThemeProvider.darkCss;
    return {
        type,
        id,
        label,
        description,
        editorTheme: data.name!,
        activate(): void {
            builtInTheme.use();
        },
        deactivate(): void {
            builtInTheme.unuse();
        }
    };
}

async function getThemeFromDB(id: string): Promise<Theme | undefined> {
    const matchingState = (await getThemes()).find(theme => theme.id === id);
    return matchingState && stateToTheme(matchingState);
}

export class ThemeServiceWithDB extends ThemeService {
    static override get(): ThemeService {
        const global = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!global[ThemeServiceSymbol]) {
            const themeService = new ThemeServiceWithDB();
            themeService.register(...BuiltinThemeProvider.themes);
            themeService.startupTheme();
            global[ThemeServiceSymbol] = themeService;
        }
        return global[ThemeServiceSymbol];
    }

    override loadUserTheme(): void {
        this.loadUserThemeWithDB();
    }

    protected async loadUserThemeWithDB(): Promise<void> {
        const themeId = window.localStorage.getItem('theme') || this.defaultTheme.id;
        const theme = this.themes[themeId] ?? await getThemeFromDB(themeId) ?? this.defaultTheme;
        this.setCurrentTheme(theme.id);
    }
}

ThemeService.get = ThemeServiceWithDB.get;
