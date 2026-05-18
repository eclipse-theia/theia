// *****************************************************************************
// Copyright (C) 2018-2019 Red Hat, Inc.
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

import { register } from 'node:module';
import * as theia from '@theia/plugin';
import { BackendInitializationFn, PluginAPIFactory, Plugin, emptyPlugin } from '@theia/plugin-ext';
import { VSCODE_DEFAULT_API_VERSION } from '../common/plugin-vscode-types';

process.env['VSCODE_PID'] = process.env['THEIA_PARENT_PID'];

const pluginsApiImpl = new Map<string, typeof theia>();
const plugins = new Array<Plugin>();
let defaultApi: typeof theia;
let isLoadOverride = false;
let pluginApiFactory: PluginAPIFactory;

export const doInitialization: BackendInitializationFn = (apiFactory: PluginAPIFactory, plugin: Plugin) => {
    pluginsApiImpl.set(plugin.model.id, createVSCodeAPI(apiFactory, plugin));
    plugins.push(plugin);
    pluginApiFactory = apiFactory;

    if (!isLoadOverride) {
        overrideInternalLoad();
        isLoadOverride = true;
    }
};

function createVSCodeAPI(apiFactory: PluginAPIFactory, plugin: Plugin): typeof theia {
    const vscode = apiFactory(plugin);

    // override the version for vscode to be a VSCode version
    (<any>vscode).version = process.env['VSCODE_API_VERSION'] || VSCODE_DEFAULT_API_VERSION;
    return vscode;
}

function overrideInternalLoad(): void {
    const module = require('module');
    const vscodeModuleName = 'vscode';
    // save original load method
    const internalLoad = module._load;

    // if we try to resolve theia module, return the filename entry to use cache.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    module._load = function (request: string, parent: any, isMain: {}): any {
        if (request !== vscodeModuleName) {
            return internalLoad.apply(this, arguments);
        }

        const plugin = findPlugin(parent.filename);
        if (plugin) {
            const apiImpl = pluginsApiImpl.get(plugin.model.id);
            return apiImpl;
        }

        if (!defaultApi) {
            console.warn(`Could not identify plugin for 'Theia' require call from ${parent.filename}`);
            defaultApi = createVSCodeAPI(pluginApiFactory, emptyPlugin);
        }

        return defaultApi;
    };

    registerESMLoaderHook();
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.find(plugin => filePath.startsWith(plugin.pluginFolder));
}

/**
 * Register an ESM loader hook so that `import 'vscode'` from an ESM plugin
 * resolves through the same `module._load` patch above.
 *
 * The hook emits a unique synthetic CommonJS module per importing parent.
 * The synthetic source:
 *   - looks up the plugin API via `Module._load('vscode', { filename: <parent path> })`,
 *     reusing the existing `findPlugin(parent.filename)` lookup, and
 *   - copies the API's top-level namespace into `exports.<name> = __api.<name>` so
 *     `cjs-module-lexer` exposes them as ESM named exports (required by VS Code
 *     extensions that do e.g. `import { commands, window } from 'vscode'`).
 *
 * Making the synthetic URL unique per importing parent gives each ESM plugin its
 * own Node module-cache entry, so each plugin receives ITS OWN API rather than
 * the first plugin's API being captured forever.
 */
function registerESMLoaderHook(): void {
    const sampleApi = plugins.length > 0 ? pluginsApiImpl.get(plugins[0].model.id) : undefined;
    const apiKeys = sampleApi ? Object.keys(sampleApi) : [];
    const loaderSource = `
import { fileURLToPath } from 'node:url';
const SHIM_URL_PREFIX = 'theia-vscode-shim:///vscode.cjs?parent=';
const API_KEYS = ${JSON.stringify(apiKeys)};

export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'vscode' && context.parentURL && context.parentURL.startsWith('file:')) {
        return {
            shortCircuit: true,
            url: SHIM_URL_PREFIX + encodeURIComponent(context.parentURL),
            format: 'commonjs'
        };
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url.startsWith(SHIM_URL_PREFIX)) {
        const parentURL = decodeURIComponent(url.slice(SHIM_URL_PREFIX.length));
        let parentPath = '';
        if (parentURL.startsWith('file:')) {
            try { parentPath = fileURLToPath(parentURL); } catch { parentPath = ''; }
        }
        const namedExports = API_KEYS
            .map(k => 'exports[' + JSON.stringify(k) + '] = __api[' + JSON.stringify(k) + '];')
            .join('\\n');
        const source =
            "const Module = require('module');\\n" +
            "const __api = Module._load('vscode', { filename: " + JSON.stringify(parentPath) + " }, false);\\n" +
            namedExports;
        return { format: 'commonjs', shortCircuit: true, source };
    }
    return nextLoad(url, context);
}
`;
    try {
        const dataUrl = 'data:text/javascript;base64,' + Buffer.from(loaderSource, 'utf8').toString('base64');
        register(dataUrl);
    } catch (e) {
        console.error('Failed to register VS Code ESM loader hook; ESM plugins will not load:', e);
    }
}
