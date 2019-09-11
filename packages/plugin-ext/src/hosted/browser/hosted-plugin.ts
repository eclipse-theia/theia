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
import { PluginMetadata, getPluginId, HostedPluginServer } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, PluginManagerExt } from '../../common/plugin-api-rpc';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol';
import {
    Disposable, DisposableCollection,
    ILogger, ContributionProvider, CommandRegistry, WillExecuteCommandEvent,
    CancellationTokenSource, JsonRpcProxy, ProgressService
} from '@theia/core';
import { PreferenceServiceImpl, PreferenceProviderProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PluginContributionHandler } from '../../main/browser/plugin-contribution-handler';
import { getQueryParameters } from '../../main/browser/env-main';
import { ExtPluginApi, MainPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { getPreferences } from '../../main/browser/preference-registry-main';
import { PluginServer } from '../../common/plugin-protocol';
import { KeysToKeysToAnyValue } from '../../common/types';
import { FileStat } from '@theia/filesystem/lib/common/filesystem';
import { MonacoTextmateService } from '@theia/monaco/lib/browser/textmate';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { WaitUntilEvent } from '@theia/core/lib/common/event';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { Emitter, isCancelled } from '@theia/core';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PluginViewRegistry } from '../../main/browser/view/plugin-view-registry';
import { TaskProviderRegistry, TaskResolverRegistry } from '@theia/task/lib/browser/task-contribution';

export type PluginHost = 'frontend' | string;
export type DebugActivationEvent = 'onDebugResolve' | 'onDebugInitialConfigurations' | 'onDebugAdapterProtocolTracker';

export const PluginProgressLocation = 'plugin';

@injectable()
export class HostedPluginSupport {
    container: interfaces.Container;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    private readonly server: JsonRpcProxy<HostedPluginServer>;

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

    @inject(PluginViewRegistry)
    protected readonly viewRegistry: PluginViewRegistry;

    @inject(TaskProviderRegistry)
    protected readonly taskProviderRegistry: TaskProviderRegistry;

    @inject(TaskResolverRegistry)
    protected readonly taskResolverRegistry: TaskResolverRegistry;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    private theiaReadyPromise: Promise<any>;

    protected readonly managers = new Map<string, PluginManagerExt>();

    private readonly contributions = new Map<string, PluginContributions>();

    protected readonly activationEvents = new Set<string>();

    protected readonly onDidChangePluginsEmitter = new Emitter<void>();
    readonly onDidChangePlugins = this.onDidChangePluginsEmitter.event;

    @postConstruct()
    protected init(): void {
        this.theiaReadyPromise = Promise.all([this.preferenceServiceImpl.ready, this.workspaceService.roots]);
        this.workspaceService.onWorkspaceChanged(() => this.updateStoragePath());

        for (const id of this.monacoTextmateService.activatedLanguages) {
            this.activateByLanguage(id);
        }
        this.monacoTextmateService.onDidActivateLanguage(id => this.activateByLanguage(id));
        this.commands.onWillExecuteCommand(event => this.ensureCommandHandlerRegistration(event));
        this.debugSessionManager.onWillStartDebugSession(event => this.ensureDebugActivation(event));
        this.debugSessionManager.onWillResolveDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugResolve', event.debugType));
        this.debugConfigurationManager.onWillProvideDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugInitialConfigurations'));
        this.viewRegistry.onDidExpandView(id => this.activateByView(id));
        this.taskProviderRegistry.onWillProvideTaskProvider(event => this.ensureTaskActivation(event));
        this.taskResolverRegistry.onWillProvideTaskResolver(event => this.ensureTaskActivation(event));
    }

    get plugins(): PluginMetadata[] {
        const plugins: PluginMetadata[] = [];
        this.contributions.forEach(contributions => plugins.push(contributions.plugin));
        return plugins;
    }

    /** do not call it, except from the plugin frontend contribution */
    onStart(container: interfaces.Container): void {
        this.container = container;
        this.load();
        this.watcher.onDidDeploy(() => this.load());
        this.server.onDidOpenConnection(() => this.load());
    }

    async load(): Promise<void> {
        try {
            await this.progressService.withProgress('', PluginProgressLocation, async () => {
                const roots = this.workspaceService.tryGetRoots();
                const [plugins, logPath, storagePath, pluginAPIs, globalStates, workspaceStates] = await Promise.all([
                    this.server.getDeployedMetadata(),
                    this.pluginPathsService.getHostLogPath(),
                    this.getStoragePath(),
                    this.server.getExtPluginAPI(),
                    this.pluginServer.getAllStorageValues(undefined),
                    this.pluginServer.getAllStorageValues({ workspace: this.workspaceService.workspace, roots })
                ]);
                await this.doLoad({ plugins, logPath, storagePath, pluginAPIs, globalStates, workspaceStates, roots }, this.container);
            });
        } catch (e) {
            console.error('Failed to load plugins:', e);
        }
    }

    protected async doLoad(initData: PluginsInitializationData, container: interfaces.Container): Promise<void> {
        const toDisconnect = new DisposableCollection(Disposable.create(() => { /* mark as connected */ }));
        this.server.onDidCloseConnection(() => toDisconnect.dispose());

        // make sure that the previous state, including plugin widgets, is restored
        // and core layout is initialized, i.e. explorer, scm, debug views are already added to the shell
        // but shell is not yet revealed
        await this.appState.reachedState('initialized_layout');
        if (toDisconnect.disposed) {
            // if disconnected then don't try to load plugin contributions
            return;
        }
        const contributionsByHost = this.loadContributions(initData.plugins, toDisconnect);

        await this.viewRegistry.initWidgets();
        // remove restored plugin widgets which were not registered by contributions
        this.viewRegistry.removeStaleWidgets();
        await this.theiaReadyPromise;

        if (toDisconnect.disposed) {
            // if disconnected then don't try to init plugin code and dynamic contributions
            return;
        }
        toDisconnect.push(this.startPlugins(contributionsByHost, initData, container));
    }

