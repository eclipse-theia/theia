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
import { injectable, inject } from 'inversify';
import { HostedPluginServer, HostedPluginClient, PluginMetadata, PluginDeployerEntry } from '../../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginManager } from './hosted-plugin-manager';
import { HostedPluginSupport } from './hosted-plugin';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core';

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {

    @inject(ILogger)
    protected readonly logger: ILogger;

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
        @inject(HostedPluginManager) protected readonly hostedPluginManager: HostedPluginManager) {
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
    }
    setClient(client: HostedPluginClient): void {
        this.hostedPlugin.setClient(client);
    }
    getHostedPlugin(): Promise<PluginMetadata | undefined> {
        const pluginMetadata = this.reader.getPlugin();
        if (pluginMetadata) {
            this.hostedPlugin.runPlugin(pluginMetadata.model);
        }
        return Promise.resolve(this.reader.getPlugin());
    }

    getDeployedFrontendMetadata(): Promise<PluginMetadata[]> {
        return Promise.resolve(this.currentFrontendPluginsMetadata);
    }

    getDeployedMetadata(): Promise<PluginMetadata[]> {
        const allMetadata: PluginMetadata[] = [];
        allMetadata.push(...this.currentFrontendPluginsMetadata);
        allMetadata.push(...this.currentBackendPluginsMetadata);
        return Promise.resolve(allMetadata);
    }

    // need to run a new node instance with plugin-host for all plugins
    deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<void> {
        // get metadata
        frontendPlugins.forEach(frontendPluginDeployerEntry => {
            const pluginMetadata = this.reader.getPluginMetadata(frontendPluginDeployerEntry.path());
            if (pluginMetadata) {
                this.currentFrontendPluginsMetadata.push(pluginMetadata);
                this.logger.info('HostedPluginServerImpl/ asking to deploy the frontend Plugin', frontendPluginDeployerEntry.path(), 'and model is', pluginMetadata.model);
            }
        });
        return Promise.resolve();
    }

    getDeployedBackendMetadata(): Promise<PluginMetadata[]> {
        return Promise.resolve(this.currentBackendPluginsMetadata);
    }

    // need to run a new node instance with plugin-host for all plugins
    deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<void> {
        if (backendPlugins.length > 0) {
            this.hostedPlugin.runPluginServer();
        }

        // get metadata
        backendPlugins.forEach(backendPluginDeployerEntry => {
            const pluginMetadata = this.reader.getPluginMetadata(backendPluginDeployerEntry.path());
            if (pluginMetadata) {
                this.currentBackendPluginsMetadata.push(pluginMetadata);
                this.logger.info('HostedPluginServerImpl/ asking to deploy the backend Plugin', backendPluginDeployerEntry.path(), 'and model is', pluginMetadata.model);
            }
        });
        return Promise.resolve();
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }

    isPluginValid(uri: string): Promise<boolean> {
        return Promise.resolve(this.hostedPluginManager.isPluginValid(new URI(uri)));
    }

    runHostedPluginInstance(uri: string): Promise<string> {
        return this.uriToStrPromise(this.hostedPluginManager.run(new URI(uri)));
    }

    terminateHostedPluginInstance(): Promise<void> {
        return Promise.resolve(this.hostedPluginManager.terminate());
    }

    isHostedTheiaRunning(): Promise<boolean> {
        return Promise.resolve(this.hostedPluginManager.isRunning());
    }

    getHostedPluginInstanceURI(): Promise<string> {
        return Promise.resolve(this.hostedPluginManager.getInstanceURI().toString());
    }

    protected uriToStrPromise(promise: Promise<URI>): Promise<string> {
        return new Promise((resolve, reject) => {
            promise.then((uri: URI) => {
                resolve(uri.toString());
            }).catch(error => reject(error));
        });
    }

}
