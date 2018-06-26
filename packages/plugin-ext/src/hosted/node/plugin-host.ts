/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { Emitter } from '@theia/core/lib/common/event';
import { startPlugin } from '../../plugin/plugin-context';
import { HostedPluginManagerExtImpl } from '../plugin/hosted-plugin-manager';
import { RPCProtocolImpl } from '../../api/rpc-protocol';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { PluginMetadata } from "../../common/plugin-protocol";

console.log("PLUGIN_HOST(" + process.pid + ") starting instance");

const plugins = new Map<string, () => void>();

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
    try {
        emmitter.fire(JSON.parse(message));
    } catch (e) {
        console.error(e);
    }
});

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({

    initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
        console.log("PLUGIN_HOST(" + process.pid + "): initializing(" + contextPath + ")");
        const backendInit = require(contextPath);
        backendInit.doInitialization(rpc, pluginMetadata);
    },
    loadPlugin(contextPath: string, plugin: Plugin): void {
        console.log("PLUGIN_HOST(" + process.pid + "): loadPlugin(" + plugin.pluginPath + ")");
        const backendInit = require(contextPath);
        if (backendInit.doLoad) {
            backendInit.doLoad(rpc, plugin);
        }
        try {
            const pluginMain = require(plugin.pluginPath);
            startPlugin(plugin, pluginMain, plugins);

        } catch (e) {
            console.error(e);
        }
    },
    stopPlugins(contextPath: string, pluginIds: string[]): void {
        console.log("PLUGIN_HOST(" + process.pid + "): stopPlugins(" + JSON.stringify(pluginIds) + ")");
        pluginIds.forEach(pluginId => {
            const stopPluginMethod = plugins.get(pluginId);
            if (stopPluginMethod) {
                stopPluginMethod();
                plugins.delete(pluginId);
            }
        });
    }
}));
