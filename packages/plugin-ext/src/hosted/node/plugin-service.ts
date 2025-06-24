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
import { HostedPluginServer, HostedPluginClient, PluginDeployer, DeployedPlugin, PluginIdentifiers } from '../../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { ILogger, Disposable, ContributionProvider, DisposableCollection } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl';
import { PluginDeployerImpl } from '../../main/node/plugin-deployer-impl';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager';
import { Deferred } from '@theia/core/lib/common/promise-util';

export const BackendPluginHostableFilter = Symbol('BackendPluginHostableFilter');
/**
 * A filter matching backend plugins that are hostable in my plugin host process.
 * Only if at least one backend plugin is deployed that matches my filter will I
 * start the host process.
 */
export type BackendPluginHostableFilter = (plugin: DeployedPlugin) => boolean;

/**
 * This class implements the per-front-end services for plugin management and communication
 */
@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PluginDeployerHandlerImpl)
    protected readonly deployerHandler: PluginDeployerHandlerImpl;

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

    protected uninstalledPlugins: Set<PluginIdentifiers.VersionedId>;
    protected disabledPlugins: Set<PluginIdentifiers.VersionedId>;

    protected readonly pluginVersions = new Map<PluginIdentifiers.UnversionedId, string>();

    protected readonly initialized = new Deferred<void>();

    constructor(
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport) {
    }

    @postConstruct()
    protected init(): void {
        if (!this.backendPluginHostableFilter) {
            this.backendPluginHostableFilter = () => true;
        }

        this.uninstalledPlugins = new Set(this.uninstallationManager.getUninstalledPluginIds());

        const asyncInit = async () => {
            this.disabledPlugins = new Set(await this.uninstallationManager.getDisabledPluginIds());

            this.toDispose.pushAll([
                this.pluginDeployer.onDidDeploy(() => this.client?.onDidDeploy()),
                this.uninstallationManager.onDidChangeUninstalledPlugins(currentUninstalled => {
                    if (this.uninstalledPlugins) {
                        const uninstalled = new Set(currentUninstalled);
                        for (const previouslyUninstalled of this.uninstalledPlugins) {
                            if (!uninstalled.has(previouslyUninstalled)) {
                                this.uninstalledPlugins.delete(previouslyUninstalled);
                            }
                        }
                    }
                    this.client?.onDidDeploy();
                }),
                this.uninstallationManager.onDidChangeDisabledPlugins(currentlyDisabled => {
                    if (this.disabledPlugins) {
                        const disabled = new Set(currentlyDisabled);
                        for (const previouslyUninstalled of this.disabledPlugins) {
                            if (!disabled.has(previouslyUninstalled)) {
                                this.disabledPlugins.delete(previouslyUninstalled);
                            }
                        }
                    }
                    this.client?.onDidDeploy();
                }),
                Disposable.create(() => this.hostedPlugin.clientClosed()),
            ]);
            this.initialized.resolve();
        };
        asyncInit();
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
        await this.initialized.promise;
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
        if (this.uninstalledPlugins.has(identifier)) {
            return false;
        }

        if (this.disabledPlugins.has(identifier)) {
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

    getDisabledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return Promise.resolve(this.uninstallationManager.getDisabledPluginIds());
    }

    async getDeployedPlugins(pluginIds: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]> {
        if (!pluginIds.length) {
            return [];
        }
        const plugins: DeployedPlugin[] = [];
        for (const versionedId of pluginIds) {
            const plugin = this.deployerHandler.getDeployedPlugin(versionedId);

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
