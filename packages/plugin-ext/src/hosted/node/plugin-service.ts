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
import { injectable, inject, named, optional, postConstruct } from '@theia/core/shared/inversify';
import { HostedPluginServer, HostedPluginClient, PluginDeployer, GetDeployedPluginsParams, DeployedPlugin, PluginIdentifiers } from '../../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { ILogger, Disposable, ContributionProvider, DisposableCollection } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { HostedPluginDeployerHandler } from './hosted-plugin-deployer-handler';
import { PluginDeployerImpl } from '../../main/node/plugin-deployer-impl';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager';

export const BackendPluginHostableFilter = Symbol('BackendPluginHostableFilter');
/**
 * A filter matching backend plugins that are hostable in my plugin host process.
 * Only if at least one backend plugin is deployed that matches my filter will I
 * start the host process.
 */
export type BackendPluginHostableFilter = (plugin: DeployedPlugin) => boolean;

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginDeployerHandler)
    protected readonly deployerHandler: HostedPluginDeployerHandler;

    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    @inject(HostedPluginLocalizationService)
    protected readonly localizationService: HostedPluginLocalizationService;

    @inject(ContributionProvider)
    @named(Symbol.for(ExtPluginApiProvider))
    protected readonly extPluginAPIContributions: ContributionProvider<ExtPluginApiProvider>;

    @inject(PluginUninstallationManager) protected readonly uninstallationManager: PluginUninstallationManager;

    @inject(BackendPluginHostableFilter)
    @optional()
    protected backendPluginHostableFilter: BackendPluginHostableFilter;

    protected client: HostedPluginClient | undefined;
    protected toDispose = new DisposableCollection();

    protected _ignoredPlugins?: Set<PluginIdentifiers.VersionedId>;

    // We ignore any plugins that are marked as uninstalled the first time the frontend requests information about deployed plugins.
    protected get ignoredPlugins(): Set<PluginIdentifiers.VersionedId> {
        if (!this._ignoredPlugins) {
            this._ignoredPlugins = new Set(this.uninstallationManager.getUninstalledPluginIds());
        }
        return this._ignoredPlugins;
    }

    protected readonly pluginVersions = new Map<PluginIdentifiers.UnversionedId, string>();

    constructor(
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport) {
    }

    @postConstruct()
    protected init(): void {
        if (!this.backendPluginHostableFilter) {
            this.backendPluginHostableFilter = () => true;
        }

        this.toDispose.pushAll([
            this.pluginDeployer.onDidDeploy(() => this.client?.onDidDeploy()),
            this.uninstallationManager.onDidChangeUninstalledPlugins(currentUninstalled => {
                if (this._ignoredPlugins) {
                    const uninstalled = new Set(currentUninstalled);
                    for (const previouslyUninstalled of this._ignoredPlugins) {
                        if (!uninstalled.has(previouslyUninstalled)) {
                            this._ignoredPlugins.delete(previouslyUninstalled);
                        }
                    }
                }
                this.client?.onDidDeploy();
            }),
            Disposable.create(() => this.hostedPlugin.clientClosed()),
        ]);
    }

    protected getServerName(): string {
        return 'hosted-plugin';
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setClient(client: HostedPluginClient): void {
        this.client = client;
        this.hostedPlugin.setClient(client);
    }

    async getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        const backendPlugins = (await this.deployerHandler.getDeployedBackendPlugins())
            .filter(this.backendPluginHostableFilter);
        if (backendPlugins.length > 0) {
            this.hostedPlugin.runPluginServer(this.getServerName());
        }
        const plugins = new Set<PluginIdentifiers.VersionedId>();
        const addIds = async (identifiers: PluginIdentifiers.VersionedId[]): Promise<void> => {
            for (const pluginId of identifiers) {
                if (this.isRelevantPlugin(pluginId)) {
                    plugins.add(pluginId);
                }
            }
        };
        addIds(await this.deployerHandler.getDeployedFrontendPluginIds());
        addIds(await this.deployerHandler.getDeployedBackendPluginIds());
        addIds(await this.hostedPlugin.getExtraDeployedPluginIds());
        return Array.from(plugins);
    }

    /**
     * Ensures that the plugin was not uninstalled when this session was started
     * and that it matches the first version of the given plugin seen by this session.
     *
     * The deployment system may have multiple versions of the same plugin available, but
     * a single session should only ever activate one of them.
     */
    protected isRelevantPlugin(identifier: PluginIdentifiers.VersionedId): boolean {
        const versionAndId = PluginIdentifiers.idAndVersionFromVersionedId(identifier);
        if (!versionAndId) {
            return false;
        }
        const knownVersion = this.pluginVersions.get(versionAndId.id);
        if (knownVersion !== undefined && knownVersion !== versionAndId.version) {
            return false;
        }
        if (this.ignoredPlugins.has(identifier)) {
            return false;
        }
        if (knownVersion === undefined) {
            this.pluginVersions.set(versionAndId.id, versionAndId.version);
        }
        return true;
    }

    getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return Promise.resolve(this.uninstallationManager.getUninstalledPluginIds());
    }

    async getDeployedPlugins({ pluginIds }: GetDeployedPluginsParams): Promise<DeployedPlugin[]> {
        if (!pluginIds.length) {
            return [];
        }
        const plugins: DeployedPlugin[] = [];
        let extraDeployedPlugins: Map<string, DeployedPlugin> | undefined;
        for (const versionedId of pluginIds) {
            if (!this.isRelevantPlugin(versionedId)) {
                continue;
            }
            let plugin = this.deployerHandler.getDeployedPlugin(versionedId);
            if (!plugin) {
                if (!extraDeployedPlugins) {
                    extraDeployedPlugins = new Map<string, DeployedPlugin>();
                    for (const extraDeployedPlugin of await this.hostedPlugin.getExtraDeployedPlugins()) {
                        extraDeployedPlugins.set(PluginIdentifiers.componentsToVersionedId(extraDeployedPlugin.metadata.model), extraDeployedPlugin);
                    }
                }
                plugin = extraDeployedPlugins.get(versionedId);
            }
            if (plugin) {
                plugins.push(plugin);
            }
        }
        return Promise.all(plugins.map(plugin => this.localizationService.localizePlugin(plugin)));
    }

    onMessage(pluginHostId: string, message: Uint8Array): Promise<void> {
        this.hostedPlugin.onMessage(pluginHostId, message);
        return Promise.resolve();
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve(this.extPluginAPIContributions.getContributions().map(p => p.provideApi()));
    }
}
