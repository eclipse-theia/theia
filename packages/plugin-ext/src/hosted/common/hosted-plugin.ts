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
import { injectable, inject, interfaces, named, postConstruct } from '@theia/core/shared/inversify';
import { PluginMetadata, HostedPluginServer, DeployedPlugin, PluginServer, PluginIdentifiers } from '../../common/plugin-protocol';
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

export type PluginHost = 'frontend' | string;

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

    @inject(ILogger)
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

    constructor(protected readonly clientId: string) { }

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
            console.error('Failed to load plugins:', e);
        }
    }), 50, { leading: true });

    protected runOperation(operation: () => Promise<void>): Promise<void> {
        return operation();
    }

    protected async doLoad(): Promise<void> {
        const toDisconnect = new DisposableCollection(Disposable.create(() => { /* mark as connected */ }));

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
                const deployedPlugins = await this.server.getDeployedPlugins({ pluginIds: newPluginIds });

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
        console.log(`[${this.clientId}] Loading plugin contributions`);
        for (const contributions of this.contributions.values()) {
            const plugin = contributions.plugin.metadata;
            const pluginId = plugin.model.id;

            if (contributions.state === PluginContributions.State.INITIALIZING) {
                contributions.state = PluginContributions.State.LOADING;
                contributions.push(Disposable.create(() => console.log(`[${pluginId}]: Unloaded plugin.`)));
                contributions.push(this.handleContributions(contributions.plugin));
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

                        this.handlePluginStarted(manager, plugin);
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

    async activateByEvent(activationEvent: string): Promise<void> {
        if (this.activationEvents.has(activationEvent)) {
            return;
        }
        this.activationEvents.add(activationEvent);
        await Promise.all(Array.from(this.managers.values(), manager => manager.$activateByEvent(activationEvent)));
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
