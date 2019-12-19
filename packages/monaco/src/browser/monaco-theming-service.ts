/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

// tslint:disable:no-any

import * as idb from 'idb';
import { injectable, inject } from 'inversify';
import * as jsoncparser from 'jsonc-parser';
import * as plistparser from 'fast-plist';
import { ThemeService, BuiltinThemeProvider } from '@theia/core/lib/browser/theming';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { MonacoThemeRegistry, ThemeMix } from './textmate/monaco-theme-registry';

export interface MonacoTheme {
    id?: string;
    label?: string;
    uiTheme?: monaco.editor.BuiltinTheme;
    description?: string;
    uri: string;
}

export interface MonacoThemeJson {
    /**
     * theme id (optional), label is used if not provided
     */
    id?: string;
    label: string;
    /**
     * theme type, `vs-dark` if not provided
     */
    uiTheme?: monaco.editor.BuiltinTheme;
    description?: string;
    /**
     * Follow https://code.visualstudio.com/api/extension-guides/color-theme#create-a-new-color-theme to create a custom theme.
     */
    json: any
    /**
     * Themes can include each other. It specifies how inclusions should be resolved.
     */
    includes?: { [includePath: string]: any }
}

let monacoDB: Promise<idb.IDBPDatabase> | undefined;
if ('indexedDB' in window) {
    monacoDB = idb.openDB('theia-monaco', 1, {
        upgrade: db => {
            if (!db.objectStoreNames.contains('themes')) {
                db.createObjectStore('themes', { keyPath: 'id' });
            }
        }
    });
}

@injectable()
export class MonacoThemingService {

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    // tslint:disable-next-line:no-any
    register(theme: MonacoTheme, pending: { [uri: string]: Promise<any> } = {}): Disposable {
        const toDispose = new DisposableCollection(Disposable.create(() => { /* mark as not disposed */ }));
        this.doRegister(theme, pending, toDispose);
        return toDispose;
    }

    protected async doRegister(theme: MonacoTheme,
        pending: { [uri: string]: Promise<any> },
        toDispose: DisposableCollection
    ): Promise<void> {
        try {
            const includes = {};
            const json = await this.loadTheme(theme.uri, includes, pending, toDispose);
            if (toDispose.disposed) {
                return;
            }
            const label = theme.label || new URI(theme.uri).path.base;
            const { id, description, uiTheme } = theme;
            toDispose.push(MonacoThemingService.register({ id, label, description, uiTheme: uiTheme, json, includes }));
        } catch (e) {
            console.error('Failed to load theme from ' + theme.uri, e);
        }
    }

    protected async loadTheme(
        uri: string,
        includes: { [include: string]: any },
        pending: { [uri: string]: Promise<any> },
        toDispose: DisposableCollection
    ): Promise<any> {
        // tslint:enabled:no-any
        const { content } = await this.fileSystem.resolveContent(uri);
        if (toDispose.disposed) {
            return;
        }
        const themeUri = new URI(uri);
        if (themeUri.path.ext !== '.json') {
            const value = plistparser.parse(content);
            if (value && 'settings' in value && Array.isArray(value.settings)) {
                return { tokenColors: value.settings };
            }
            throw new Error(`Problem parsing tmTheme file: ${uri}. 'settings' is not array.`);
        }
        const json = jsoncparser.parse(content, undefined, { disallowComments: false });
        if ('tokenColors' in json && typeof json.tokenColors === 'string') {
            const value = await this.doLoadTheme(themeUri, json.tokenColors, includes, pending, toDispose);
            if (toDispose.disposed) {
                return;
            }
            json.tokenColors = value.tokenColors;
        }
        if (json.include) {
            includes[json.include] = await this.doLoadTheme(themeUri, json.include, includes, pending, toDispose);
            if (toDispose.disposed) {
                return;
            }
        }
        return json;
    }

    protected doLoadTheme(
        themeUri: URI,
        referencedPath: string,
        includes: { [include: string]: any },
        pending: { [uri: string]: Promise<any> },
        toDispose: DisposableCollection
    ): Promise<any> {
        const referencedUri = themeUri.parent.resolve(referencedPath).toString();
        if (!pending[referencedUri]) {
            pending[referencedUri] = this.loadTheme(referencedUri, includes, pending, toDispose);
        }
        return pending[referencedUri];
    }

    static init(): void {
        this.updateBodyUiTheme();
        ThemeService.get().onThemeChange(() => this.updateBodyUiTheme());
        this.restore();
    }

    static register(theme: MonacoThemeJson): Disposable {
        const uiTheme = theme.uiTheme || 'vs-dark';
        const { label, description, json, includes } = theme;
        const id = theme.id || label;
        const cssSelector = MonacoThemingService.toCssSelector(id);
        const data = MonacoThemeRegistry.SINGLETON.register(json, includes, cssSelector, uiTheme);
        return MonacoThemingService.doRegister({ id, label, description, uiTheme, data });
    }

    protected static toUpdateUiTheme = new DisposableCollection();
    protected static updateBodyUiTheme(): void {
        this.toUpdateUiTheme.dispose();
        const type = ThemeService.get().getCurrentTheme().type;
        const uiTheme: monaco.editor.BuiltinTheme = type === 'hc' ? 'hc-black' : type === 'light' ? 'vs' : 'vs-dark';
        document.body.classList.add(uiTheme);
        this.toUpdateUiTheme.push(Disposable.create(() => document.body.classList.remove(uiTheme)));
    }

    protected static doRegister(state: MonacoThemingService.MonacoThemeState): Disposable {
        const { id, label, description, uiTheme, data } = state;
        const type = uiTheme === 'vs' ? 'light' : uiTheme === 'vs-dark' ? 'dark' : 'hc';
        const builtInTheme = uiTheme === 'vs' ? BuiltinThemeProvider.lightCss : BuiltinThemeProvider.darkCss;
        const toDispose = new DisposableCollection(ThemeService.get().register({
            type,
            id,
            label,
            description: description,
            editorTheme: data.name!,
            activate(): void {
                builtInTheme.use();
            },
            deactivate(): void {
                builtInTheme.unuse();
            }
        }));
        this.storeTheme(state, toDispose);
        return toDispose;
    }

    protected static async restore(): Promise<void> {
        if (!monacoDB) {
            return;
        }
        try {
            const db = await monacoDB;
            const themes = await db.transaction('themes', 'readonly').objectStore('themes').getAll();
            for (const state of themes) {
                if (MonacoThemingService.MonacoThemeState.is(state)) {
                    MonacoThemeRegistry.SINGLETON.setTheme(state.data.name!, state.data);
                    MonacoThemingService.doRegister(state);
                }
            }
        } catch (e) {
            console.error('Failed to restore monaco themes', e);
        }
    }

    protected static async storeTheme(state: MonacoThemingService.MonacoThemeState, toDispose: DisposableCollection): Promise<void> {
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
            await this.cleanTheme(id);
            return;
        }
        toDispose.push(Disposable.create(() => this.cleanTheme(id)));
    }

    protected static async cleanTheme(id: string): Promise<void> {
        if (!monacoDB) {
            return;
        }
        const db = await monacoDB;
        await db.transaction('themes', 'readwrite').objectStore('themes').delete(id);
    }

    /* remove all characters that are not allowed in css */
    protected static toCssSelector(str: string): string {
        str = str.replace(/[^\-a-zA-Z0-9]/g, '-');
        if (str.charAt(0).match(/[0-9\-]/)) {
            str = '-' + str;
        }
        return str;
    }

}
export namespace MonacoThemingService {
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
}
