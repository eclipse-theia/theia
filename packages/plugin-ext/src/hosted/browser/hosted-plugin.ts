/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject, interfaces } from 'inversify';
import { PluginWorker } from '../../main/browser/plugin-worker';
import { HostedPluginServer, PluginLifecycle, PluginModel } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../api/rpc-protocol';
@injectable()
export class HostedPluginSupport {
    private worker: PluginWorker;

    constructor(@inject(HostedPluginServer) private readonly server: HostedPluginServer,
        @inject(HostedPluginWatcher) private readonly watcher: HostedPluginWatcher) {
    }

    checkAndLoadPlugin(container: interfaces.Container): void {
        this.server.getHostedPlugin().then((pluginMedata: any) => {
            if (pluginMedata) {
                this.loadPlugin(pluginMedata.model, pluginMedata.lifecycle, container);
            }
        });
    }

    private loadPlugin(pluginModel: PluginModel, pluginLifecycle: PluginLifecycle, container: interfaces.Container): void {
        if (pluginModel.entryPoint!.frontend) {
            console.log(`Loading hosted plugin: ${pluginModel.name}`);
            this.worker = new PluginWorker();
            setUpPluginApi(this.worker.rpc, container);
            const hostedExtManager = this.worker.rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            const plugin: Plugin = {
                pluginPath: pluginModel.entryPoint.frontend!,
                model: pluginModel,
                lifecycle: pluginLifecycle
            };
            if (pluginLifecycle.frontendInitPath) {
                hostedExtManager.$initialize(pluginLifecycle.frontendInitPath);
            }
            hostedExtManager.$loadPlugin(plugin);
        }
        if (pluginModel.entryPoint!.backend) {
            const rpc = this.createServerRpc();
            setUpPluginApi(rpc, container);
            const hostedExtManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            const plugin: Plugin = {
                pluginPath: pluginModel.entryPoint.backend!,
                model: pluginModel,
                lifecycle: pluginLifecycle
            };
            if (pluginLifecycle.backendInitPath) {
                hostedExtManager.$initialize(pluginLifecycle.backendInitPath);
            }
            hostedExtManager.$loadPlugin(plugin);
        }
    }

    private createServerRpc(): RPCProtocol {
        return new RPCProtocolImpl({
            onMessage: this.watcher.onPostMessageEvent,
            send: message => this.server.onMessage(JSON.stringify(message))
        });
    }
}
