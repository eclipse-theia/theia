/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
    console.log("PLUGIN_HOST(" + process.pid + "): " + message);
    emmitter.fire(JSON.parse(message));
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
