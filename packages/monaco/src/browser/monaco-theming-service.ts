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
import { ThemeService, BuiltinThemeProvider } from '@theia/core/lib/browser/theming';
import URI from '@theia/core/lib/common/uri';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { MonacoThemeRegistry } from './textmate/monaco-theme-registry';

export interface MonacoTheme {
    id?: string;
    label?: string;
    uiTheme?: 'vs' | 'vs-dark' | 'hc-black';
    description?: string;
    uri: string;
}

@injectable()
export class MonacoThemingService {

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    // tslint:disable-next-line:no-any
    register(theme: MonacoTheme, pendingIncludes: { [uri: string]: Promise<any> } = {}): Disposable {
        const toDispose = new DisposableCollection(Disposable.create(() => { /* mark as not disposed */ }));
        this.doRegister(theme, pendingIncludes, toDispose);
        return toDispose;
    }

    protected async doRegister(theme: MonacoTheme,
        pendingIncludes: { [uri: string]: Promise<any> },
        toDispose: DisposableCollection
    ): Promise<void> {
        try {
            if (new URI(theme.uri).path.ext !== '.json') {
                console.error('Unknown theme file: ' + theme.uri);
                return;
            }
            const includes = {};
            const json = await this.loadTheme(theme.uri, includes, pendingIncludes, toDispose);
            if (toDispose.disposed) {
                return;
            }
            const uiTheme = theme.uiTheme || 'vs-dark';
            const label = theme.label || new URI(theme.uri).path.base;
            const id = theme.id || label;
            const cssSelector = this.toCssSelector(id);
            const editorTheme = MonacoThemeRegistry.SINGLETON.register(json, includes, cssSelector, uiTheme).name!;
            const type = uiTheme === 'vs' ? 'light' : uiTheme === 'vs-dark' ? 'dark' : 'hc';
            const builtInTheme = uiTheme === 'vs' ? BuiltinThemeProvider.lightCss : BuiltinThemeProvider.darkCss;
            toDispose.push(ThemeService.get().register({
                type,
                id,
                label,
                description: theme.description,
                editorTheme,
                activate(): void {
                    builtInTheme.use();
                },
                deactivate(): void {
                    builtInTheme.unuse();
                }
            }));
        } catch (e) {
            console.error('Failed to load theme from ' + theme.uri, e);
        }
    }

    protected async loadTheme(
        uri: string,
        includes: { [include: string]: any },
        pendingIncludes: { [uri: string]: Promise<any> },
        toDispose: DisposableCollection
    ): Promise<any> {
        // tslint:enabled:no-any
        const { content } = await this.fileSystem.resolveContent(uri);
        if (toDispose.disposed) {
            return undefined;
        }
        const json = jsoncparser.parse(content, undefined, { disallowComments: false });
        if (json.include) {
            const includeUri = new URI(uri).parent.resolve(json.include).toString();
            if (!pendingIncludes[includeUri]) {
                pendingIncludes[includeUri] = this.loadTheme(includeUri, includes, pendingIncludes, toDispose);
            }
            includes[json.include] = await pendingIncludes[includeUri];
            if (toDispose.disposed) {
                return;
            }
        }
        return json;
    }

    /* remove all characters that are not allowed in css */
    protected toCssSelector(str: string): string {
        str = str.replace(/[^\-a-zA-Z0-9]/g, '-');
        if (str.charAt(0).match(/[0-9\-]/)) {
            str = '-' + str;
        }
        return str;
    }

}
