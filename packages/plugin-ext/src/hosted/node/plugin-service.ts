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
import { injectable, inject, named, postConstruct } from 'inversify';
import { HostedPluginServer, HostedPluginClient, PluginMetadata, PluginDeployer, GetDeployedPluginsParams } from '../../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { ILogger, Disposable } from '@theia/core';
import { ContributionProvider } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { HostedPluginDeployerHandler } from './hosted-plugin-deployer-handler';
import { PluginDeployerImpl } from '../../main/node/plugin-deployer-impl';

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginDeployerHandler)
    protected readonly deployerHandler: HostedPluginDeployerHandler;

    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    @inject(ContributionProvider)
    @named(Symbol.for(ExtPluginApiProvider))
    protected readonly extPluginAPIContributions: ContributionProvider<ExtPluginApiProvider>;

    protected client: HostedPluginClient | undefined;

    protected deployedListener: Disposable;

    constructor(
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport) {
    }

    @postConstruct()
    protected init(): void {
        this.deployedListener = this.pluginDeployer.onDidDeploy(() => {
            if (this.client) {
                this.client.onDidDeploy();
            }
        });
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
        this.deployedListener.dispose();
    }
    setClient(client: HostedPluginClient): void {
        this.client = client;
        this.hostedPlugin.setClient(client);
    }

    async getDeployedPluginIds(): Promise<string[]> {
        const backendMetadata = await this.deployerHandler.getDeployedBackendMetadata();
        if (backendMetadata.length > 0) {
            this.hostedPlugin.runPluginServer();
        }
        const plugins = new Set<string>();
        for (const plugin of await this.deployerHandler.getDeployedFrontendMetadata()) {
            plugins.add(plugin.model.id);
        }
        for (const plugin of backendMetadata) {
            plugins.add(plugin.model.id);
        }
        const extraPluginMetadata = await this.hostedPlugin.getExtraPluginMetadata();
        for (const plugin of extraPluginMetadata) {
            plugins.add(plugin.model.id);
        }
        return [...plugins.values()];
    }

    async getDeployedPlugins({ pluginIds }: GetDeployedPluginsParams): Promise<PluginMetadata[]> {
        if (!pluginIds.length) {
            return [];
        }
        const plugins = [];
        let extraPluginMetadata: Map<string, PluginMetadata> | undefined;
        for (const pluginId of pluginIds) {
            let plugin = this.deployerHandler.getDeployedPluginMetadata(pluginId);
            if (!plugin) {
                if (!extraPluginMetadata) {
                    extraPluginMetadata = new Map<string, PluginMetadata>();
                    for (const metadata of await this.hostedPlugin.getExtraPluginMetadata()) {
                        extraPluginMetadata.set(metadata.model.id, metadata);
                    }
                }
                plugin = extraPluginMetadata.get(pluginId);
            }
            if (plugin) {
                plugins.push(plugin);
            }
        }
        return plugins;
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve(this.extPluginAPIContributions.getContributions().map(p => p.provideApi()));
    }
}