    /**
     * Always synchronous in order to simplify handling disconnections.
     * @throws never
     */
    protected loadContributions(plugins: PluginMetadata[], toDisconnect: DisposableCollection): Map<PluginHost, PluginContributions[]> {
        const hostContributions = new Map<PluginHost, PluginContributions[]>();
        const toUnload = new Set(this.contributions.keys());
        let loaded = false;
        for (const plugin of plugins) {
            const pluginId = plugin.model.id;
            toUnload.delete(pluginId);

            let contributions = this.contributions.get(pluginId);
            if (!contributions) {
                contributions = new PluginContributions(plugin);
                this.contributions.set(pluginId, contributions);
                contributions.push(Disposable.create(() => this.contributions.delete(pluginId)));
                loaded = true;
            }

            if (contributions.state === PluginContributions.State.INITIALIZING) {
                contributions.state = PluginContributions.State.LOADING;
                contributions.push(Disposable.create(() => console.log(`[${plugin.model.id}]: Unloaded plugin.`)));
                contributions.push(this.contributionHandler.handleContributions(plugin));
                contributions.state = PluginContributions.State.LOADED;
                console.log(`[${plugin.model.id}]: Loaded contributions.`);
            }

            if (contributions.state === PluginContributions.State.LOADED) {
                contributions.state = PluginContributions.State.STARTING;
                const host = plugin.model.entryPoint.frontend ? 'frontend' : plugin.host;
                const dynamicContributions = hostContributions.get(plugin.host) || [];
                dynamicContributions.push(contributions);
                hostContributions.set(host, dynamicContributions);
                toDisconnect.push(Disposable.create(() => {
                    contributions!.state = PluginContributions.State.LOADED;
                    console.log(`[${plugin.model.id}]: Disconnected.`);
                }));
            }
        }
        for (const pluginId of toUnload) {
            const contribution = this.contributions.get(pluginId);
            if (contribution) {
                contribution.dispose();
            }
        }
        if (loaded || toUnload.size) {
            this.onDidChangePluginsEmitter.fire(undefined);
        }
        return hostContributions;
    }

    protected startPlugins(
        contributionsByHost: Map<PluginHost, PluginContributions[]>,
        initData: PluginsInitializationData,
        container: interfaces.Container
    ): Disposable {
        const toDisconnect = new DisposableCollection();
        for (const [host, hostContributions] of contributionsByHost) {
            const manager = this.obtainManager(host, hostContributions, container, toDisconnect);
            this.initPlugins(manager, {
                ...initData,
                plugins: hostContributions.map(contributions => contributions.plugin)
            }).then(() => {
                if (toDisconnect.disposed) {
                    return;
                }
                for (const contributions of hostContributions) {
                    const plugin = contributions.plugin;
                    const id = plugin.model.id;
                    contributions.state = PluginContributions.State.STARTED;
                    console.log(`[${id}]: Started plugin.`);
                    toDisconnect.push(contributions.push(Disposable.create(() => {
                        console.log(`[${id}]: Stopped plugin.`);
                        manager.$stop(id);
                    })));

                    this.activateByWorkspaceContains(manager, plugin);
                }
            });
        }
        return toDisconnect;
    }

    protected obtainManager(host: string, hostContributions: PluginContributions[], container: interfaces.Container, toDispose: DisposableCollection): PluginManagerExt {
        let manager = this.managers.get(host);
        if (!manager) {
            const pluginId = getPluginId(hostContributions[0].plugin.model);
            const rpc = this.initRpc(host, pluginId, container);
            toDispose.push(rpc);
            manager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            this.managers.set(host, manager);
            toDispose.push(Disposable.create(() => this.managers.delete(host)));
        }
        return manager;
    }

    protected initRpc(host: PluginHost, pluginId: string, container: interfaces.Container): RPCProtocol {
        const rpc = host === 'frontend' ? new PluginWorker().rpc : this.createServerRpc(pluginId, host);
        setUpPluginApi(rpc, container);
        this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(rpc, container));
        return rpc;
    }

    protected async initPlugins(manager: PluginManagerExt, data: PluginsInitializationData): Promise<void> {
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

    private async updateStoragePath(): Promise<void> {
        const path = await this.getStoragePath();
        for (const manager of this.managers.values()) {
            manager.$updateStoragePath(path);
        }
    }

    protected getStoragePath(): Promise<string | undefined> {
        return this.pluginPathsService.getHostStoragePath(this.workspaceService.workspace, this.workspaceService.tryGetRoots());
    }

    async activateByEvent(activationEvent: string): Promise<void> {
        if (this.activationEvents.has(activationEvent)) {
            return;
        }
        this.activationEvents.add(activationEvent);
        const activation: Promise<void>[] = [];
        for (const manager of this.managers.values()) {
            activation.push(manager.$activateByEvent(activationEvent));
        }
        await Promise.all(activation);
    }

    async activateByView(viewId: string): Promise<void> {
        await this.activateByEvent(`onView:${viewId}`);
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

    protected ensureTaskActivation(event: WaitUntilEvent): void {
        event.waitUntil(this.activateByCommand('workbench.action.tasks.runTask'));
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

export class PluginContributions extends DisposableCollection {
    constructor(
        readonly plugin: PluginMetadata
    ) {
        super();
    }
    state: PluginContributions.State = PluginContributions.State.INITIALIZING;
}
export namespace PluginContributions {
    export enum State {
        INITIALIZING = 0,
        LOADING = 1,
        LOADED = 2,
        STARTING = 3,
        STARTED = 4
    }
}
