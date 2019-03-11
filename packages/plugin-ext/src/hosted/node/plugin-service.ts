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
import { HostedPluginServer, HostedPluginClient, PluginMetadata, DebugConfiguration } from '../../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';
import { HostedInstanceManager } from './hosted-instance-manager';
import { HostedPluginSupport } from './hosted-plugin';
import { HostedPluginsManager } from './hosted-plugins-manager';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core';
import { ContributionProvider } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { HostedPluginDeployerHandler } from './hosted-plugin-deployer-handler';

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(HostedPluginsManager)
    protected readonly hostedPluginsManager: HostedPluginsManager;

    @inject(HostedPluginDeployerHandler)
    protected readonly deployerHandler: HostedPluginDeployerHandler;

    @inject(ContributionProvider)
    @named(Symbol.for(ExtPluginApiProvider))
    protected readonly extPluginAPIContributions: ContributionProvider<ExtPluginApiProvider>;

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
        return Promise.resolve(this.deployerHandler.getDeployedFrontendMetadata());
    }

    async getDeployedMetadata(): Promise<PluginMetadata[]> {
        const backendMetadata = this.deployerHandler.getDeployedBackendMetadata();
        if (backendMetadata.length > 0) {
            this.hostedPlugin.runPluginServer();
        }
        const allMetadata: PluginMetadata[] = [];
        allMetadata.push(...this.deployerHandler.getDeployedFrontendMetadata());
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
