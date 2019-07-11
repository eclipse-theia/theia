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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/da5fb7d5b865aa522abc7e82c10b746834b98639/src/vs/workbench/api/node/extHostExtensionService.ts

// tslint:disable:no-any

import { injectable, inject, interfaces, named, postConstruct } from 'inversify';
import { PluginWorker } from '../../main/browser/plugin-worker';
import { HostedPluginServer, PluginMetadata, getPluginId } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../api/rpc-protocol';
import { ILogger, ContributionProvider, CommandRegistry, WillExecuteCommandEvent, CancellationTokenSource } from '@theia/core';
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
import { PluginManagerExt, MAIN_RPC_CONTEXT } from '../../common';
import { MonacoTextmateService } from '@theia/monaco/lib/browser/textmate';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { WaitUntilEvent } from '@theia/core/lib/common/event';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { isCancelled } from '@theia/core';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';

export type PluginHost = 'frontend' | string;
export type DebugActivationEvent = 'onDebugResolve' | 'onDebugInitialConfigurations' | 'onDebugAdapterProtocolTracker';

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

    @inject(PreferenceServiceImpl)
    private readonly preferenceServiceImpl: PreferenceServiceImpl;

    @inject(PluginPathsService)
    private readonly pluginPathsService: PluginPathsService;

    @inject(StoragePathService)
    private readonly storagePathService: StoragePathService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MonacoTextmateService)
    protected readonly monacoTextmateService: MonacoTextmateService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    private theiaReadyPromise: Promise<any>;

    protected readonly managers: PluginManagerExt[] = [];

    // loaded plugins per #id
    private readonly loadedPlugins = new Set<string>();

    protected readonly activationEvents = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.theiaReadyPromise = Promise.all([this.preferenceServiceImpl.ready, this.workspaceService.roots]);
        this.storagePathService.onStoragePathChanged(path => this.updateStoragePath(path));

        for (const id of this.monacoTextmateService.activatedLanguages) {
            this.activateByLanguage(id);
        }
        this.monacoTextmateService.onDidActivateLanguage(id => this.activateByLanguage(id));
        this.commands.onWillExecuteCommand(event => this.ensureCommandHandlerRegistration(event));
        this.debugSessionManager.onWillStartDebugSession(event => this.ensureDebugActivation(event));
        this.debugSessionManager.onWillResolveDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugResolve', event.debugType));
        this.debugConfigurationManager.onWillProvideDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugInitialConfigurations'));
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

    async loadPlugins(initData: PluginsInitializationData, container: interfaces.Container): Promise<void> {
        // don't load plugins twice
        initData.plugins = initData.plugins.filter(value => !this.loadedPlugins.has(value.model.id));

        // make sure that the previous state, including plugin widgets, is restored
        // and core layout is initialized, i.e. explorer, scm, debug views are already added to the shell
        // but shell is not yet revealed
        await this.appState.reachedState('initialized_layout');
        const hostToPlugins = new Map<PluginHost, PluginMetadata[]>();
        for (const plugin of initData.plugins) {
            const host = plugin.model.entryPoint.frontend ? 'frontend' : plugin.host;
            const plugins = hostToPlugins.get(plugin.host) || [];
            plugins.push(plugin);
            hostToPlugins.set(host, plugins);
            if (plugin.model.contributes) {
                this.contributionHandler.handleContributions(plugin.model.contributes);
            }
        }
        // remove restored plugin widgets which were not registered by contributions
        this.contributionHandler['viewRegistry'].removeStaleWidgets();
        await this.theiaReadyPromise;
        for (const [host, plugins] of hostToPlugins) {
            const pluginId = getPluginId(plugins[0].model);
            const rpc = this.initRpc(host, pluginId, container);
            this.initPluginHostManager(rpc, { ...initData, plugins });
        }

        // update list with loaded plugins
        initData.plugins.forEach(value => this.loadedPlugins.add(value.model.id));
    }

    protected initRpc(host: PluginHost, pluginId: string, container: interfaces.Container): RPCProtocol {
        const rpc = host === 'frontend' ? new PluginWorker().rpc : this.createServerRpc(pluginId, host);
        setUpPluginApi(rpc, container);
        this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(rpc, container));
        return rpc;
    }

    protected async initPluginHostManager(rpc: RPCProtocol, data: PluginsInitializationData): Promise<void> {
        const manager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
        this.managers.push(manager);

        await manager.$init({
            plugins: data.plugins,
            preferences: getPreferences(this.preferenceProviderProvider, data.roots),
            globalState: data.globalStates,
            workspaceState: data.workspaceStates,
            env: { queryParams: getQueryParameters(), language: navigator.language },
            extApi: data.pluginAPIs,
            activationEvents: [...this.activationEvents]
        }, {
                hostLogPath: data.logPath,
                hostStoragePath: data.storagePath || ''
            });

        for (const plugin of data.plugins) {
            this.activateByWorkspaceContains(manager, plugin);
        }
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
        for (const manager of this.managers) {
            manager.$updateStoragePath(path);
        }
    }

    async activateByEvent(activationEvent: string): Promise<void> {
        if (this.activationEvents.has(activationEvent)) {
            return;
        }
        this.activationEvents.add(activationEvent);
        const activation: Promise<void>[] = [];
        for (const manager of this.managers) {
            activation.push(manager.$activateByEvent(activationEvent));
        }
        await Promise.all(activation);
    }

    async activateByLanguage(languageId: string): Promise<void> {
        await this.activateByEvent(`onLanguage:${languageId}`);
    }

    async activateByCommand(commandId: string): Promise<void> {
        await this.activateByEvent(`onCommand:${commandId}`);
    }

    protected ensureCommandHandlerRegistration(event: WillExecuteCommandEvent): void {
        const activation = this.activateByCommand(event.commandId);
        if (this.commands.getCommand(event.commandId) &&
            (!this.contributionHandler.hasCommand(event.commandId) ||
                this.contributionHandler.hasCommandHandler(event.commandId))) {
            return;
        }
        const waitForCommandHandler = new Deferred<void>();
        const listener = this.contributionHandler.onDidRegisterCommandHandler(id => {
            if (id === event.commandId) {
                listener.dispose();
                waitForCommandHandler.resolve();
            }
        });
        const p = Promise.all([
            activation,
            waitForCommandHandler.promise
        ]);
        p.then(() => listener.dispose(), () => listener.dispose());
        event.waitUntil(p);
    }

    protected ensureDebugActivation(event: WaitUntilEvent, activationEvent?: DebugActivationEvent, debugType?: string): void {
        event.waitUntil(this.activateByDebug(activationEvent, debugType));
    }

    async activateByDebug(activationEvent?: DebugActivationEvent, debugType?: string): Promise<void> {
        const promises = [this.activateByEvent('onDebug')];
        if (activationEvent) {
            promises.push(this.activateByEvent(activationEvent));
            if (debugType) {
                promises.push(this.activateByEvent(activationEvent + ':' + debugType));
            }
        }
        await Promise.all(promises);
    }

    protected async activateByWorkspaceContains(manager: PluginManagerExt, plugin: PluginMetadata): Promise<void> {
        if (!plugin.source.activationEvents) {
            return;
        }
        const paths: string[] = [];
        const includePatterns: string[] = [];
        // should be aligned with https://github.com/microsoft/vscode/blob/da5fb7d5b865aa522abc7e82c10b746834b98639/src/vs/workbench/api/node/extHostExtensionService.ts#L460-L469
        for (const activationEvent of plugin.source.activationEvents) {
            if (/^workspaceContains:/.test(activationEvent)) {
                const fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
                if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
                    includePatterns.push(fileNameOrGlob);
                } else {
                    paths.push(fileNameOrGlob);
                }
            }
        }
        const activatePlugin = () => manager.$activateByEvent(`onPlugin:${plugin.model.id}`);
        const promises: Promise<boolean>[] = [];
        if (paths.length) {
            promises.push(this.workspaceService.containsSome(paths));
        }
        if (includePatterns.length) {
            const tokenSource = new CancellationTokenSource();
            const searchTimeout = setTimeout(() => {
                tokenSource.cancel();
                // activate eagerly if took to long to search
                activatePlugin();
            }, 7000);
            promises.push((async () => {
                try {
                    const result = await this.fileSearchService.find('', {
                        rootUris: this.workspaceService.tryGetRoots().map(r => r.uri),
                        includePatterns,
                        limit: 1
                    }, tokenSource.token);
                    return result.length > 0;
                } catch (e) {
                    if (!isCancelled(e)) {
                        console.error(e);
                    }
                    return false;
                } finally {
                    clearTimeout(searchTimeout);
                }
            })());
        }
        if (promises.length && await Promise.all(promises).then(exists => exists.some(v => v))) {
            await activatePlugin();
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
