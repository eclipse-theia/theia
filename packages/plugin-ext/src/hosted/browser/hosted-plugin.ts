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

// tslint:disable:no-any

import { injectable, inject, interfaces, named } from 'inversify';
import { PluginWorker } from '../../main/browser/plugin-worker';
import { HostedPluginServer, PluginMetadata, getPluginId } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, ConfigStorage, PluginManagerExt } from '../../api/plugin-api';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../api/rpc-protocol';
import { ILogger, ContributionProvider } from '@theia/core';
import { PreferenceServiceImpl, PreferenceProviderProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PluginContributionHandler } from '../../main/browser/plugin-contribution-handler';
import { getQueryParameters } from '../../main/browser/env-main';
import { ExtPluginApi, MainPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { StoragePathService } from '../../main/browser/storage-path-service';
import { getPreferences } from '../../main/browser/preference-registry-main';
import { PluginServer } from '../../common/plugin-protocol';
import { KeysToKeysToAnyValue } from '../../common/types';
import { FileStat } from '@theia/filesystem/lib/common/filesystem';

@injectable()
export class HostedPluginSupport {
    container: interfaces.Container;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    private readonly server: HostedPluginServer;

    @inject(HostedPluginWatcher)
    private readonly watcher: HostedPluginWatcher;

    @inject(PluginContributionHandler)
    private readonly contributionHandler: PluginContributionHandler;

    @inject(ContributionProvider)
    @named(MainPluginApiProvider)
    protected readonly mainPluginApiProviders: ContributionProvider<MainPluginApiProvider>;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(PreferenceProviderProvider)
    protected readonly preferenceProviderProvider: PreferenceProviderProvider;

    private theiaReadyPromise: Promise<any>;
    private frontendExtManagerProxy: PluginManagerExt;
    private backendExtManagerProxy: PluginManagerExt;

    // loaded plugins per #id
    private loadedPlugins: Set<string> = new Set<string>();

    // per #hostKey
    private rpc: Map<string, RPCProtocol> = new Map<string, RPCProtocol>();

    constructor(
        @inject(PreferenceServiceImpl) private readonly preferenceServiceImpl: PreferenceServiceImpl,
        @inject(PluginPathsService) private readonly pluginPathsService: PluginPathsService,
        @inject(StoragePathService) private readonly storagePathService: StoragePathService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    ) {
        this.theiaReadyPromise = Promise.all([this.preferenceServiceImpl.ready, this.workspaceService.roots]);
        this.storagePathService.onStoragePathChanged(path => {
            this.updateStoragePath(path);
        });
    }

    checkAndLoadPlugin(container: interfaces.Container): void {
        this.container = container;
        this.initPlugins();
    }

    public initPlugins(): void {
        Promise.all([
            this.server.getDeployedMetadata(),
            this.pluginPathsService.provideHostLogPath(),
            this.storagePathService.provideHostStoragePath(),
            this.server.getExtPluginAPI(),
            this.pluginServer.keyValueStorageGetAll(true),
            this.pluginServer.keyValueStorageGetAll(false),
            this.workspaceService.roots,
        ]).then(metadata => {
            const pluginsInitData: PluginsInitializationData = {
                plugins: metadata['0'],
                logPath: metadata['1'],
                storagePath: metadata['2'],
                pluginAPIs: metadata['3'],
                globalStates: metadata['4'],
                workspaceStates: metadata['5'],
                roots: metadata['6']
            };
            this.loadPlugins(pluginsInitData, this.container);
        }).catch(e => console.error(e));
    }

    loadPlugins(initData: PluginsInitializationData, container: interfaces.Container): void {
        // don't load plugins twice
        initData.plugins = initData.plugins.filter(value => !this.loadedPlugins.has(value.model.id));

        const confStorage: ConfigStorage = {
            hostLogPath: initData.logPath,
            hostStoragePath: initData.storagePath || ''
        };
        const [frontend, backend] = this.initContributions(initData.plugins);
        this.theiaReadyPromise.then(() => {
            if (frontend) {
                const worker = new PluginWorker();
                const hostedExtManager = worker.rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
                hostedExtManager.$init({
                    plugins: initData.plugins,
                    preferences: getPreferences(this.preferenceProviderProvider, initData.roots),
                    globalState: initData.globalStates,
                    workspaceState: initData.workspaceStates,
                    env: { queryParams: getQueryParameters(), language: navigator.language },
                    extApi: initData.pluginAPIs
                }, confStorage);
                setUpPluginApi(worker.rpc, container);
                this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(worker.rpc, container));
                this.frontendExtManagerProxy = hostedExtManager;
            }

            if (backend) {
                // sort plugins per host
                const pluginsPerHost = initData.plugins.reduce((map: any, pluginMetadata) => {
                    const host = pluginMetadata.host;
                    if (!map[host]) {
                        map[host] = [pluginMetadata];
                    } else {
                        map[host].push(pluginMetadata);
                    }
                    return map;
                }, {});

                // create one RPC per host and init.
                Object.keys(pluginsPerHost).forEach(hostKey => {
                    const plugins: PluginMetadata[] = pluginsPerHost[hostKey];
                    let pluginID = hostKey;
                    if (plugins.length >= 1) {
                        pluginID = getPluginId(plugins[0].model);
                    }

                    let rpc = this.rpc.get(hostKey);
                    if (!rpc) {
                        rpc = this.createServerRpc(pluginID, hostKey);
                        setUpPluginApi(rpc, container);
                        this.rpc.set(hostKey, rpc);
                    }

                    const hostedExtManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
                    hostedExtManager.$init({
                        plugins: plugins,
                        preferences: getPreferences(this.preferenceProviderProvider, initData.roots),
                        globalState: initData.globalStates,
                        workspaceState: initData.workspaceStates,
                        env: { queryParams: getQueryParameters(), language: navigator.language },
                        extApi: initData.pluginAPIs
                    }, confStorage);
                    this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(rpc!, container));
                    this.backendExtManagerProxy = hostedExtManager;
                });
            }

            // update list with loaded plugins
            initData.plugins.forEach(value => this.loadedPlugins.add(value.model.id));
        });
    }

    private initContributions(pluginsMetadata: PluginMetadata[]): [boolean, boolean] {
        const result: [boolean, boolean] = [false, false];
        for (const plugin of pluginsMetadata) {
            if (plugin.model.entryPoint.frontend) {
                result[0] = true;
            } else {
                result[1] = true;
            }

            if (plugin.model.contributes) {
                this.contributionHandler.handleContributions(plugin.model.contributes);
            }
        }

        return result;
    }

    private createServerRpc(pluginID: string, hostID: string): RPCProtocol {
        return new RPCProtocolImpl({
            onMessage: this.watcher.onPostMessageEvent,
            send: message => {
                const wrappedMessage: any = {};
                wrappedMessage['pluginID'] = pluginID;
                wrappedMessage['content'] = message;
                this.server.onMessage(JSON.stringify(wrappedMessage));
            }
        }, hostID);
    }

    private updateStoragePath(path: string | undefined): void {
        if (this.frontendExtManagerProxy) {
            this.frontendExtManagerProxy.$updateStoragePath(path);
        }
        if (this.backendExtManagerProxy) {
            this.backendExtManagerProxy.$updateStoragePath(path);
        }
    }

}

interface PluginsInitializationData {
    plugins: PluginMetadata[],
    logPath: string,
    storagePath: string | undefined,
    pluginAPIs: ExtPluginApi[],
    globalStates: KeysToKeysToAnyValue,
    workspaceStates: KeysToKeysToAnyValue,
    roots: FileStat[],
}
