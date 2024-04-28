// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable, optional, multiInject, inject, named } from '@theia/core/shared/inversify';
import * as semver from 'semver';
import {
    PluginDeployerResolver, PluginDeployerFileHandler, PluginDeployerDirectoryHandler,
    PluginDeployerEntry, PluginDeployer, PluginDeployerParticipant, PluginDeployerStartContext,
    PluginDeployerResolverInit,
    PluginDeployerEntryType, PluginDeployerHandler, PluginType, UnresolvedPluginEntry, PluginIdentifiers, PluginDeployOptions
} from '../../common/plugin-protocol';
import { PluginDeployerEntryImpl } from './plugin-deployer-entry-impl';
import {
    PluginDeployerResolverContextImpl,
    PluginDeployerResolverInitImpl
} from './plugin-deployer-resolver-context-impl';
import { ProxyPluginDeployerEntry } from './plugin-deployer-proxy-entry-impl';
import { PluginDeployerFileHandlerContextImpl } from './plugin-deployer-file-handler-context-impl';
import { PluginDeployerDirectoryHandlerContextImpl } from './plugin-deployer-directory-handler-context-impl';
import { ILogger, Emitter, ContributionProvider } from '@theia/core';
import { PluginCliContribution } from './plugin-cli-contribution';
import { Measurement, Stopwatch } from '@theia/core/lib/common';

@injectable()
export class PluginDeployerImpl implements PluginDeployer {

