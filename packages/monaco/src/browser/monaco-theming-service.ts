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
    uiTheme?: 'vs' | 'vs-dark' | 'hc-black';
    description?: string;
    uri: string;
}

@injectable()
export class MonacoThemingService {

    static monacoThemes = new Map<string, MonacoThemingService.MonacoThemeState>();

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
            const uiTheme = theme.uiTheme || 'vs-dark';
            const label = theme.label || new URI(theme.uri).path.base;
            const id = theme.id || label;
            const cssSelector = MonacoThemingService.toCssSelector(id);
            const data = MonacoThemeRegistry.SINGLETON.register(json, includes, cssSelector, uiTheme);
            toDispose.push(MonacoThemingService.doRegister({ id, label, description: theme.description, uiTheme, data }));
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
        ThemeService.get().onThemeChange(e =>
            MonacoThemingService.store(MonacoThemingService.monacoThemes.get(e.newTheme.id))
        );
        try {
            const value = window.localStorage.getItem('monacoTheme');
            if (value) {
                const state: MonacoThemingService.MonacoThemeState = JSON.parse(value);
                MonacoThemeRegistry.SINGLETON.setTheme(state.data.name!, state.data);
                MonacoThemingService.doRegister(state);
            }
        } catch (e) {
            console.error('Failed to restore monaco theme', e);
        }
    }

    static store(state: MonacoThemingService.MonacoThemeState | undefined): void {
        if (state) {
            window.localStorage.setItem('monacoTheme', JSON.stringify(state));
        } else {
            window.localStorage.removeItem('monacoTheme');
        }
    }

    static doRegister(state: MonacoThemingService.MonacoThemeState): Disposable {
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
        MonacoThemingService.monacoThemes.set(id, state);
        toDispose.push(Disposable.create(() => MonacoThemingService.monacoThemes.delete(id)));
        return toDispose;
    }

    /* remove all characters that are not allowed in css */
    static toCssSelector(str: string): string {
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
        uiTheme: MonacoTheme['uiTheme']
        data: ThemeMix
    }
}
