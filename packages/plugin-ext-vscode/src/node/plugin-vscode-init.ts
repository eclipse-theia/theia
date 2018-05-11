/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { BackendInitializationFn, createAPI, PluginMetadata } from '@theia/plugin-ext';

export const doInitialization: BackendInitializationFn = (rpc: any, pluginMetadata: PluginMetadata) => {
    const module = require('module');
    const vscodeModuleName = 'vscode';
    const vscode = createAPI(rpc);

    // register the commands that are in the package.json file
    const contributes: any = pluginMetadata.source.contributes;
    if (contributes && contributes.commands) {
        contributes.commands.forEach((commandItem: any) => {
            vscode.commands.registerCommand({ id: commandItem.command, label: commandItem.title });
        });
    }

    // replace command API as it will send only the ID as a string parameter
    vscode.commands.registerCommand = function registerCommand(command: any, handler?: <T>(...args: any[]) => T | Thenable<T>): any {
        // use of the ID when registering commands
        if (typeof command === 'string' && handler) {
            return vscode.commands.registerHandler(command, handler);
        }
    };

    // add theia into global goal as 'vscode'
    const g = global as any;
    g[vscodeModuleName] = vscode;

    // add vscode object as module into npm cache
    require.cache[vscodeModuleName] = {
        id: vscodeModuleName,
        filename: vscodeModuleName,
        loaded: true,
        exports: g[vscodeModuleName]
    };

    // save original resolve method
    const internalResolve = module._resolveFilename;

    // if we try to resolve vscode module, return the filename entry to use cache.
    module._resolveFilename = (request: string, parent: {}) => {
        if (vscodeModuleName === request) {
            return request;
        }
        const retVal = internalResolve(request, parent);
        return retVal;
    };
};
