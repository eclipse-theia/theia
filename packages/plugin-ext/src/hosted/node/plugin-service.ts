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
import { HostedPluginServer, HostedPluginClient, PluginMetadata, PluginDeployer, PluginMetadataHandle } from '../../common/plugin-protocol';
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

    private readonly extraPluginMetadata = new Map<string, PluginMetadata>();

    async getDeployedPlugins(): Promise<string[]> {
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
        this.extraPluginMetadata.clear();
        for (const plugin of extraPluginMetadata) {
            plugins.add(plugin.model.id);
            this.extraPluginMetadata.set(plugin.model.id, plugin);
        }
        return [...plugins.values()];
    }

    getDeployedPlugin(pluginId: string): PluginMetadata | undefined {
        return this.deployerHandler.getDeployedPluginMetadata(pluginId) ||
            this.extraPluginMetadata.get(pluginId);
    }

    async onMessage(message: string): Promise<void> {
        const json = JSON.parse(message);
        // a hack to avoid sending plugin metadata over remote JSON-RPC,
        // don't abuse parsing and serializing data back otherwise
        if (message.indexOf('pluginHandle') !== -1 && Array.isArray(json.content)) {
            json.content = json.content.map((content: string) => JSON.stringify(JSON.parse(content, (key, value) => {
                if (PluginMetadataHandle.is(value)) {
                    return this.getDeployedPlugin(value.pluginHandle);
                }
                if (key === 'plugins' && Array.isArray(value)) {
                    // filter out undeployed plugins
                    return value.filter(plugin => !!plugin);
                }
                return value;
            })));
        }
        this.hostedPlugin.onMessage(json);
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve(this.extPluginAPIContributions.getContributions().map(p => p.provideApi()));
    }
}
