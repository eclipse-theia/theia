// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { Path } from '@theia/core/lib/common/path';
import { injectable } from '@theia/core/shared/inversify';

/**
 * Loads the browser entry point of a VS Code extension in the plugin web worker the way VS Code's web extension host does:
 * the script is fetched and evaluated as a CommonJS module whose `require('vscode')` returns the API of that extension.
 */
@injectable()
export class VsCodeExtensionLoader {

    /**
     * @param url the URL of the extension's browser entry point, relative to the worker.
     * @param api the `vscode` API instance of the extension.
     * @returns the `module.exports` of the extension.
     */
    async load(url: string, api: unknown): Promise<unknown> {
        const scriptUrl = this.ensureFileExtension(url);
        const response = await fetch(scriptUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch '${scriptUrl}': ${response.status} ${response.statusText}`);
        }
        const source = await response.text();
        // Like VS Code, wrap the source in a function that receives the CommonJS globals.
        const initFn = new Function('module', 'exports', 'require', `${source}\n//# sourceURL=${response.url || scriptUrl}`);
        const exports = {};
        const module = { exports };
        const require = (request: string): unknown => {
            if (request === 'vscode') {
                return api;
            }
            throw new Error(`Cannot load module '${request}'`);
        };
        initFn(module, exports, require);
        return module.exports;
    }

    /**
     * Like VS Code, appends `.js` to an entry point without a file extension, e.g. `"browser": "./dist/web/extension"`.
     * Without it, such an entry point cannot be found where plugin files are served as static files, as in browser-only applications.
     */
    protected ensureFileExtension(url: string): string {
        return new Path(url).ext ? url : `${url}.js`;
    }

}
