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
import { injectable, inject, named } from 'inversify';
import { HostedPluginServer, HostedPluginClient, PluginMetadata, PluginDeployerEntry, DebugConfiguration, PluginDeployerHandler } from '../../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';
import { HostedInstanceManager } from './hosted-instance-manager';
import { HostedPluginSupport } from './hosted-plugin';
import { HostedPluginsManager } from './hosted-plugins-manager';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core';
import { ContributionProvider } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer, PluginDeployerHandler {
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(HostedPluginsManager)
    protected readonly hostedPluginsManager: HostedPluginsManager;

    @inject(ContributionProvider)
    @named(Symbol.for(ExtPluginApiProvider))
    protected readonly extPluginAPIContributions: ContributionProvider<ExtPluginApiProvider>;

    /**
     * Managed plugin metadata backend entries.
     */
    private currentBackendPluginsMetadata: PluginMetadata[] = [];

    /**
     * Managed plugin metadata frontend entries.
     */
    private currentFrontendPluginsMetadata: PluginMetadata[] = [];

    constructor(
        @inject(HostedPluginReader) private readonly reader: HostedPluginReader,
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport,
        @inject(HostedInstanceManager) protected readonly hostedInstanceManager: HostedInstanceManager) {
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
    }
    setClient(client: HostedPluginClient): void {
        this.hostedPlugin.setClient(client);
    }
    async getHostedPlugin(): Promise<PluginMetadata | undefined> {
        const pluginMetadata = await this.reader.getPlugin();
        if (pluginMetadata) {
            this.hostedPlugin.runPlugin(pluginMetadata.model);
        }
        return Promise.resolve(this.reader.getPlugin());
    }

    getDeployedFrontendMetadata(): Promise<PluginMetadata[]> {
        return Promise.resolve(this.currentFrontendPluginsMetadata);
    }

    async getDeployedMetadata(): Promise<PluginMetadata[]> {
        const allMetadata: PluginMetadata[] = [];
        allMetadata.push(...this.currentFrontendPluginsMetadata);
        allMetadata.push(...this.currentBackendPluginsMetadata);

        // ask remote as well
        const extraBackendPluginsMetadata = await this.hostedPlugin.getExtraPluginMetadata();
        allMetadata.push(...extraBackendPluginsMetadata);

        return allMetadata;
    }

    // need to run a new node instance with plugin-host for all plugins
    async deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<void> {
        for (const plugin of frontendPlugins) {
            const metadata = await this.reader.getPluginMetadata(plugin.path());
            if (metadata) {
                this.currentFrontendPluginsMetadata.push(metadata);
                this.logger.info(`Deploying frontend plugin "${metadata.model.name}@${metadata.model.version}" from "${metadata.model.entryPoint.frontend || plugin.path()}"`);
            }
        }
    }

    getDeployedBackendMetadata(): Promise<PluginMetadata[]> {
        return Promise.resolve(this.currentBackendPluginsMetadata);
    }

    // need to run a new node instance with plugin-host for all plugins
    async deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<void> {
        if (backendPlugins.length > 0) {
            this.hostedPlugin.runPluginServer();
        }
        for (const plugin of backendPlugins) {
            const metadata = await this.reader.getPluginMetadata(plugin.path());
            if (metadata) {
                this.currentBackendPluginsMetadata.push(metadata);
                this.logger.info(`Deploying backend plugin "${metadata.model.name}@${metadata.model.version}" from "${metadata.model.entryPoint.backend || plugin.path()}"`);
            }
        }
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }

    isPluginValid(uri: string): Promise<boolean> {
        return Promise.resolve(this.hostedInstanceManager.isPluginValid(new URI(uri)));
    }

    runHostedPluginInstance(uri: string): Promise<string> {
        return this.uriToStrPromise(this.hostedInstanceManager.run(new URI(uri)));
    }

    runDebugHostedPluginInstance(uri: string, debugConfig: DebugConfiguration): Promise<string> {
        return this.uriToStrPromise(this.hostedInstanceManager.debug(new URI(uri), debugConfig));
    }

    terminateHostedPluginInstance(): Promise<void> {
        return Promise.resolve(this.hostedInstanceManager.terminate());
    }

    isHostedPluginInstanceRunning(): Promise<boolean> {
        return Promise.resolve(this.hostedInstanceManager.isRunning());
    }

    getHostedPluginInstanceURI(): Promise<string> {
        return Promise.resolve(this.hostedInstanceManager.getInstanceURI().toString());
    }

    getHostedPluginURI(): Promise<string> {
        return Promise.resolve(this.hostedInstanceManager.getPluginURI().toString());
    }

    protected uriToStrPromise(promise: Promise<URI>): Promise<string> {
        return new Promise((resolve, reject) => {
            promise.then((uri: URI) => {
                resolve(uri.toString());
            }).catch(error => reject(error));
        });
    }

    runWatchCompilation(path: string): Promise<void> {
        return this.hostedPluginsManager.runWatchCompilation(path);
    }

    stopWatchCompilation(path: string): Promise<void> {
        return this.hostedPluginsManager.stopWatchCompilation(path);
    }

    isWatchCompilationRunning(path: string): Promise<boolean> {
        return this.hostedPluginsManager.isWatchCompilationRunning(path);
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve(this.extPluginAPIContributions.getContributions().map(p => p.provideApi()));
    }
}
