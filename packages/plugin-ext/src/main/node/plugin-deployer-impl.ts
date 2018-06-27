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
import { injectable, optional, multiInject, inject } from 'inversify';
import {
    PluginDeployerResolver, PluginDeployerFileHandler, PluginDeployerDirectoryHandler,
    PluginDeployerEntry, PluginDeployer, PluginDeployerResolverInit, PluginDeployerFileHandlerContext,
    PluginDeployerDirectoryHandlerContext, HostedPluginServer, PluginDeployerEntryType, PluginServer,
} from '../../common/plugin-protocol';
import { PluginDeployerEntryImpl } from './plugin-deployer-entry-impl';
import { PluginDeployerResolverContextImpl, PluginDeployerResolverInitImpl } from './plugin-deployer-resolver-context-impl';
import { ProxyPluginDeployerEntry } from './plugin-deployer-proxy-entry-impl';
import { PluginDeployerFileHandlerContextImpl } from './plugin-deployer-file-handler-context-impl';
import { PluginDeployerDirectoryHandlerContextImpl } from './plugin-deployer-directory-handler-context-impl';
import { ILogger } from '@theia/core';

@injectable()
export class PluginDeployerImpl implements PluginDeployer, PluginServer {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;

    /**
     * Deployer entries.
     */
    private pluginDeployerEntries: PluginDeployerEntry[];

    /**
     * Inject all plugin resolvers found at runtime.
     */
    @optional() @multiInject(PluginDeployerResolver)
    private pluginResolvers: PluginDeployerResolver[];

    /**
     * Inject all file handler for local resolved plugins.
     */
    @optional() @multiInject(PluginDeployerFileHandler)
    private pluginDeployerFileHandlers: PluginDeployerFileHandler[];

    /**
     * Inject all directory handler for local resolved plugins.
     */
    @optional() @multiInject(PluginDeployerDirectoryHandler)
    private pluginDeployerDirectoryHandlers: PluginDeployerDirectoryHandler[];

    public start(): void {
        this.logger.debug("Starting the deployer with the list of resolvers", this.pluginResolvers);
        this.doStart();
    }

    public async initResolvers(): Promise<Array<void>> {

        // call init on each resolver
        const pluginDeployerResolverInit: PluginDeployerResolverInit = new PluginDeployerResolverInitImpl();
        const promises = this.pluginResolvers.map(async (pluginResolver) => {
            if (pluginResolver.init) {
                pluginResolver.init(pluginDeployerResolverInit);
            }
        });
        return Promise.all(promises);
    }

    protected async doStart(): Promise<void> {

        // init resolvers
        await this.initResolvers();

        // check THEIA_PLUGINS env var
        if (!process.env.THEIA_PLUGINS || process.env.THEIA_PLUGINS === '') {
            return Promise.resolve();
        }
        const pluginsValue = process.env.THEIA_PLUGINS;

        this.logger.debug("Found the list of plugins ID on env:", pluginsValue);

        // transform it to an array
        const pluginIdList = pluginsValue.split(",");

        await this.deployMultipleEntries(pluginIdList);

    }

    public async deploy(pluginEntry: string): Promise<void> {
        const entries: string[] = [];
        entries.push(pluginEntry);
        await this.deployMultipleEntries(entries);
        return Promise.resolve();
    }

    protected async deployMultipleEntries(pluginEntries: string[]): Promise<void> {
        // resolve plugins
        this.pluginDeployerEntries = await this.resolvePlugins(pluginEntries);

        // now that we have plugins check if we have File Handler for them
        await this.applyFileHandlers();

        // ok now ask for directory handlers
        await this.applyDirectoryFileHandlers();

        await this.deployPlugins();

        return Promise.resolve();

    }

