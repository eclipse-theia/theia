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
import { injectable, inject, interfaces } from 'inversify';
import { PluginWorker } from '../../main/browser/plugin-worker';
import { HostedPluginServer, PluginMetadata } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../api/rpc-protocol';
import { ILogger } from '@theia/core';
import { PreferenceServiceImpl } from '@theia/core/lib/browser';
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

    private theiaReadyPromise: Promise<any>;

    constructor(
        @inject(PreferenceServiceImpl) private readonly preferenceServiceImpl: PreferenceServiceImpl
    ) {
        this.theiaReadyPromise = Promise.all([this.preferenceServiceImpl.ready]);
    }

    checkAndLoadPlugin(container: interfaces.Container): void {
        this.container = container;
        this.initPlugins();
    }

    public initPlugins(): void {
        this.server.getHostedPlugin().then((pluginMetadata: any) => {
            if (pluginMetadata) {
                this.loadPlugin(pluginMetadata, this.container);
            }
        });

        const backendMetadata = this.server.getDeployedBackendMetadata();

        backendMetadata.then((pluginMetadata: PluginMetadata[]) => {
            pluginMetadata.forEach(metadata => this.loadPlugin(metadata, this.container));
        });

        this.server.getDeployedFrontendMetadata().then((pluginMetadata: PluginMetadata[]) => {
            pluginMetadata.forEach(metadata => this.loadPlugin(metadata, this.container));
        });

    }

    public loadPlugin(pluginMetadata: PluginMetadata, container: interfaces.Container): void {
        const pluginModel = pluginMetadata.model;
        const pluginLifecycle = pluginMetadata.lifecycle;
        this.logger.info('Ask to load the plugin with model ', pluginModel, ' and lifecycle', pluginLifecycle);
        if (pluginModel.entryPoint!.frontend) {
            this.logger.info(`Loading frontend hosted plugin: ${pluginModel.name}`);
            this.worker = new PluginWorker();
            setUpPluginApi(this.worker.rpc, container);

            this.theiaReadyPromise.then(() => {
                const hostedExtManager = this.worker.rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
                const plugin: Plugin = {
                    pluginPath: pluginModel.entryPoint.frontend!,
                    model: pluginModel,
                    lifecycle: pluginLifecycle
                };
                const frontendInitPath = pluginLifecycle.frontendInitPath;
                if (frontendInitPath) {
                    hostedExtManager.$initialize(frontendInitPath, pluginMetadata);
                    hostedExtManager.$loadPlugin(frontendInitPath, plugin);
                } else {
                    hostedExtManager.$loadPlugin('', plugin);
                }
            });
        }
        if (pluginModel.entryPoint!.backend) {
            this.logger.info(`Loading backend hosted plugin: ${pluginModel.name}`);
            const rpc = this.createServerRpc();
            setUpPluginApi(rpc, container);

            this.theiaReadyPromise.then(() => {
                const hostedExtManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
                const plugin: Plugin = {
                    pluginPath: pluginModel.entryPoint.backend!,
                    model: pluginModel,
                    lifecycle: pluginLifecycle
                };
                const backendInitPath = pluginLifecycle.backendInitPath;
                if (backendInitPath) {
                    hostedExtManager.$initialize(backendInitPath, pluginMetadata);
                    hostedExtManager.$loadPlugin(backendInitPath, plugin);
                } else {
                    hostedExtManager.$loadPlugin('', plugin);
                }
            });
        }
    }

    private createServerRpc(): RPCProtocol {
        return new RPCProtocolImpl({
            onMessage: this.watcher.onPostMessageEvent,
            send: message => { this.logger.info('sending to ', this.server, 'the message', message); this.server.onMessage(JSON.stringify(message)); }
        });
    }
}
