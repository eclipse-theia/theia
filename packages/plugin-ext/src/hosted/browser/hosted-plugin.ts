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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/da5fb7d5b865aa522abc7e82c10b746834b98639/src/vs/workbench/api/node/extHostExtensionService.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import debounce = require('@theia/core/shared/lodash.debounce');
import { UUID } from '@theia/core/shared/@phosphor/coreutils';
import { injectable, inject, interfaces, named, postConstruct } from '@theia/core/shared/inversify';
import { PluginWorker } from './plugin-worker';
import { PluginMetadata, getPluginId, HostedPluginServer, DeployedPlugin, PluginServer, PluginIdentifiers } from '../../common/plugin-protocol';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { MAIN_RPC_CONTEXT, PluginManagerExt, ConfigStorage, UIKind } from '../../common/plugin-api-rpc';
import { setUpPluginApi } from '../../main/browser/main-context';
import { RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol';
import {
    Disposable, DisposableCollection, Emitter, isCancelled,
    ILogger, ContributionProvider, CommandRegistry, WillExecuteCommandEvent,
    CancellationTokenSource, JsonRpcProxy, ProgressService, nls
} from '@theia/core';
import { PreferenceServiceImpl, PreferenceProviderProvider } from '@theia/core/lib/browser/preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { PluginContributionHandler } from '../../main/browser/plugin-contribution-handler';
import { getQueryParameters } from '../../main/browser/env-main';
import { MainPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { getPreferences } from '../../main/browser/preference-registry-main';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { WaitUntilEvent } from '@theia/core/lib/common/event';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PluginViewRegistry } from '../../main/browser/view/plugin-view-registry';
import { WillResolveTaskProvider, TaskProviderRegistry, TaskResolverRegistry } from '@theia/task/lib/browser/task-contribution';
import { TaskDefinitionRegistry } from '@theia/task/lib/browser/task-definition-registry';
import { WebviewEnvironment } from '../../main/browser/webview/webview-environment';
import { WebviewWidget } from '../../main/browser/webview/webview';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { JsonSchemaStore } from '@theia/core/lib/browser/json-schema-store';
import { FileService, FileSystemProviderActivationEvent } from '@theia/filesystem/lib/browser/file-service';
import { PluginCustomEditorRegistry } from '../../main/browser/custom-editors/plugin-custom-editor-registry';
import { CustomEditorWidget } from '../../main/browser/custom-editors/custom-editor-widget';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { LanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageService';
import { Measurement, Stopwatch } from '@theia/core/lib/common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';

export type PluginHost = 'frontend' | string;
export type DebugActivationEvent = 'onDebugResolve' | 'onDebugInitialConfigurations' | 'onDebugAdapterProtocolTracker' | 'onDebugDynamicConfigurations';

export const PluginProgressLocation = 'plugin';
export const ALL_ACTIVATION_EVENT = '*';

@injectable()
export class HostedPluginSupport {

    protected readonly clientId = UUID.uuid4();

    protected container: interfaces.Container;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    protected readonly server: JsonRpcProxy<HostedPluginServer>;

    @inject(HostedPluginWatcher)
    protected readonly watcher: HostedPluginWatcher;

    @inject(PluginContributionHandler)
    protected readonly contributionHandler: PluginContributionHandler;

    @inject(ContributionProvider)
    @named(MainPluginApiProvider)
    protected readonly mainPluginApiProviders: ContributionProvider<MainPluginApiProvider>;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(PreferenceProviderProvider)
    protected readonly preferenceProviderProvider: PreferenceProviderProvider;

    @inject(PreferenceServiceImpl)
    protected readonly preferenceServiceImpl: PreferenceServiceImpl;

    @inject(PluginPathsService)
    protected readonly pluginPathsService: PluginPathsService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly debugConfigurationManager: DebugConfigurationManager;

    @inject(FileService)
    protected readonly fileService: FileService;

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

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    @inject(WebviewEnvironment)
    protected readonly webviewEnvironment: WebviewEnvironment;

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(JsonSchemaStore)
    protected readonly jsonSchemaStore: JsonSchemaStore;

    @inject(PluginCustomEditorRegistry)
    protected readonly customEditorRegistry: PluginCustomEditorRegistry;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    protected theiaReadyPromise: Promise<any>;

    protected readonly managers = new Map<string, PluginManagerExt>();

    protected readonly contributions = new Map<PluginIdentifiers.UnversionedId, PluginContributions>();

    protected readonly activationEvents = new Set<string>();

    protected readonly onDidChangePluginsEmitter = new Emitter<void>();
    readonly onDidChangePlugins = this.onDidChangePluginsEmitter.event;

    protected readonly deferredWillStart = new Deferred<void>();
    /**
     * Resolves when the initial plugins are loaded and about to be started.
     */
    get willStart(): Promise<void> {
        return this.deferredWillStart.promise;
    }

    protected readonly deferredDidStart = new Deferred<void>();
    /**
     * Resolves when the initial plugins are started.
     */
    get didStart(): Promise<void> {
        return this.deferredDidStart.promise;
    }

    @postConstruct()
    protected init(): void {
        this.theiaReadyPromise = Promise.all([this.preferenceServiceImpl.ready, this.workspaceService.roots]);
        this.workspaceService.onWorkspaceChanged(() => this.updateStoragePath());

        const languageService = (StandaloneServices.get(ILanguageService) as LanguageService);
        for (const language of languageService['_encounteredLanguages'] as Set<string>) {
            this.activateByLanguage(language);
        }
        languageService.onDidEncounterLanguage(language => this.activateByLanguage(language));
        this.commands.onWillExecuteCommand(event => this.ensureCommandHandlerRegistration(event));
        this.debugSessionManager.onWillStartDebugSession(event => this.ensureDebugActivation(event));
        this.debugSessionManager.onWillResolveDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugResolve', event.debugType));
        this.debugConfigurationManager.onWillProvideDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugInitialConfigurations'));
        // Activate all providers of dynamic configurations, i.e. Let the user pick a configuration from all the available ones.
        this.debugConfigurationManager.onWillProvideDynamicDebugConfiguration(event => this.ensureDebugActivation(event, 'onDebugDynamicConfigurations', ALL_ACTIVATION_EVENT));
        this.viewRegistry.onDidExpandView(id => this.activateByView(id));
        this.taskProviderRegistry.onWillProvideTaskProvider(event => this.ensureTaskActivation(event));
        this.taskResolverRegistry.onWillProvideTaskResolver(event => this.ensureTaskActivation(event));
        this.fileService.onWillActivateFileSystemProvider(event => this.ensureFileSystemActivation(event));
        this.customEditorRegistry.onWillOpenCustomEditor(event => this.activateByCustomEditor(event));

        this.widgets.onDidCreateWidget(({ factoryId, widget }) => {
            if ((factoryId === WebviewWidget.FACTORY_ID || factoryId === CustomEditorWidget.FACTORY_ID) && widget instanceof WebviewWidget) {
                const storeState = widget.storeState.bind(widget);
                const restoreState = widget.restoreState.bind(widget);

                widget.storeState = () => {
                    if (this.webviewRevivers.has(widget.viewType)) {
                        return storeState();
                    }
                    return undefined;
                };

                widget.restoreState = state => {
                    if (state.viewType) {
                        restoreState(state);
                        this.preserveWebview(widget);
                    } else {
                        widget.dispose();
                    }
                };
            }
        });
    }

    get plugins(): PluginMetadata[] {
        const plugins: PluginMetadata[] = [];
        this.contributions.forEach(contributions => plugins.push(contributions.plugin.metadata));
        return plugins;
    }

    getPlugin(id: PluginIdentifiers.UnversionedId): DeployedPlugin | undefined {
        const contributions = this.contributions.get(id);
        return contributions && contributions.plugin;
    }

    /** do not call it, except from the plugin frontend contribution */
    onStart(container: interfaces.Container): void {
        this.container = container;
        this.load();
        this.watcher.onDidDeploy(() => this.load());
        this.server.onDidOpenConnection(() => this.load());
    }

    protected loadQueue: Promise<void> = Promise.resolve(undefined);
    load = debounce(() => this.loadQueue = this.loadQueue.then(async () => {
        try {
            await this.progressService.withProgress('', PluginProgressLocation, () => this.doLoad());
        } catch (e) {
            console.error('Failed to load plugins:', e);
        }
    }), 50, { leading: true });

    protected async doLoad(): Promise<void> {
        const toDisconnect = new DisposableCollection(Disposable.create(() => { /* mark as connected */ }));
        toDisconnect.push(Disposable.create(() => this.preserveWebviews()));
        this.server.onDidCloseConnection(() => toDisconnect.dispose());

        // process empty plugins as well in order to properly remove stale plugin widgets
        await this.syncPlugins();

        // it has to be resolved before awaiting layout is initialized
        // otherwise clients can hang forever in the initialization phase
        this.deferredWillStart.resolve();

        // make sure that the previous state, including plugin widgets, is restored
        // and core layout is initialized, i.e. explorer, scm, debug views are already added to the shell
        // but shell is not yet revealed
        await this.appState.reachedState('initialized_layout');

        if (toDisconnect.disposed) {
            // if disconnected then don't try to load plugin contributions
            return;
        }
        const contributionsByHost = this.loadContributions(toDisconnect);

        await this.viewRegistry.initWidgets();
        // remove restored plugin widgets which were not registered by contributions
        this.viewRegistry.removeStaleWidgets();
        await this.theiaReadyPromise;

        if (toDisconnect.disposed) {
            // if disconnected then don't try to init plugin code and dynamic contributions
            return;
        }
        await this.startPlugins(contributionsByHost, toDisconnect);

        this.deferredDidStart.resolve();

        this.restoreWebviews();
    }

    /**
     * Sync loaded and deployed plugins:
     * - undeployed plugins are unloaded
     * - newly deployed plugins are initialized
     */
    protected async syncPlugins(): Promise<void> {
        let initialized = 0;
        const waitPluginsMeasurement = this.measure('waitForDeployment');
        let syncPluginsMeasurement: Measurement | undefined;

        const toUnload = new Set(this.contributions.keys());
        let didChangeInstallationStatus = false;
        try {
            const newPluginIds: PluginIdentifiers.VersionedId[] = [];
            const [deployedPluginIds, uninstalledPluginIds] = await Promise.all([this.server.getDeployedPluginIds(), this.server.getUninstalledPluginIds()]);
            waitPluginsMeasurement.log('Waiting for backend deployment');
            syncPluginsMeasurement = this.measure('syncPlugins');
            for (const versionedId of deployedPluginIds) {
                const unversionedId = PluginIdentifiers.unversionedFromVersioned(versionedId);
                toUnload.delete(unversionedId);
                if (!this.contributions.has(unversionedId)) {
                    newPluginIds.push(versionedId);
                }
            }
            for (const pluginId of toUnload) {
                this.contributions.get(pluginId)?.dispose();
            }
            for (const versionedId of uninstalledPluginIds) {
                const plugin = this.getPlugin(PluginIdentifiers.unversionedFromVersioned(versionedId));
                if (plugin && PluginIdentifiers.componentsToVersionedId(plugin.metadata.model) === versionedId && !plugin.metadata.outOfSync) {
                    plugin.metadata.outOfSync = didChangeInstallationStatus = true;
                }
            }
            for (const contribution of this.contributions.values()) {
                if (contribution.plugin.metadata.outOfSync && !uninstalledPluginIds.includes(PluginIdentifiers.componentsToVersionedId(contribution.plugin.metadata.model))) {
                    contribution.plugin.metadata.outOfSync = false;
                    didChangeInstallationStatus = true;
                }
            }
            if (newPluginIds.length) {
                const plugins = await this.server.getDeployedPlugins({ pluginIds: newPluginIds });
                for (const plugin of plugins) {
                    const pluginId = PluginIdentifiers.componentsToUnversionedId(plugin.metadata.model);
                    const contributions = new PluginContributions(plugin);
                    this.contributions.set(pluginId, contributions);
                    contributions.push(Disposable.create(() => this.contributions.delete(pluginId)));
                    initialized++;
                }
            }
        } finally {
            if (initialized || toUnload.size || didChangeInstallationStatus) {
                this.onDidChangePluginsEmitter.fire(undefined);
            }

            if (!syncPluginsMeasurement) {
                // await didn't complete normally
                waitPluginsMeasurement.error('Backend deployment failed.');
            }
        }

        syncPluginsMeasurement?.log(`Sync of ${this.getPluginCount(initialized)}`);
    }

    /**
     * Always synchronous in order to simplify handling disconnections.
     * @throws never
     */
    protected loadContributions(toDisconnect: DisposableCollection): Map<PluginHost, PluginContributions[]> {
        let loaded = 0;
        const loadPluginsMeasurement = this.measure('loadPlugins');

        const hostContributions = new Map<PluginHost, PluginContributions[]>();
        console.log(`[${this.clientId}] Loading plugin contributions`);
        for (const contributions of this.contributions.values()) {
            const plugin = contributions.plugin.metadata;
            const pluginId = plugin.model.id;

            if (contributions.state === PluginContributions.State.INITIALIZING) {
                contributions.state = PluginContributions.State.LOADING;
                contributions.push(Disposable.create(() => console.log(`[${pluginId}]: Unloaded plugin.`)));
                contributions.push(this.contributionHandler.handleContributions(this.clientId, contributions.plugin));
                contributions.state = PluginContributions.State.LOADED;
                console.debug(`[${this.clientId}][${pluginId}]: Loaded contributions.`);
                loaded++;
            }

            if (contributions.state === PluginContributions.State.LOADED) {
                contributions.state = PluginContributions.State.STARTING;
                const host = plugin.model.entryPoint.frontend ? 'frontend' : plugin.host;
                const dynamicContributions = hostContributions.get(host) || [];
                dynamicContributions.push(contributions);
                hostContributions.set(host, dynamicContributions);
                toDisconnect.push(Disposable.create(() => {
                    contributions!.state = PluginContributions.State.LOADED;
                    console.debug(`[${this.clientId}][${pluginId}]: Disconnected.`);
                }));
            }
        }

        loadPluginsMeasurement.log(`Load contributions of ${this.getPluginCount(loaded)}`);

        return hostContributions;
    }

    protected async startPlugins(contributionsByHost: Map<PluginHost, PluginContributions[]>, toDisconnect: DisposableCollection): Promise<void> {
        let started = 0;
        const startPluginsMeasurement = this.measure('startPlugins');

        const [hostLogPath, hostStoragePath, hostGlobalStoragePath] = await Promise.all([
            this.pluginPathsService.getHostLogPath(),
            this.getStoragePath(),
            this.getHostGlobalStoragePath()
        ]);

        if (toDisconnect.disposed) {
            return;
        }

        const thenable: Promise<void>[] = [];
        const configStorage: ConfigStorage = {
            hostLogPath,
            hostStoragePath,
            hostGlobalStoragePath
        };

        for (const [host, hostContributions] of contributionsByHost) {
            // do not start plugins for electron browser
            if (host === 'frontend' && environment.electron.is()) {
                continue;
            }

            const manager = await this.obtainManager(host, hostContributions, toDisconnect);
            if (!manager) {
                continue;
            }

            const plugins = hostContributions.map(contributions => contributions.plugin.metadata);
            thenable.push((async () => {
                try {
                    const activationEvents = [...this.activationEvents];
                    await manager.$start({ plugins, configStorage, activationEvents });
                    if (toDisconnect.disposed) {
                        return;
                    }
                    console.log(`[${this.clientId}] Starting plugins.`);
                    for (const contributions of hostContributions) {
                        started++;
                        const plugin = contributions.plugin;
                        const id = plugin.metadata.model.id;
                        contributions.state = PluginContributions.State.STARTED;
                        console.debug(`[${this.clientId}][${id}]: Started plugin.`);
                        toDisconnect.push(contributions.push(Disposable.create(() => {
                            console.debug(`[${this.clientId}][${id}]: Stopped plugin.`);
                            manager.$stop(id);
                        })));

                        this.activateByWorkspaceContains(manager, plugin);
                    }
                } catch (e) {
                    console.error(`Failed to start plugins for '${host}' host`, e);
                }
            })());
        }

        await Promise.all(thenable);
        await this.activateByEvent('onStartupFinished');
        if (toDisconnect.disposed) {
            return;
        }

        startPluginsMeasurement.log(`Start of ${this.getPluginCount(started)}`);
    }

    protected async obtainManager(host: string, hostContributions: PluginContributions[], toDisconnect: DisposableCollection): Promise<PluginManagerExt | undefined> {
        let manager = this.managers.get(host);
        if (!manager) {
            const pluginId = getPluginId(hostContributions[0].plugin.metadata.model);
            const rpc = this.initRpc(host, pluginId);
            toDisconnect.push(rpc);

            manager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            this.managers.set(host, manager);
            toDisconnect.push(Disposable.create(() => this.managers.delete(host)));

            const [extApi, globalState, workspaceState, webviewResourceRoot, webviewCspSource, defaultShell, jsonValidation] = await Promise.all([
                this.server.getExtPluginAPI(),
                this.pluginServer.getAllStorageValues(undefined),
                this.pluginServer.getAllStorageValues({
                    workspace: this.workspaceService.workspace?.resource.toString(),
                    roots: this.workspaceService.tryGetRoots().map(root => root.resource.toString())
                }),
                this.webviewEnvironment.resourceRoot(host),
                this.webviewEnvironment.cspSource(),
                this.terminalService.getDefaultShell(),
                this.jsonSchemaStore.schemas
            ]);
            if (toDisconnect.disposed) {
                return undefined;
            }

            const isElectron = environment.electron.is();
            await manager.$init({
                preferences: getPreferences(this.preferenceProviderProvider, this.workspaceService.tryGetRoots()),
                globalState,
                workspaceState,
                env: {
                    queryParams: getQueryParameters(),
                    language: nls.locale || nls.defaultLocale,
                    shell: defaultShell,
                    uiKind: isElectron ? UIKind.Desktop : UIKind.Web,
                    appName: FrontendApplicationConfigProvider.get().applicationName,
                    appHost: isElectron ? 'desktop' : 'web' // TODO: 'web' could be the embedder's name, e.g. 'github.dev'
                },
                extApi,
                webview: {
                    webviewResourceRoot,
                    webviewCspSource
                },
                jsonValidation
            });
            if (toDisconnect.disposed) {
                return undefined;
            }
        }
        return manager;
    }

    protected initRpc(host: PluginHost, pluginId: string): RPCProtocol {
        const rpc = host === 'frontend' ? new PluginWorker().rpc : this.createServerRpc(host);
        setUpPluginApi(rpc, this.container);
        this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(rpc, this.container));
        return rpc;
    }

    protected createServerRpc(pluginHostId: string): RPCProtocol {

        const channel = new BasicChannel(() => {
            const writer = new Uint8ArrayWriteBuffer();
            writer.onCommit(buffer => {
                this.server.onMessage(pluginHostId, buffer);
            });
            return writer;
        });

        // Create RPC protocol before adding the listener to the watcher to receive the watcher's cached messages after the rpc protocol was created.
        const rpc = new RPCProtocolImpl(channel);

        this.watcher.onPostMessageEvent(received => {
            if (pluginHostId === received.pluginHostId) {
                channel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(received.message));
            }
        });

        return rpc;
    }

    protected async updateStoragePath(): Promise<void> {
        const path = await this.getStoragePath();
        for (const manager of this.managers.values()) {
            manager.$updateStoragePath(path);
        }
    }

    protected async getStoragePath(): Promise<string | undefined> {
        const roots = await this.workspaceService.roots;
        return this.pluginPathsService.getHostStoragePath(this.workspaceService.workspace?.resource.toString(), roots.map(root => root.resource.toString()));
    }

    protected async getHostGlobalStoragePath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const globalStorageFolderUri = new URI(configDirUri).resolve('globalStorage');

        // Make sure that folder by the path exists
        if (!await this.fileService.exists(globalStorageFolderUri)) {
            await this.fileService.createFolder(globalStorageFolderUri, { fromUserGesture: false });
        }
        const globalStorageFolderFsPath = await this.fileService.fsPath(globalStorageFolderUri);
        if (!globalStorageFolderFsPath) {
            throw new Error(`Could not resolve the FS path for URI: ${globalStorageFolderUri}`);
        }
        return globalStorageFolderFsPath;
    }

    async activateByEvent(activationEvent: string): Promise<void> {
        if (this.activationEvents.has(activationEvent)) {
            return;
        }
        this.activationEvents.add(activationEvent);
        await Promise.all(Array.from(this.managers.values(), manager => manager.$activateByEvent(activationEvent)));
    }

    async activateByViewContainer(viewContainerId: string): Promise<void> {
        await Promise.all(this.viewRegistry.getContainerViews(viewContainerId).map(viewId => this.activateByView(viewId)));
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

    async activateByTaskType(taskType: string): Promise<void> {
        await this.activateByEvent(`onTaskType:${taskType}`);
    }

    async activateByCustomEditor(viewType: string): Promise<void> {
        await this.activateByEvent(`onCustomEditor:${viewType}`);
    }

    activateByFileSystem(event: FileSystemProviderActivationEvent): Promise<void> {
        return this.activateByEvent(`onFileSystem:${event.scheme}`);
    }

    activateByTerminalProfile(profileId: string): Promise<void> {
        return this.activateByEvent(`onTerminalProfile:${profileId}`);
    }

    protected ensureFileSystemActivation(event: FileSystemProviderActivationEvent): void {
        event.waitUntil(this.activateByFileSystem(event));
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

    protected ensureTaskActivation(event: WillResolveTaskProvider): void {
        const promises = [this.activateByCommand('workbench.action.tasks.runTask')];
        const taskType = event.taskType;
        if (taskType) {
            if (taskType === ALL_ACTIVATION_EVENT) {
                for (const taskDefinition of this.taskDefinitionRegistry.getAll()) {
                    promises.push(this.activateByTaskType(taskDefinition.taskType));
                }
            } else {
                promises.push(this.activateByTaskType(taskType));
            }
        }

        event.waitUntil(Promise.all(promises));
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

    protected async activateByWorkspaceContains(manager: PluginManagerExt, plugin: DeployedPlugin): Promise<void> {
        const activationEvents = plugin.contributes && plugin.contributes.activationEvents;
        if (!activationEvents) {
            return;
        }
        const paths: string[] = [];
        const includePatterns: string[] = [];
        // should be aligned with https://github.com/microsoft/vscode/blob/da5fb7d5b865aa522abc7e82c10b746834b98639/src/vs/workbench/api/node/extHostExtensionService.ts#L460-L469
        for (const activationEvent of activationEvents) {
            if (/^workspaceContains:/.test(activationEvent)) {
                const fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
                if (fileNameOrGlob.indexOf(ALL_ACTIVATION_EVENT) >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
                    includePatterns.push(fileNameOrGlob);
                } else {
                    paths.push(fileNameOrGlob);
                }
            }
        }
        const activatePlugin = () => manager.$activateByEvent(`onPlugin:${plugin.metadata.model.id}`);
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
                        rootUris: this.workspaceService.tryGetRoots().map(r => r.resource.toString()),
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

    async activatePlugin(id: string): Promise<void> {
        const activation = [];
        for (const manager of this.managers.values()) {
            activation.push(manager.$activatePlugin(id));
        }
        await Promise.all(activation);
    }

    protected measure(name: string): Measurement {
        return this.stopwatch.start(name, { context: this.clientId });
    }

    protected getPluginCount(plugins: number): string {
        return `${plugins} plugin${plugins === 1 ? '' : 's'}`;
    }

    protected readonly webviewsToRestore = new Set<WebviewWidget>();
    protected readonly webviewRevivers = new Map<string, (webview: WebviewWidget) => Promise<void>>();

    registerWebviewReviver(viewType: string, reviver: (webview: WebviewWidget) => Promise<void>): void {
        if (this.webviewRevivers.has(viewType)) {
            throw new Error(`Reviver for ${viewType} already registered`);
        }
        this.webviewRevivers.set(viewType, reviver);
    }

    unregisterWebviewReviver(viewType: string): void {
        this.webviewRevivers.delete(viewType);
    }

    protected async preserveWebviews(): Promise<void> {
        for (const webview of this.widgets.getWidgets(WebviewWidget.FACTORY_ID)) {
            this.preserveWebview(webview as WebviewWidget);
        }
        for (const webview of this.widgets.getWidgets(CustomEditorWidget.FACTORY_ID)) {
            (webview as CustomEditorWidget).modelRef.dispose();
            if ((webview as any)['closeWithoutSaving']) {
                delete (webview as any)['closeWithoutSaving'];
            }
            this.customEditorRegistry.resolveWidget(webview as CustomEditorWidget);
        }
    }

    protected preserveWebview(webview: WebviewWidget): void {
        if (!this.webviewsToRestore.has(webview)) {
            this.webviewsToRestore.add(webview);
            webview.disposed.connect(() => this.webviewsToRestore.delete(webview));
        }
    }

    protected restoreWebviews(): void {
        for (const webview of this.webviewsToRestore) {
            this.restoreWebview(webview);
        }
        this.webviewsToRestore.clear();
    }

    protected async restoreWebview(webview: WebviewWidget): Promise<void> {
        await this.activateByEvent(`onWebviewPanel:${webview.viewType}`);
        const restore = this.webviewRevivers.get(webview.viewType);
        if (restore) {
            try {
                await restore(webview);
            } catch (e) {
                webview.setHTML(this.getDeserializationFailedContents(`
                An error occurred while restoring '${webview.viewType}' view. Please check logs.
                `));
                console.error('Failed to restore the webview', e);
            }
        }
    }

    protected getDeserializationFailedContents(message: string): string {
        return `<!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="Content-type" content="text/html;charset=UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none';">
            </head>
            <body>${message}</body>
        </html>`;
    }

}

export class PluginContributions extends DisposableCollection {
    constructor(
        readonly plugin: DeployedPlugin
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
