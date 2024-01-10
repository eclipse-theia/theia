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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, inject } from '@theia/core/shared/inversify';
import * as jsoncparser from 'jsonc-parser';
import * as plistparser from 'fast-plist';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MonacoThemeRegistry } from './textmate/monaco-theme-registry';
import { getThemes, putTheme, MonacoThemeState, stateToTheme, ThemeServiceWithDB } from './monaco-indexed-db';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import * as monaco from '@theia/monaco-editor-core';

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

@injectable()
export class MonacoThemingService {

    @inject(FileService) protected readonly fileService: FileService;
    @inject(MonacoThemeRegistry) protected readonly monacoThemeRegistry: MonacoThemeRegistry;
    @inject(ThemeServiceWithDB) protected readonly themeService: ThemeServiceWithDB;

    /** Register themes whose configuration needs to be loaded */
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
            toDispose.push(this.registerParsedTheme({ id, label, description, uiTheme: uiTheme, json, includes }));
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
        const result = await this.fileService.read(new URI(uri));
        const content = result.value;
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
        this.clean(json.colors);
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

    initialize(): void {
        this.monacoThemeRegistry.initializeDefaultThemes();
        this.updateBodyUiTheme();
        this.themeService.onDidColorThemeChange(() => this.updateBodyUiTheme());
        this.themeService.onDidRetrieveTheme(theme => this.monacoThemeRegistry.setTheme(MonacoThemingService.toCssSelector(theme.id), theme.data));
        this.restore();
    }

    /** register a theme whose configuration has already been loaded */
    registerParsedTheme(theme: MonacoThemeJson): Disposable {
        const uiTheme = theme.uiTheme || 'vs-dark';
        const { label, description, json, includes } = theme;
        const id = theme.id || label;
        const cssSelector = MonacoThemingService.toCssSelector(id);
        const data = this.monacoThemeRegistry.register(json, includes, cssSelector, uiTheme);
        return this.doRegisterParsedTheme({ id, label, description, uiTheme, data });
    }

    protected toUpdateUiTheme = new DisposableCollection();
    protected updateBodyUiTheme(): void {
        this.toUpdateUiTheme.dispose();
        const type = this.themeService.getCurrentTheme().type;
        const uiTheme: monaco.editor.BuiltinTheme = type === 'hc' ? 'hc-black' : type === 'light' ? 'vs' : 'vs-dark';
        document.body.classList.add(uiTheme);
        this.toUpdateUiTheme.push(Disposable.create(() => document.body.classList.remove(uiTheme)));
    }

    protected doRegisterParsedTheme(state: MonacoThemeState): Disposable {
        return new DisposableCollection(
            this.themeService.register(stateToTheme(state)),
            putTheme(state)
        );
    }

    protected async restore(): Promise<void> {
        try {
            const themes = await getThemes();
            for (const state of themes) {
                this.monacoThemeRegistry.setTheme(state.data.name!, state.data);
                this.doRegisterParsedTheme(state);
            }
        } catch (e) {
            console.error('Failed to restore monaco themes', e);
        }
    }

    /* remove all characters that are not allowed in css */
    protected static toCssSelector(str: string): string {
        str = str.replace(/[^\-a-zA-Z0-9]/g, '-');
        if (str.charAt(0).match(/[0-9\-]/)) {
            str = '-' + str;
        }
        return str;
    }

    /** removes all invalid theming values */
    private clean(obj: any): void {
        for (const key in obj) {
            if (typeof obj[key] !== 'string') {
                delete obj[key];
            }
        }
    }
}
