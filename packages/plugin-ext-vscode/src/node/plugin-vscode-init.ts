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

import * as path from 'path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
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

        // For ESM plugins, require('vscode') comes from the CJS shim (vscode-esm-shim.cjs),
        // so parent.filename won't match any plugin folder. Fall back to the global
        // tracking variable set by the plugin host before loading ESM plugins.
        const plugin = findPlugin(parent.filename) ?? findPluginByESMGlobal();
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

    // Register an ESM loader hook so that `import 'vscode'` in ESM plugins
    // is resolved via the same CJS `module._load` override above.
    const esmLoaderPath = path.join(__dirname, 'vscode-esm-loader.mjs');
    register(pathToFileURL(esmLoaderPath).href);
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.find(plugin => filePath.startsWith(plugin.pluginFolder));
}

/**
 * Fallback for ESM plugins: the plugin host sets `global.__theia_esm_plugin_folder`
 * before calling `import()` on an ESM plugin. The CJS shim's `require('vscode')`
 * triggers `module._load`, but its `parent.filename` points to the shim, not the plugin.
 * This function uses the global to identify the correct plugin.
 */
function findPluginByESMGlobal(): Plugin | undefined {
    const folder = (global as any).__theia_esm_plugin_folder as string | undefined;
    if (folder) {
        return plugins.find(plugin => plugin.pluginFolder === folder || folder.startsWith(plugin.pluginFolder));
    }
    return undefined;
}
