/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc.
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

import * as theia from '@theia/plugin';
import { BackendInitializationFn, PluginAPIFactory, Plugin, emptyPlugin } from '@theia/plugin-ext';

const pluginsApiImpl = new Map<string, typeof theia>();
const plugins = new Array<Plugin>();
let defaultApi: typeof theia;
let isLoadOverride = false;
let pluginApiFactory: PluginAPIFactory;

export const doInitialization: BackendInitializationFn = (apiFactory: PluginAPIFactory, plugin: Plugin) => {
    const vscode = apiFactory(plugin);

    // register the commands that are in the package.json file
    const contributes: any = plugin.rawModel.contributes;
    if (contributes && contributes.commands) {
        contributes.commands.forEach((commandItem: any) => {
            let commandLabel: string;
            if (commandItem.category) { // if VS Code command has category we will add it before title, so label will looks like 'category: title'
                commandLabel = commandItem.category + ': ' + commandItem.title;
            } else {
                commandLabel = commandItem.title;
            }
            vscode.commands.registerCommand({id: commandItem.command, label: commandLabel });
        });
    }

    // replace command API as it will send only the ID as a string parameter
    vscode.commands.registerCommand = function registerCommand(command: any, handler?: <T>(...args: any[]) => T | Thenable<T>): any {
        // use of the ID when registering commands
        if (typeof command === 'string' && handler) {
            return vscode.commands.registerHandler(command, handler);
        }
    };

    // use Theia plugin api instead vscode extensions
    (<any>vscode).extensions = {
        get all(): any[] {
            return vscode.plugins.all;
        },
        getExtension(pluginId: string): any | undefined {
            return vscode.plugins.getPlugin(pluginId);
        }
    };

    // override the version for vscode to be a VSCode version
    (<any>vscode).version = '1.27.2';

    pluginsApiImpl.set(plugin.model.id, vscode);
    plugins.push(plugin);

    if (!isLoadOverride) {
        overrideInternalLoad();
        isLoadOverride = true;
        pluginApiFactory = apiFactory;
    }
};

function overrideInternalLoad(): void {
    const module = require('module');
    const vscodeModuleName = 'vscode';
    // save original load method
    const internalLoad = module._load;

    // if we try to resolve theia module, return the filename entry to use cache.
    // tslint:disable-next-line:no-any
    module._load = function (request: string, parent: any, isMain: {}) {
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
            defaultApi = pluginApiFactory(emptyPlugin);
        }

        return defaultApi;
    };
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.find(plugin => filePath.startsWith(plugin.pluginFolder));
}
