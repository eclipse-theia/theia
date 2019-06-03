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
import { HostedPluginServer, HostedPluginClient, PluginMetadata, PluginDeployer } from '../../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { ILogger } from '@theia/core';
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

    constructor(
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport) {
    }

    @postConstruct()
    protected init(): void {
        this.pluginDeployer.onDidDeploy(() => {
            if (this.client) {
                this.client.onDidDeploy();
            }
        });
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
    }
    setClient(client: HostedPluginClient): void {
        this.client = client;
        this.hostedPlugin.setClient(client);
    }

    getDeployedFrontendMetadata(): Promise<PluginMetadata[]> {
        return this.deployerHandler.getDeployedFrontendMetadata();
    }

    async getDeployedMetadata(): Promise<PluginMetadata[]> {
        const backendMetadata = await this.deployerHandler.getDeployedBackendMetadata();
        if (backendMetadata.length > 0) {
            this.hostedPlugin.runPluginServer();
        }
        const allMetadata: PluginMetadata[] = [];
        allMetadata.push(...await this.deployerHandler.getDeployedFrontendMetadata());
        allMetadata.push(...backendMetadata);

        // ask remote as well
        const extraBackendPluginsMetadata = await this.hostedPlugin.getExtraPluginMetadata();
        allMetadata.push(...extraBackendPluginsMetadata);

        return allMetadata;
    }

    getDeployedBackendMetadata(): Promise<PluginMetadata[]> {
        return Promise.resolve(this.deployerHandler.getDeployedBackendMetadata());
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve(this.extPluginAPIContributions.getContributions().map(p => p.provideApi()));
    }
}
