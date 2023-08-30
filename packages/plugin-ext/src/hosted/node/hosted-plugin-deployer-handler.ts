// *****************************************************************************
// Copyright (C) 2019 RedHat and others.
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

import * as fs from '@theia/core/shared/fs-extra';
import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import {
    PluginDeployerHandler, PluginDeployerEntry, PluginEntryPoint, DeployedPlugin,
    PluginDependencies, PluginType, PluginIdentifiers
} from '../../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { Stopwatch } from '@theia/core/lib/common';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager';

@injectable()
export class HostedPluginDeployerHandler implements PluginDeployerHandler {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginReader)
    private readonly reader: HostedPluginReader;

    @inject(HostedPluginLocalizationService)
    private readonly localizationService: HostedPluginLocalizationService;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    @inject(PluginUninstallationManager)
    protected readonly uninstallationManager: PluginUninstallationManager;

    private readonly deployedLocations = new Map<PluginIdentifiers.VersionedId, Set<string>>();
    protected readonly sourceLocations = new Map<PluginIdentifiers.VersionedId, Set<string>>();

    /**
     * Managed plugin metadata backend entries.
     */
    private readonly deployedBackendPlugins = new Map<PluginIdentifiers.VersionedId, DeployedPlugin>();

    /**
     * Managed plugin metadata frontend entries.
     */
    private readonly deployedFrontendPlugins = new Map<PluginIdentifiers.VersionedId, DeployedPlugin>();

    private backendPluginsMetadataDeferred = new Deferred<void>();

    private frontendPluginsMetadataDeferred = new Deferred<void>();

    async getDeployedFrontendPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        // await first deploy
        await this.frontendPluginsMetadataDeferred.promise;
        // fetch the last deployed state
        return Array.from(this.deployedFrontendPlugins.keys());
    }

    async getDeployedBackendPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        // await first deploy
        await this.backendPluginsMetadataDeferred.promise;
        // fetch the last deployed state
        return Array.from(this.deployedBackendPlugins.keys());
    }

    getDeployedPluginsById(pluginId: string): DeployedPlugin[] {
        const matches: DeployedPlugin[] = [];
        const handle = (plugins: Iterable<DeployedPlugin>): void => {
            for (const plugin of plugins) {
                if (PluginIdentifiers.componentsToVersionWithId(plugin.metadata.model).id === pluginId) {
                    matches.push(plugin);
                }
            }
        };
        handle(this.deployedFrontendPlugins.values());
        handle(this.deployedBackendPlugins.values());
        return matches;
    }

    getDeployedPlugin(pluginId: PluginIdentifiers.VersionedId): DeployedPlugin | undefined {
        return this.deployedBackendPlugins.get(pluginId) ?? this.deployedFrontendPlugins.get(pluginId);
    }

    /**
     * @throws never! in order to isolate plugin deployment
     */
    async getPluginDependencies(entry: PluginDeployerEntry): Promise<PluginDependencies | undefined> {
        const pluginPath = entry.path();
        try {
            const manifest = await this.reader.readPackage(pluginPath);
            if (!manifest) {
                return undefined;
            }
            const metadata = this.reader.readMetadata(manifest);
            const dependencies: PluginDependencies = { metadata };
            // Do not resolve system (aka builtin) plugins because it should be done statically at build time.
            if (entry.type !== PluginType.System) {
                dependencies.mapping = this.reader.readDependencies(manifest);
            }
            return dependencies;
        } catch (e) {
            console.error(`Failed to load plugin dependencies from '${pluginPath}' path`, e);
            return undefined;
        }
    }

    async deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<number> {
        let successes = 0;
        for (const plugin of frontendPlugins) {
            if (await this.deployPlugin(plugin, 'frontend')) { successes++; }
        }
        // resolve on first deploy
        this.frontendPluginsMetadataDeferred.resolve(undefined);
        return successes;
    }

    async deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<number> {
        let successes = 0;
        for (const plugin of backendPlugins) {
            if (await this.deployPlugin(plugin, 'backend')) { successes++; }
        }
        // rebuild translation config after deployment
        await this.localizationService.buildTranslationConfig([...this.deployedBackendPlugins.values()]);
        // resolve on first deploy
        this.backendPluginsMetadataDeferred.resolve(undefined);
        return successes;
    }

    /**
     * @throws never! in order to isolate plugin deployment.
     * @returns whether the plugin is deployed after running this function. If the plugin was already installed, will still return `true`.
     */
    protected async deployPlugin(entry: PluginDeployerEntry, entryPoint: keyof PluginEntryPoint): Promise<boolean> {
        const pluginPath = entry.path();
        const deployPlugin = this.stopwatch.start('deployPlugin');
        let id;
        let success = true;
        try {
            const manifest = await this.reader.readPackage(pluginPath);
            if (!manifest) {
                deployPlugin.error(`Failed to read ${entryPoint} plugin manifest from '${pluginPath}''`);
                return success = false;
            }

            const metadata = this.reader.readMetadata(manifest);
            metadata.isUnderDevelopment = entry.getValue('isUnderDevelopment') ?? false;

            id = PluginIdentifiers.componentsToVersionedId(metadata.model);

            const deployedLocations = this.deployedLocations.get(id) ?? new Set<string>();
            deployedLocations.add(entry.rootPath);
            this.deployedLocations.set(id, deployedLocations);
            this.setSourceLocationsForPlugin(id, entry);

            const deployedPlugins = entryPoint === 'backend' ? this.deployedBackendPlugins : this.deployedFrontendPlugins;
            if (deployedPlugins.has(id)) {
                deployPlugin.debug(`Skipped ${entryPoint} plugin ${metadata.model.name} already deployed`);
                return true;
            }

            const { type } = entry;
            const deployed: DeployedPlugin = { metadata, type };
            deployed.contributes = await this.reader.readContribution(manifest);
            await this.localizationService.deployLocalizations(deployed);
            deployedPlugins.set(id, deployed);
            deployPlugin.debug(`Deployed ${entryPoint} plugin "${id}" from "${metadata.model.entryPoint[entryPoint] || pluginPath}"`);
        } catch (e) {
            deployPlugin.error(`Failed to deploy ${entryPoint} plugin from '${pluginPath}' path`, e);
            return success = false;
        } finally {
            if (success && id) {
                this.markAsInstalled(id);
            }
        }
        return success;
    }

    async uninstallPlugin(pluginId: PluginIdentifiers.VersionedId): Promise<boolean> {
        try {
            const sourceLocations = this.sourceLocations.get(pluginId);
            if (!sourceLocations) {
                return false;
            }
            await Promise.all(Array.from(sourceLocations,
                location => fs.remove(location).catch(err => console.error(`Failed to remove source for ${pluginId} at ${location}`, err))));
            this.sourceLocations.delete(pluginId);
            this.localizationService.undeployLocalizations(pluginId);
            this.uninstallationManager.markAsUninstalled(pluginId);
            return true;
        } catch (e) {
            console.error('Error uninstalling plugin', e);
            return false;
        }
    }

    protected markAsInstalled(id: PluginIdentifiers.VersionedId): void {
        const metadata = PluginIdentifiers.idAndVersionFromVersionedId(id);
        if (metadata) {
            const toMarkAsUninstalled: PluginIdentifiers.VersionedId[] = [];
            const checkForDifferentVersions = (others: Iterable<PluginIdentifiers.VersionedId>) => {
                for (const other of others) {
                    const otherMetadata = PluginIdentifiers.idAndVersionFromVersionedId(other);
                    if (metadata.id === otherMetadata?.id && metadata.version !== otherMetadata.version) {
                        toMarkAsUninstalled.push(other);
                    }
                }
            };
            checkForDifferentVersions(this.deployedFrontendPlugins.keys());
            checkForDifferentVersions(this.deployedBackendPlugins.keys());
            this.uninstallationManager.markAsUninstalled(...toMarkAsUninstalled);
            this.uninstallationManager.markAsInstalled(id);
            toMarkAsUninstalled.forEach(pluginToUninstall => this.uninstallPlugin(pluginToUninstall));
        }
    }

    async undeployPlugin(pluginId: PluginIdentifiers.VersionedId): Promise<boolean> {
        this.deployedBackendPlugins.delete(pluginId);
        this.deployedFrontendPlugins.delete(pluginId);
        const deployedLocations = this.deployedLocations.get(pluginId);
        if (!deployedLocations) {
            return false;
        }

        const undeployPlugin = this.stopwatch.start('undeployPlugin');
        this.deployedLocations.delete(pluginId);

        for (const location of deployedLocations) {
            try {
                await fs.remove(location);
                undeployPlugin.log(`[${pluginId}]: undeployed from "${location}"`);
            } catch (e) {
                undeployPlugin.error(`[${pluginId}]: failed to undeploy from location "${location}". reason:`, e);
            }
        }

        return true;
    }

    protected setSourceLocationsForPlugin(id: PluginIdentifiers.VersionedId, entry: PluginDeployerEntry): void {
        const knownLocations = this.sourceLocations.get(id) ?? new Set();
        const maybeStoredLocations = entry.getValue('sourceLocations');
        const storedLocations = Array.isArray(maybeStoredLocations) && maybeStoredLocations.every(location => typeof location === 'string')
            ? maybeStoredLocations.concat(entry.originalPath())
            : [entry.originalPath()];
        storedLocations.forEach(location => knownLocations.add(location));
        this.sourceLocations.set(id, knownLocations);
    }
}
