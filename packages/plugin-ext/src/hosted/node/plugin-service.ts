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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { injectable, inject, named, postConstruct } from '@theia/core/shared/inversify';
import { HostedPluginServer, PluginDeployer, GetDeployedPluginsParams, DeployedPlugin } from '../../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { ILogger, Disposable, ContributionProvider, Event, Emitter } from '@theia/core';
import { ExtPluginApiProvider, ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { HostedPluginDeployerHandler } from './hosted-plugin-deployer-handler';
import { PluginDeployerImpl } from '../../main/node/plugin-deployer-impl';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { LogPart } from '../../common/types';

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {

    protected onDidDeployEmitter = new Emitter<void>();
    protected onLogEmitter = new Emitter<LogPart>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected onMessageEmitter = new Emitter<{ pluginHostId: string; message: any }>();

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

    protected deployedListener: Disposable;

    constructor(
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport
    ) {
        this.hostedPlugin.setClient({
            postMessage: (pluginHostId, message) => this.onMessageEmitter.fire({ pluginHostId, message }),
            log: logPart => this.onLogEmitter.fire(logPart),
            notifyDidDeploy: () => this.onDidDeployEmitter.fire()
        });
    }

    get onDidDeploy(): Event<void> {
        return this.onDidDeployEmitter.event;
    }

    get onLog(): Event<LogPart> {
        return this.onLogEmitter.event;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get onMessage(): Event<{ pluginHostId: string; message: any }> {
        return this.onMessageEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        this.deployedListener = this.pluginDeployer.onDidDeploy(() => {
            this.onDidDeployEmitter.fire();
        });
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
        this.deployedListener.dispose();
    }

    async getDeployedPluginIds(): Promise<string[]> {
        const backendMetadata = await this.deployerHandler.getDeployedBackendPluginIds();
        if (backendMetadata.length > 0) {
            this.hostedPlugin.runPluginServer();
        }
        const plugins = new Set<string>();
        for (const pluginId of await this.deployerHandler.getDeployedFrontendPluginIds()) {
            plugins.add(pluginId);
        }
        for (const pluginId of backendMetadata) {
            plugins.add(pluginId);
        }
        for (const pluginId of await this.hostedPlugin.getExtraDeployedPluginIds()) {
            plugins.add(pluginId);
        }
        return [...plugins.values()];
    }

    async getDeployedPlugins({ pluginIds }: GetDeployedPluginsParams): Promise<DeployedPlugin[]> {
        if (!pluginIds.length) {
            return [];
        }
        const plugins: DeployedPlugin[] = [];
        let extraDeployedPlugins: Map<string, DeployedPlugin> | undefined;
        for (const pluginId of pluginIds) {
            let plugin = this.deployerHandler.getDeployedPlugin(pluginId);
            if (!plugin) {
                if (!extraDeployedPlugins) {
                    extraDeployedPlugins = new Map<string, DeployedPlugin>();
                    for (const extraDeployedPlugin of await this.hostedPlugin.getExtraDeployedPlugins()) {
                        extraDeployedPlugins.set(extraDeployedPlugin.metadata.model.id, extraDeployedPlugin);
                    }
                }
                plugin = extraDeployedPlugins.get(pluginId);
            }
            if (plugin) {
                plugins.push(plugin);
            }
        }
        return Promise.all(plugins.map(plugin => this.localizationService.localizePlugin(plugin)));
    }

    async handleMessage(pluginHostId: string, message: string): Promise<void> {
        this.hostedPlugin.handleMessage(pluginHostId, message);
    }

    async getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return this.extPluginAPIContributions.getContributions().map(p => p.provideApi());
    }
}
