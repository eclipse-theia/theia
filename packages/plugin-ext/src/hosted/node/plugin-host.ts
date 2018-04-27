/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { resolve } from 'path';
import { Emitter } from '@theia/core/lib/common/event';
import { startPlugin } from '../../plugin/plugin-context';
import { HostedPluginManagerExtImpl } from '../plugin/hosted-plugin-manager';
import { RPCProtocolImpl } from '../../api/rpc-protocol';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';

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
    console.log("Ext: " + message);
    emmitter.fire(JSON.parse(message));
});

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({
    initialize(contextPath: string): void {
        const backendInitPath = resolve(__dirname, 'context', contextPath);
        const backendInit = require(backendInitPath);
        backendInit.doInitialization(rpc);
    },
    loadPlugin(plugin: Plugin): void {
        console.log("Ext: load: " + plugin.pluginPath);

        try {
            const pluginMain = require(plugin.pluginPath);
            startPlugin(plugin, pluginMain, plugins);

        } catch (e) {
            console.error(e);
        }
    },
    stopPlugins(pluginIds: string[]): void {
        console.log("Plugin: Stopping plugin: ", pluginIds);
        pluginIds.forEach(pluginId => {
            const stopPluginMethod = plugins.get(pluginId);
            if (stopPluginMethod) {
                stopPluginMethod();
                plugins.delete(pluginId);
            }
        });
    }
}));
