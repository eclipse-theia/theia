/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject, interfaces } from 'inversify';
import { HostedPluginServer, Plugin } from '../common/plugin-protocol';
import { PluginWorker } from './plugin-worker';
import { setUpPluginApi } from './main-context';
import { MAIN_RPC_CONTEXT } from '../api/plugin-api';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { RPCProtocol, RPCProtocolImpl } from '../api/rpc-protocol';
@injectable()
export class HostedPluginSupport {
    private worker: PluginWorker;

    constructor(@inject(HostedPluginServer) private readonly server: HostedPluginServer,
        @inject(HostedPluginWatcher) private readonly watcher: HostedPluginWatcher) {
    }

    checkAndLoadPlugin(container: interfaces.Container): void {
        this.server.getHostedPlugin().then(plugin => {
            if (plugin) {
                this.loadPlugin(plugin, container);
            }
        });
    }

    private loadPlugin(plugin: Plugin, container: interfaces.Container): void {
        if (plugin.theiaPlugin!.worker) {
            console.log(`Loading hosted plugin: ${plugin.name}`);
            this.worker = new PluginWorker();
            setUpPluginApi(this.worker.rpc, container);
            const hostedExtManager = this.worker.rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            hostedExtManager.$loadPlugin({
                pluginPath: plugin.theiaPlugin.worker!,
                name: plugin.name,
                publisher: plugin.publisher,
                version: plugin.version
            });
        }
        if (plugin.theiaPlugin!.node) {
            const rpc = this.createServerRpc();
            setUpPluginApi(rpc, container);
            const hostedExtManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            hostedExtManager.$loadPlugin({
                pluginPath: plugin.theiaPlugin.node!,
                name: plugin.name,
                publisher: plugin.publisher,
                version: plugin.version
            });
        }
    }

    private createServerRpc(): RPCProtocol {
        return new RPCProtocolImpl({
            onMessage: this.watcher.onPostMessageEvent,
            send: message => this.server.onMessage(JSON.stringify(message))
        });
    }
}
