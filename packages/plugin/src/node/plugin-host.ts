/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { RPCProtocolImpl } from '../api/rpc-protocol';
import { Emitter } from '@theia/core/lib/common/event';
import { createAPI, startExtension } from '../plugin/plugin-context';
import { MAIN_RPC_CONTEXT } from '../api/plugin-api';
import { HostedPluginManagerExtImpl } from '../plugin/hosted-plugin-manager';

const NODE_MODULE_NAMES = ['@theia/plugin', '@wiptheia/plugin'];
const plugins = new Array<() => void>();

const emmitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emmitter.event,
    send: (m: {}) => {
        if (process.send) {
            process.send(JSON.stringify(m));
        }
    }
});
process.on('message', (message: any) => {
    console.log("Ext: " + message);
    emmitter.fire(JSON.parse(message));
});

const theia = createAPI(rpc);

// add theia into global goal
const g = global as any;
g['theia'] = theia;

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({
    loadPlugin(path: string): void {
        console.log("Ext: load: " + path);
        const module = require('module');

        // add theia object as module into npm cache
        NODE_MODULE_NAMES.forEach((moduleName) => {
            require.cache[moduleName] = {
                id: moduleName,
                filename: moduleName,
                loaded: true,
                exports: theia
            };
        });

        // save original resolve method
        const internalResolve = module._resolveFilename;

        // if we try to resolve theia module, return the filename entry to use cache.
        module._resolveFilename = (request: string, parent: {}) => {
            if (NODE_MODULE_NAMES.indexOf(request) !== -1) {
                return request;
            }
            const retVal = internalResolve(request, parent);
            return retVal;
        };

        try {
            const plugin = require(path);
            startExtension(plugin, plugins);

        } catch (e) {
            console.error(e);
        }
    },
    stopPlugins(): void {
        console.log("Plugin: Stopping plugins.");
        for (const s of plugins) {
            s();
        }
    }
}));