    protected readonly onDidDeployEmitter = new Emitter<void>();
    readonly onDidDeploy = this.onDidDeployEmitter.event;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PluginDeployerHandler)
    protected readonly pluginDeployerHandler: PluginDeployerHandler;

    @inject(PluginCliContribution)
    protected readonly cliContribution: PluginCliContribution;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

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

    @inject(ContributionProvider) @named(PluginDeployerParticipant)
    protected readonly participants: ContributionProvider<PluginDeployerParticipant>;

    public start(): Promise<void> {
        this.logger.debug('Starting the deployer with the list of resolvers', this.pluginResolvers);
        return this.doStart();
    }

    public async initResolvers(): Promise<Array<void>> {

        // call init on each resolver
        const pluginDeployerResolverInit: PluginDeployerResolverInit = new PluginDeployerResolverInitImpl();
        const promises = this.pluginResolvers.map(async pluginResolver => {
            if (pluginResolver.init) {
                pluginResolver.init(pluginDeployerResolverInit);
            }
        });
        return Promise.all(promises);
    }

    protected async doStart(): Promise<void> {

        // init resolvers
        await this.initResolvers();

        // check THEIA_DEFAULT_PLUGINS or THEIA_PLUGINS env var
        const defaultPluginsValue = process.env.THEIA_DEFAULT_PLUGINS || undefined;
        const pluginsValue = process.env.THEIA_PLUGINS || undefined;
        // check the `--plugins` CLI option
        const defaultPluginsValueViaCli = this.cliContribution.localDir();

        this.logger.debug('Found the list of default plugins ID on env:', defaultPluginsValue);
        this.logger.debug('Found the list of plugins ID on env:', pluginsValue);
        this.logger.debug('Found the list of default plugins ID from CLI:', defaultPluginsValueViaCli);

        // transform it to array
        const defaultPluginIdList = defaultPluginsValue ? defaultPluginsValue.split(',') : [];
        const pluginIdList = pluginsValue ? pluginsValue.split(',') : [];
        const systemEntries = defaultPluginIdList.concat(pluginIdList).concat(defaultPluginsValueViaCli ? defaultPluginsValueViaCli.split(',') : []);

        const userEntries: string[] = [];
        const context: PluginDeployerStartContext = { userEntries, systemEntries };

        for (const contribution of this.participants.getContributions()) {
            if (contribution.onWillStart) {
                await contribution.onWillStart(context);
            }
        }

        const deployPlugins = this.measure('deployPlugins');
        const unresolvedUserEntries = context.userEntries.map(id => ({
            id,
            type: PluginType.User
        }));
        const unresolvedSystemEntries = context.systemEntries.map(id => ({
            id,
            type: PluginType.System
        }));
        const resolvePlugins = this.measure('resolvePlugins');
        const plugins = await this.resolvePlugins([...unresolvedUserEntries, ...unresolvedSystemEntries]);
        resolvePlugins.log('Resolve plugins list');
        await this.deployPlugins(plugins);
        deployPlugins.log('Deploy plugins list');
    }

    async uninstall(pluginId: PluginIdentifiers.VersionedId): Promise<void> {
        await this.pluginDeployerHandler.uninstallPlugin(pluginId);
    }

    async undeploy(pluginId: PluginIdentifiers.VersionedId): Promise<void> {
        if (await this.pluginDeployerHandler.undeployPlugin(pluginId)) {
            this.onDidDeployEmitter.fire();
        }
    }

    async deploy(plugin: UnresolvedPluginEntry, options?: PluginDeployOptions): Promise<number> {
        const deploy = this.measure('deploy');
        const numDeployedPlugins = await this.deployMultipleEntries([plugin], options);
        deploy.log(`Deploy plugin ${plugin.id}`);
        return numDeployedPlugins;
    }

    protected async deployMultipleEntries(plugins: UnresolvedPluginEntry[], options?: PluginDeployOptions): Promise<number> {
        const pluginsToDeploy = await this.resolvePlugins(plugins, options);
        return this.deployPlugins(pluginsToDeploy);
    }

    /**
     * Resolves plugins for the given type.
     *
     * Only call it a single time before triggering a single deploy to prevent re-resolving of extension dependencies, i.e.
     * ```ts
     * const deployer: PluginDeployer;
     * deployer.deployPlugins(await deployer.resolvePlugins(allPluginEntries));
     * ```
     */
    async resolvePlugins(plugins: UnresolvedPluginEntry[], options?: PluginDeployOptions): Promise<PluginDeployerEntry[]> {
        const visited = new Set<string>();
        const hasBeenVisited = (id: string) => visited.has(id) || (visited.add(id), false);
        const pluginsToDeploy = new Map<PluginIdentifiers.VersionedId, PluginDeployerEntry>();
        const unversionedIdsHandled = new Map<PluginIdentifiers.UnversionedId, string[]>();

        const queue: UnresolvedPluginEntry[] = [...plugins];
        while (queue.length) {
            const pendingDependencies: Array<{
                dependencies: Map<string, string>
                type: PluginType
            }> = [];
            await Promise.all(queue.map(async entry => {
                if (hasBeenVisited(entry.id)) {
                    return;
                }
                const type = entry.type ?? PluginType.System;
                try {
                    const pluginDeployerEntries = await this.resolveAndHandle(entry.id, type, options);
                    for (const deployerEntry of pluginDeployerEntries) {
                        const pluginData = await this.pluginDeployerHandler.getPluginDependencies(deployerEntry);
                        const versionedId = pluginData && PluginIdentifiers.componentsToVersionedId(pluginData.metadata.model);
                        const unversionedId = versionedId && PluginIdentifiers.componentsToUnversionedId(pluginData.metadata.model);
                        if (unversionedId && !pluginsToDeploy.has(versionedId)) {
                            pluginsToDeploy.set(versionedId, deployerEntry);
                            if (pluginData.mapping) {
                                pendingDependencies.push({ dependencies: pluginData.mapping, type });
                            }
                            const otherVersions = unversionedIdsHandled.get(unversionedId) ?? [];
                            otherVersions.push(pluginData.metadata.model.version);
                            if (otherVersions.length === 1) {
                                unversionedIdsHandled.set(unversionedId, otherVersions);
                            } else {
                                this.findBestVersion(unversionedId, otherVersions, pluginsToDeploy);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to resolve plugins from '${entry.id}'`, e);
                }
            }));
            queue.length = 0;
            for (const { dependencies, type } of pendingDependencies) {
                for (const [dependency, deployableDependency] of dependencies) {
                    if (!unversionedIdsHandled.has(dependency as PluginIdentifiers.UnversionedId)) {
                        queue.push({
                            id: deployableDependency,
                            type
                        });
                    }
                }
            }
        }
        return [...pluginsToDeploy.values()];
    }

    protected async resolveAndHandle(id: string, type: PluginType, options?: PluginDeployOptions): Promise<PluginDeployerEntry[]> {
        let entries = await this.resolvePlugin(id, type, options);
        if (type === PluginType.User) {
            await this.applyFileHandlers(entries);
        } else {
            const filteredEntries: PluginDeployerEntry[] = [];
            for (const entry of entries) {
                if (await entry.isFile()) {
                    this.logger.warn(`Only user plugins will be handled by file handlers, please unpack the plugin '${entry.id()}' manually.`);
                } else {
                    filteredEntries.push(entry);
                }
            }
            entries = filteredEntries;
        }
        await this.applyDirectoryFileHandlers(entries);
        return entries;
    }

    protected findBestVersion(unversionedId: PluginIdentifiers.UnversionedId, versions: string[], knownPlugins: Map<PluginIdentifiers.VersionedId, PluginDeployerEntry>): void {
        // If left better, return negative. Then best is index 0.
        versions.map(version => ({ version, plugin: knownPlugins.get(PluginIdentifiers.idAndVersionToVersionedId({ version, id: unversionedId })) }))
            .sort((left, right) => {
                const leftPlugin = left.plugin;
                const rightPlugin = right.plugin;
                if (!leftPlugin && !rightPlugin) {
                    return 0;
                }
                if (!rightPlugin) {
                    return -1;
                }
                if (!leftPlugin) {
                    return 1;
                }
                if (leftPlugin.type === PluginType.System && rightPlugin.type === PluginType.User) {
                    return -1;
                }
                if (leftPlugin.type === PluginType.User && rightPlugin.type === PluginType.System) {
                    return 1;
                }
                if (semver.gtr(left.version, right.version)) {
                    return -1;
                }
                return 1;
            }).forEach((versionedEntry, index) => {
                if (index !== 0) {
                    // Mark as not accepted to prevent deployment of all but the winner.
                    versionedEntry.plugin?.accept();
                }
            });
    }

    /**
     * deploy all plugins that have been accepted
     */
    async deployPlugins(pluginsToDeploy: PluginDeployerEntry[]): Promise<number> {
        const acceptedPlugins = pluginsToDeploy.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted());
        const acceptedFrontendPlugins = pluginsToDeploy.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted(PluginDeployerEntryType.FRONTEND));
        const acceptedBackendPlugins = pluginsToDeploy.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted(PluginDeployerEntryType.BACKEND));
        const acceptedHeadlessPlugins = pluginsToDeploy.filter(pluginDeployerEntry => pluginDeployerEntry.isAccepted(PluginDeployerEntryType.HEADLESS));

        this.logger.debug('the accepted plugins are', acceptedPlugins);
        this.logger.debug('the acceptedFrontendPlugins plugins are', acceptedFrontendPlugins);
        this.logger.debug('the acceptedBackendPlugins plugins are', acceptedBackendPlugins);
        this.logger.debug('the acceptedHeadlessPlugins plugins are', acceptedHeadlessPlugins);

        acceptedPlugins.forEach(plugin => {
            this.logger.debug('will deploy plugin', plugin.id(), 'with changes', JSON.stringify(plugin.getChanges()), 'and this plugin has been resolved by', plugin.resolvedBy());
        });

        // local path to launch
        const pluginPaths = [...acceptedBackendPlugins, ...acceptedHeadlessPlugins].map(pluginEntry => pluginEntry.path());
        this.logger.debug('local path to deploy on remote instance', pluginPaths);

        const deployments = [];
        // start the backend plugins
        deployments.push(await this.pluginDeployerHandler.deployBackendPlugins(acceptedBackendPlugins));
        // headless plugins are deployed like backend plugins
        deployments.push(await this.pluginDeployerHandler.deployBackendPlugins(acceptedHeadlessPlugins));
        deployments.push(await this.pluginDeployerHandler.deployFrontendPlugins(acceptedFrontendPlugins));
        this.onDidDeployEmitter.fire(undefined);
        return deployments.reduce<number>((accumulated, current) => accumulated += current ?? 0, 0);
    }

    /**
     * If there are some single files, try to see if we can work on these files (like unpacking it, etc)
     */
    public async applyFileHandlers(pluginDeployerEntries: PluginDeployerEntry[]): Promise<void> {
        const waitPromises = pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isResolved()).flatMap(pluginDeployerEntry =>
            this.pluginDeployerFileHandlers.map(async pluginFileHandler => {
                const proxyPluginDeployerEntry = new ProxyPluginDeployerEntry(pluginFileHandler, (pluginDeployerEntry) as PluginDeployerEntryImpl);
                if (await pluginFileHandler.accept(proxyPluginDeployerEntry)) {
                    const pluginDeployerFileHandlerContext = new PluginDeployerFileHandlerContextImpl(proxyPluginDeployerEntry);
                    await pluginFileHandler.handle(pluginDeployerFileHandlerContext);
                }
            })
        );
        await Promise.all(waitPromises);
    }

    /**
     * Check for all registered directories to see if there are some plugins that can be accepted to be deployed.
     */
    public async applyDirectoryFileHandlers(pluginDeployerEntries: PluginDeployerEntry[]): Promise<void> {
        const waitPromises = pluginDeployerEntries.filter(pluginDeployerEntry => pluginDeployerEntry.isResolved()).flatMap(pluginDeployerEntry =>
            this.pluginDeployerDirectoryHandlers.map(async pluginDirectoryHandler => {
                const proxyPluginDeployerEntry = new ProxyPluginDeployerEntry(pluginDirectoryHandler, (pluginDeployerEntry) as PluginDeployerEntryImpl);
                if (await pluginDirectoryHandler.accept(proxyPluginDeployerEntry)) {
                    const pluginDeployerDirectoryHandlerContext = new PluginDeployerDirectoryHandlerContextImpl(proxyPluginDeployerEntry);
                    await pluginDirectoryHandler.handle(pluginDeployerDirectoryHandlerContext);
                }
            })
        );
        await Promise.all(waitPromises);
    }

    /**
     * Check a plugin ID see if there are some resolvers that can handle it. If there is a matching resolver, then we resolve the plugin
     */
    public async resolvePlugin(pluginId: string, type: PluginType = PluginType.System, options?: PluginDeployOptions): Promise<PluginDeployerEntry[]> {
        const pluginDeployerEntries: PluginDeployerEntry[] = [];
        const foundPluginResolver = this.pluginResolvers.find(pluginResolver => pluginResolver.accept(pluginId));
        // there is a resolver for the input
        if (foundPluginResolver) {

            // create context object
            const context = new PluginDeployerResolverContextImpl(foundPluginResolver, pluginId);

            await foundPluginResolver.resolve(context, options);

            context.getPlugins().forEach(entry => {
                entry.type = type;
                pluginDeployerEntries.push(entry);
            });
        } else {
            // log it for now
            this.logger.error('No plugin resolver found for the entry', pluginId);
            const unresolvedEntry = new PluginDeployerEntryImpl(pluginId, pluginId);
            unresolvedEntry.type = type;
            pluginDeployerEntries.push(unresolvedEntry);
        }

        return pluginDeployerEntries;
    }

    protected measure(name: string): Measurement {
        return this.stopwatch.start(name);
    }
}
