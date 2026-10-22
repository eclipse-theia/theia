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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/da5fb7d5b865aa522abc7e82c10b746834b98639/src/vs/workbench/api/node/extHostExtensionService.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import debounce = require('@theia/core/shared/lodash.debounce');
import { injectable, inject, interfaces, named, postConstruct, unmanaged } from '@theia/core/shared/inversify';
import { PluginMetadata, HostedPluginServer, DeployedPlugin, PluginServer, PluginIdentifiers, PLUGIN_HOST_FRONTEND } from '../../common/plugin-protocol';
import { AbstractPluginManagerExt, ConfigStorage } from '../../common/plugin-api-rpc';
import {
    Disposable, DisposableCollection, Emitter,
    ILogger, ContributionProvider,
    RpcProxy
} from '@theia/core';
import { MainPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { Measurement, Stopwatch } from '@theia/core/lib/common';

export type PluginHost = typeof PLUGIN_HOST_FRONTEND | string;

export const ALL_ACTIVATION_EVENT = '*';

export function isConnectionScopedBackendPlugin(plugin: DeployedPlugin): boolean {
    const entryPoint = plugin.metadata.model.entryPoint;

    // A plugin doesn't have to have any entry-point if it doesn't need the activation handler,
    // in which case it's assumed to be a backend plugin.
    return !entryPoint.headless || !!entryPoint.backend;
}

@injectable()
export abstract class AbstractHostedPluginSupport<PM extends AbstractPluginManagerExt<any>, HPS extends HostedPluginServer | RpcProxy<HostedPluginServer>> {

    protected container: interfaces.Container;

    @inject(ILogger) @named('plugin-ext:AbstractHostedPluginSupport')
    protected readonly logger: ILogger;

    @inject(HostedPluginServer)
    protected readonly server: HPS;

    @inject(ContributionProvider)
    @named(MainPluginApiProvider)
    protected readonly mainPluginApiProviders: ContributionProvider<MainPluginApiProvider>;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(PluginPathsService)
    protected readonly pluginPathsService: PluginPathsService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    protected theiaReadyPromise: Promise<unknown>;

    protected readonly managers = new Map<string, PM>();

    protected readonly contributions = new Map<PluginIdentifiers.UnversionedId, PluginContributions>();

    protected readonly activationEvents = new Set<string>();

    /** The activation of each requested activation event, so that repeated requests for an event await the same activation. */
    protected readonly activationsByEvent = new Map<string, Promise<void>>();

    /**
     * Resolves when every plugin host of the current load has a manager to which activation events can be sent.
     * Rejected if the connection is lost before then, and replaced for the next load.
     */
    protected deferredManagers = new Deferred<void>();

    protected workspaceTrusted: boolean = false;

    protected readonly _disabledByTrust = new Set<string>();

    get disabledByTrust(): ReadonlySet<string> {
        return this._disabledByTrust;
    }

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

    constructor(@unmanaged() protected readonly clientId: string) { }

    @postConstruct()
    protected init(): void {
        this.theiaReadyPromise = this.createTheiaReadyPromise();
    }

    protected abstract createTheiaReadyPromise(): Promise<unknown>;

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
        this.afterStart();
    }

    protected afterStart(): void {
        // Nothing to do in the abstract
    }

    protected loadQueue: Promise<void> = Promise.resolve(undefined);
    load = debounce(() => this.loadQueue = this.loadQueue.then(async () => {
        try {
            await this.runOperation(() => this.doLoad());
        } catch (e) {
            this.logger.error('Failed to load plugins:', e);
            // Resolve the startup deferreds so that clients awaiting `willStart` or `didStart`,
            // e.g. file system provider activations, do not hang forever on a failed load.
            this.deferredWillStart.resolve();
            this.deferredManagers.resolve();
            this.deferredDidStart.resolve();
        }
    }), 50, { leading: true });

    protected runOperation(operation: () => Promise<void>): Promise<void> {
        return operation();
    }

    protected async doLoad(): Promise<void> {
        const toDisconnect = new DisposableCollection(Disposable.create(() => { /* mark as connected */ }));
        const managers = this.deferredManagers;
        toDisconnect.push(Disposable.create(() => this.disconnectManagers(managers)));

        this._disabledByTrust.clear();

        await this.beforeSyncPlugins(toDisconnect);

        // process empty plugins as well in order to properly remove stale plugin widgets
        await this.syncPlugins();

        // it has to be resolved before awaiting layout is initialized
        // otherwise clients can hang forever in the initialization phase
        this.deferredWillStart.resolve();

        await this.beforeLoadContributions(toDisconnect);

        if (toDisconnect.disposed) {
            // if disconnected then don't try to load plugin contributions
            return;
        }
        const contributionsByHost = this.loadContributions(toDisconnect);
        if (this._disabledByTrust.size > 0) {
            this.onDidChangePluginsEmitter.fire(undefined);
        }

        await this.afterLoadContributions(toDisconnect);

        await this.theiaReadyPromise;
        if (toDisconnect.disposed) {
            // if disconnected then don't try to init plugin code and dynamic contributions
            return;
        }
        await this.startPlugins(contributionsByHost, toDisconnect);

        this.deferredDidStart.resolve();
    }

    protected beforeSyncPlugins(toDisconnect: DisposableCollection): Promise<void> {
        // Nothing to do in the abstract
        return Promise.resolve();
    }

    protected beforeLoadContributions(toDisconnect: DisposableCollection): Promise<void> {
        // Nothing to do in the abstract
        return Promise.resolve();
    }

    protected afterLoadContributions(toDisconnect: DisposableCollection): Promise<void> {
        // Nothing to do in the abstract
        return Promise.resolve();
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
            const [deployedPluginIds, uninstalledPluginIds, disabledPlugins] = await Promise.all(
                [this.server.getDeployedPluginIds(), this.server.getUninstalledPluginIds(), this.server.getDisabledPluginIds()]);

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
            for (const unversionedId of disabledPlugins) {
                const plugin = this.getPlugin(unversionedId);
                if (plugin && PluginIdentifiers.componentsToUnversionedId(plugin.metadata.model) === unversionedId && !plugin.metadata.outOfSync) {
                    plugin.metadata.outOfSync = didChangeInstallationStatus = true;
                }
            }
            for (const contribution of this.contributions.values()) {
                if (contribution.plugin.metadata.outOfSync && !(
                    uninstalledPluginIds.includes(PluginIdentifiers.componentsToVersionedId(contribution.plugin.metadata.model))
                    || disabledPlugins.includes(PluginIdentifiers.componentsToUnversionedId(contribution.plugin.metadata.model))
                )) {
                    contribution.plugin.metadata.outOfSync = false;
                    didChangeInstallationStatus = true;
                }
            }
            if (newPluginIds.length) {
                const deployedPlugins = await this.server.getDeployedPlugins(newPluginIds);

                const plugins: DeployedPlugin[] = [];
                for (const plugin of deployedPlugins) {
                    const accepted = this.acceptPlugin(plugin);
                    if (typeof accepted === 'object') {
                        plugins.push(accepted);
                    } else if (accepted) {
                        plugins.push(plugin);
                    }
                }

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
        if (initialized > 0) {
            // Only log sync measurement if there are were plugins to sync.
            syncPluginsMeasurement?.log(`Sync of ${this.getPluginCount(initialized)}`);
        } else {
            syncPluginsMeasurement?.stop();
        }
    }

    /**
     * Accept a deployed plugin to load in this host, or reject it, or adapt it for loading.
     * The result may be a boolean to accept (`true`) or reject (`false`) the plugin as is,
     * or else an adaptation of the original `plugin` to load in its stead.
     */
    protected abstract acceptPlugin(plugin: DeployedPlugin): boolean | DeployedPlugin;

    /**
     * Always synchronous in order to simplify handling disconnections.
     * @throws never
     */
    protected loadContributions(toDisconnect: DisposableCollection): Map<PluginHost, PluginContributions[]> {
        let loaded = 0;
        const loadPluginsMeasurement = this.measure('loadPlugins');

        const hostContributions = new Map<PluginHost, PluginContributions[]>();
        this.logger.info(`[${this.clientId}] Loading plugin contributions`);
        for (const contributions of this.contributions.values()) {
            if (!this.workspaceTrusted && contributions.plugin.metadata.model.untrustedWorkspacesSupport === false) {
                this._disabledByTrust.add(PluginIdentifiers.componentsToUnversionedId(contributions.plugin.metadata.model));
                continue;
            }

            const plugin = contributions.plugin.metadata;
            const pluginId = plugin.model.id;
            if (contributions.state === PluginContributions.State.INITIALIZING) {
                contributions.state = PluginContributions.State.LOADING;
                contributions.push(Disposable.create(() => this.logger.info(`[${pluginId}]: Unloaded plugin.`)));
                contributions.push(this.handleContributions(contributions.plugin));
                contributions.state = PluginContributions.State.LOADED;
                this.logger.debug(`[${this.clientId}][${pluginId}]: Loaded contributions.`);
                loaded++;
            }

            if (contributions.state === PluginContributions.State.LOADED) {
                contributions.state = PluginContributions.State.STARTING;
                const host = plugin.model.entryPoint.frontend ? PLUGIN_HOST_FRONTEND : plugin.host;
                const dynamicContributions = hostContributions.get(host) || [];
                dynamicContributions.push(contributions);
                hostContributions.set(host, dynamicContributions);
                toDisconnect.push(Disposable.create(() => {
                    contributions!.state = PluginContributions.State.LOADED;
                    this.logger.debug(`[${this.clientId}][${pluginId}]: Disconnected.`);
                }));
            }
        }
        if (loaded > 0) {
            // Only log load measurement if there are were plugins to load.
            loadPluginsMeasurement?.log(`Load contributions of ${this.getPluginCount(loaded)}`);
        } else {
            loadPluginsMeasurement.stop();
        }

        return hostContributions;
    }

    protected abstract handleContributions(plugin: DeployedPlugin): Disposable;

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

        const managers = this.deferredManagers;
        // The hosts replay the activation events requested so far to the plugins that this load deploys. Forget the
        // activations completed before, so that a new request for one of these events awaits the replay instead.
        this.activationsByEvent.clear();
        const thenable: Promise<void>[] = [];
        const configStorage: ConfigStorage = {
            hostLogPath,
            hostStoragePath,
            hostGlobalStoragePath
        };

        for (const [host, hostContributions] of contributionsByHost) {
            // do not start plugins for electron browser
            if (host === PLUGIN_HOST_FRONTEND && environment.electron.is()) {
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
                    this.logger.info(`[${this.clientId}] Starting plugins.`);
                    for (const contributions of hostContributions) {
                        started++;
                        const plugin = contributions.plugin;
                        const id = plugin.metadata.model.id;
                        contributions.state = PluginContributions.State.STARTED;
                        this.logger.debug(`[${this.clientId}][${id}]: Started plugin.`);
                        toDisconnect.push(contributions.push(Disposable.create(() => {
                            this.logger.debug(`[${this.clientId}][${id}]: Stopped plugin.`);
                            manager.$stop(id);
                        })));

                        this.handlePluginStarted(manager, plugin);
                    }
                } catch (e) {
                    this.logger.error(`Failed to start plugins for '${host}' host`, e);
                }
            })());
        }

        // Every host of this load has a manager now, if the connection has not been lost in the meantime
        managers.resolve();
        await Promise.all(thenable);
        await this.activateByEvent('onStartupFinished');
        if (toDisconnect.disposed) {
            return;
        }

        if (started > 0) {
            startPluginsMeasurement.log(`Start of ${this.getPluginCount(started)}`);
        } else {
            startPluginsMeasurement.stop();
        }
    }

    protected abstract obtainManager(host: string, hostContributions: PluginContributions[],
        toDisconnect: DisposableCollection): Promise<PM | undefined>;

    protected abstract getStoragePath(): Promise<string | undefined>;

    protected abstract getHostGlobalStoragePath(): Promise<string>;

    /**
     * Activate the plugins that declare the given activation event.
     *
     * An event requested before the plugin hosts are started is sent to each of them as soon as it has a manager, and
     * the hosts replay it on start to plugins deployed later. Requesting an event again while its activation is in flight
     * or complete awaits that activation. A failed activation, e.g. because the connection to the plugin hosts was lost,
     * is retried on the next request.
     *
     * @param activationEvent the activation event
     * @returns a promise that resolves when the plugins activated by the event have finished activating in every plugin
     *   host. Before the start of the plugins, this depends on the hosts becoming available, so callers that the start
     *   of the plugins depends on must not await it unless some plugin declares the event
     */
    activateByEvent(activationEvent: string): Promise<void> {
        const pending = this.activationsByEvent.get(activationEvent);
        if (pending) {
            return pending;
        }
        this.activationEvents.add(activationEvent);
        const activation = this.doActivateByEvent(activationEvent);
        this.activationsByEvent.set(activationEvent, activation);
        activation.catch(() => {
            if (this.activationsByEvent.get(activationEvent) === activation) {
                this.activationsByEvent.delete(activationEvent);
            }
        });
        return activation;
    }

    protected async doActivateByEvent(activationEvent: string): Promise<void> {
        if (this.deferredManagers.state === 'unresolved') {
            await this.deferredManagers.promise;
        }
        await Promise.all(Array.from(this.managers.values(), manager => manager.$activateByEvent(activationEvent)));
    }

    /**
     * Whether any plugin declares the given activation event, so that the plugins activated by it may be awaited.
     * This includes the activation events implied by a plugin's contributions, e.g. of commands and views.
     *
     * @param activationEvent the activation event
     * @returns whether some plugin is activated by the event
     */
    protected hasActivationEvent(activationEvent: string): boolean {
        for (const { plugin } of this.contributions.values()) {
            if (plugin.contributes?.activationEvents?.includes(activationEvent)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Handle the loss of the connection to the plugin hosts of a load: the activations awaiting their managers are
     * rejected, and the managers of the next load are awaited instead. That load replays all requested activation
     * events on start.
     *
     * @param managers the managers awaited by the load whose connection was lost
     */
    protected disconnectManagers(managers: Deferred<void>): void {
        if (this.deferredManagers === managers) {
            this.deferredManagers = new Deferred<void>();
            managers.promise.catch(() => { /* reported to the activations awaiting the managers, if any */ });
            managers.reject(new Error('The connection to the plugin hosts was lost before the plugins were started.'));
        }
    }

    async activatePlugin(id: string): Promise<void> {
        const activation = [];
        for (const manager of this.managers.values()) {
            activation.push(manager.$activatePlugin(id));
        }
        await Promise.all(activation);
    }

    protected handlePluginStarted(manager: PM, plugin: DeployedPlugin): void {
        // Nothing to do in the abstract
    }

    protected measure(name: string): Measurement {
        return this.stopwatch.start(name, { context: this.clientId });
    }

    protected getPluginCount(plugins: number): string {
        return `${plugins} plugin${plugins === 1 ? '' : 's'}`;
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