    /**
     * deploy all plugins that have been accepted
     */
    public async deployPlugins(): Promise<any> {
        const acceptedPlugins = this.pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted());
        const acceptedFrontendPlugins = this.pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted(PluginDeployerEntryType.FRONTEND));
        const acceptedBackendPlugins = this.pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted(PluginDeployerEntryType.BACKEND));

        this.logger.debug('the accepted plugins are', acceptedPlugins);
        this.logger.debug('the acceptedFrontendPlugins plugins are', acceptedFrontendPlugins);
        this.logger.debug('the acceptedBackendPlugins plugins are', acceptedBackendPlugins);

        acceptedPlugins.forEach(plugin => {
            this.logger.debug("will deploy plugin", plugin.id(), 'with changes', JSON.stringify(plugin.getChanges()), 'and this plugin has been resolved by', plugin.resolvedBy());
        });

        // local path to launch
        const pluginPaths = acceptedBackendPlugins.map(pluginEntry => pluginEntry.path());
        this.logger.debug('local path to deploy on remote instance', pluginPaths);

        // start the backend plugins
        this.hostedPluginServer.deployBackendPlugins(acceptedBackendPlugins);
        this.hostedPluginServer.deployFrontendPlugins(acceptedFrontendPlugins);
        return Promise.resolve();

    }

    /**
     * If there are some single files, try to see if we can work on these files (like unpacking it, etc)
     */
    public async applyFileHandlers(): Promise<any> {
        const waitPromises: Array<Promise<any>> = [];

        this.pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isResolved()).map((pluginDeployerEntry) => {
            this.pluginDeployerFileHandlers.map((pluginFileHandler) => {
                const proxyPluginDeployerEntry = new ProxyPluginDeployerEntry(pluginFileHandler, (pluginDeployerEntry) as PluginDeployerEntryImpl);
                if (pluginFileHandler.accept(proxyPluginDeployerEntry)) {
                    const pluginDeployerFileHandlerContext: PluginDeployerFileHandlerContext = new PluginDeployerFileHandlerContextImpl(proxyPluginDeployerEntry);
                    const promise: Promise<void> = pluginFileHandler.handle(pluginDeployerFileHandlerContext);
                    waitPromises.push(promise);
                }
            });

        });
        return Promise.all(waitPromises);
    }

    /**
     * Check for all registered directories to see if there are some plugins that can be accepted to be deployed.
     */
    public async applyDirectoryFileHandlers(): Promise<any> {
        const waitPromises: Array<Promise<any>> = [];

        this.pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isResolved()).map((pluginDeployerEntry) => {
            this.pluginDeployerDirectoryHandlers.map((pluginDirectoryHandler) => {
                const proxyPluginDeployerEntry = new ProxyPluginDeployerEntry(pluginDirectoryHandler, (pluginDeployerEntry) as PluginDeployerEntryImpl);
                if (pluginDirectoryHandler.accept(proxyPluginDeployerEntry)) {
                    const pluginDeployerDirectoryHandlerContext: PluginDeployerDirectoryHandlerContext = new PluginDeployerDirectoryHandlerContextImpl(proxyPluginDeployerEntry);
                    const promise: Promise<void> = pluginDirectoryHandler.handle(pluginDeployerDirectoryHandlerContext);
                    waitPromises.push(promise);
                }
            });

        });
        return await Promise.all(waitPromises);
    }

    /**
     * Check a given set of plugin IDs to see if there are some resolvers that can handle them. If there is a matching resolver, then we resolve the plugin
     */
    public async resolvePlugins(pluginIdList: string[]): Promise<PluginDeployerEntry[]> {
        const pluginDeployerEntries: PluginDeployerEntry[] = [];

        // check if accepted ?
        const promises = pluginIdList.map(async (pluginId) => {

            const foundPluginResolver = this.pluginResolvers.find(pluginResolver => {
                return pluginResolver.accept(pluginId);
            });
            // there is a resolver for the input
            if (foundPluginResolver) {

                // create context object
                const context = new PluginDeployerResolverContextImpl(foundPluginResolver, pluginId);

                await foundPluginResolver.resolve(context);

                context.getPlugins().forEach(entry => pluginDeployerEntries.push(entry));
            } else {
                // log it for now
                this.logger.error("No plugin resolver found for the entry", pluginId);
                pluginDeployerEntries.push(new PluginDeployerEntryImpl(pluginId, pluginId));
            }
            // you can do other stuff with the `item` here
        });
        await Promise.all(promises);

        return pluginDeployerEntries;
    }
}
