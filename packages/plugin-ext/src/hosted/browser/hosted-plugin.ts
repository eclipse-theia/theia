/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject, interfaces } from 'inversify';
import { PluginWorker } from '../../main/browser/plugin-worker';
import { HostedPluginServer, PluginMetadata } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../api/rpc-protocol';
import { ILogger } from '@theia/core';
@injectable()
export class HostedPluginSupport {
    container: interfaces.Container;
    private worker: PluginWorker;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    private readonly server: HostedPluginServer;

    @inject(HostedPluginWatcher)
    private readonly watcher: HostedPluginWatcher;

    checkAndLoadPlugin(container: interfaces.Container): void {
        this.container = container;
        this.initPlugins();
    }

    public initPlugins(): void {
        this.server.getHostedPlugin().then((pluginMedata: any) => {
            if (pluginMedata) {
                this.loadPlugin(pluginMedata, this.container);
            }
        });

        const backendMetadatas = this.server.getDeployedBackendMetadata();

        backendMetadatas.then((pluginMetadatas: PluginMetadata[]) => {
            pluginMetadatas.forEach(pluginMetadata => this.loadPlugin(pluginMetadata, this.container));
        });

        this.server.getDeployedFrontendMetadata().then((pluginMetadatas: PluginMetadata[]) => {
            pluginMetadatas.forEach(pluginMetadata => this.loadPlugin(pluginMetadata, this.container));
        });

    }

    public loadPlugin(pluginMedata: PluginMetadata, container: interfaces.Container): void {
        const pluginModel = pluginMedata.model;
        const pluginLifecycle = pluginMedata.lifecycle;
        this.logger.info('Ask to load the plugin with model ', pluginModel, ' and lifecycle', pluginLifecycle);
        if (pluginModel.entryPoint!.frontend) {
            this.logger.info(`Loading frontend hosted plugin: ${pluginModel.name}`);
            this.worker = new PluginWorker();
            setUpPluginApi(this.worker.rpc, container);
            const hostedExtManager = this.worker.rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            const plugin: Plugin = {
                pluginPath: pluginModel.entryPoint.frontend!,
                model: pluginModel,
                lifecycle: pluginLifecycle
            };
            const frontendInitPath = pluginLifecycle.frontendInitPath;
            if (frontendInitPath) {
                hostedExtManager.$initialize(frontendInitPath, pluginMedata);
                hostedExtManager.$loadPlugin(frontendInitPath, plugin);
            } else {
                hostedExtManager.$loadPlugin('', plugin);
            }
        }
        if (pluginModel.entryPoint!.backend) {
            this.logger.info(`Loading backend hosted plugin: ${pluginModel.name}`);
            const rpc = this.createServerRpc();
            setUpPluginApi(rpc, container);
            const hostedExtManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            const plugin: Plugin = {
                pluginPath: pluginModel.entryPoint.backend!,
                model: pluginModel,
                lifecycle: pluginLifecycle
            };
            const backendInitPath = pluginLifecycle.backendInitPath;
            if (backendInitPath) {
                hostedExtManager.$initialize(backendInitPath, pluginMedata);
                hostedExtManager.$loadPlugin(backendInitPath, plugin);
            } else {
                hostedExtManager.$loadPlugin('', plugin);
            }
        }
    }

    private createServerRpc(): RPCProtocol {
        return new RPCProtocolImpl({
            onMessage: this.watcher.onPostMessageEvent,
            send: message => { this.logger.info('sending to ', this.server, 'the message', message); this.server.onMessage(JSON.stringify(message)); }
        });
    }
}
