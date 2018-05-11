/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Emitter } from '@theia/core/lib/common/event';
import { RPCProtocolImpl } from '../../../api/rpc-protocol';
import { HostedPluginManagerExtImpl } from '../../plugin/hosted-plugin-manager';
import { MAIN_RPC_CONTEXT, Plugin } from '../../../api/plugin-api';
import { createAPI, startPlugin } from '../../../plugin/plugin-context';
import { getPluginId, PluginMetadata } from '../../../common/plugin-protocol';

const ctx = self as any;
const plugins = new Map<string, () => void>();

const emitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emitter.event,
    send: (m: {}) => {
        ctx.postMessage(m);
    }
});
addEventListener('message', (message: any) => {
    emitter.fire(message.data);
});

const theia = createAPI(rpc);
ctx['theia'] = theia;

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, new HostedPluginManagerExtImpl({
    initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
        ctx.importScripts('/context/' + contextPath);
    },
    loadPlugin(contextPath: string, plugin: Plugin): void {
        ctx.importScripts('/hostedPlugin/' + getPluginId(plugin.model) + '/' + plugin.pluginPath);
        if (plugin.lifecycle.frontendModuleName) {
            if (!ctx[plugin.lifecycle.frontendModuleName]) {
                console.error(`WebWorker: Cannot start plugin "${plugin.model.name}". Frontend plugin not found: "${plugin.lifecycle.frontendModuleName}"`);
                return;
            }
            startPlugin(plugin, ctx[plugin.lifecycle.frontendModuleName], plugins);
        }
    },
    stopPlugins(contextPath: string, pluginIds: string[]): void {
        pluginIds.forEach(pluginId => {
            const stopPluginMethod = plugins.get(pluginId);
            if (stopPluginMethod) {
                stopPluginMethod();
                plugins.delete(pluginId);
            }
        });
    }
}));
