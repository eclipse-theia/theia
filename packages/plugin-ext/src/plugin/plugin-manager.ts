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

import {
    PLUGIN_RPC_CONTEXT,
    MAIN_RPC_CONTEXT,
    PluginManagerExt,
    PluginInitData,
    PluginManager,
    Plugin,
    PluginAPI,
    ConfigStorage
} from '../api/plugin-api';
import { PluginMetadata } from '../common/plugin-protocol';
import * as theia from '@theia/plugin';
import { join } from 'path';
import { dispose } from '../common/disposable-util';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvExtImpl } from './env';
import { PreferenceRegistryExtImpl } from './preference-registry';
import { Memento, KeyValueStorageProxy } from './plugin-storage';
import { ExtPluginApi } from '../common/plugin-ext-api-contribution';
import { RPCProtocol } from '../api/rpc-protocol';

export interface PluginHost {

    // tslint:disable-next-line:no-any
    loadPlugin(plugin: Plugin): any;

    init(data: PluginMetadata[]): [Plugin[], Plugin[]];

    initExtApi(extApi: ExtPluginApi[]): void;
}

interface StopFn {
    (): void;
}

class ActivatedPlugin {
    constructor(public readonly pluginContext: theia.PluginContext,
        public readonly exports?: PluginAPI,
        public readonly stopFn?: StopFn) {
    }
}

export class PluginManagerExtImpl implements PluginManagerExt, PluginManager {

    private registry = new Map<string, Plugin>();
    private activatedPlugins = new Map<string, ActivatedPlugin>();
    private pluginActivationPromises = new Map<string, Deferred<void>>();
    private pluginContextsMap: Map<string, theia.PluginContext> = new Map();
    private storageProxy: KeyValueStorageProxy;

    constructor(
        private readonly host: PluginHost,
        private readonly envExt: EnvExtImpl,
        private readonly preferencesManager: PreferenceRegistryExtImpl,
        private readonly rpc: RPCProtocol
    ) { }

    $stopPlugin(contextPath: string): PromiseLike<void> {
        this.activatedPlugins.forEach(plugin => {
            if (plugin.stopFn) {
                plugin.stopFn();
            }

            // dispose any objects
            const pluginContext = plugin.pluginContext;
            if (pluginContext) {
                dispose(pluginContext.subscriptions);
            }
        });
        return Promise.resolve();
    }

    $init(pluginInit: PluginInitData, configStorage: ConfigStorage): PromiseLike<void> {
        this.storageProxy = this.rpc.set(
            MAIN_RPC_CONTEXT.STORAGE_EXT,
            new KeyValueStorageProxy(this.rpc.getProxy(PLUGIN_RPC_CONTEXT.STORAGE_MAIN),
                                     pluginInit.globalState,
                                     pluginInit.workspaceState)
        );

        // init query parameters
        this.envExt.setQueryParameters(pluginInit.env.queryParams);

        this.preferencesManager.init(pluginInit.preferences);

        if (pluginInit.extApi) {
            this.host.initExtApi(pluginInit.extApi);
        }

        const [plugins, foreignPlugins] = this.host.init(pluginInit.plugins);
        // add foreign plugins
        for (const plugin of foreignPlugins) {
            this.registry.set(plugin.model.id, plugin);
        }
        // add own plugins, before initialization
        for (const plugin of plugins) {
            this.registry.set(plugin.model.id, plugin);
        }

        // run plugins
        for (const plugin of plugins) {
            const pluginMain = this.host.loadPlugin(plugin);
            // able to load the plug-in ?
            if (pluginMain !== undefined) {
                this.startPlugin(plugin, configStorage, pluginMain);
            } else {
                return Promise.reject(new Error('Unable to load the given plugin'));
            }
        }

        return Promise.resolve();
    }

    $updateStoragePath(path: string | undefined): PromiseLike<void> {
        this.pluginContextsMap.forEach((pluginContext: theia.PluginContext, pluginId: string) => {
            pluginContext.storagePath = path ? join(path, pluginId) : undefined;
        });
        return Promise.resolve();
    }

    // tslint:disable-next-line:no-any
    private startPlugin(plugin: Plugin, configStorage: ConfigStorage, pluginMain: any): void {
        const subscriptions: theia.Disposable[] = [];
        const asAbsolutePath = (relativePath: string): string => join(plugin.pluginFolder, relativePath);
        const logPath = join(configStorage.hostLogPath, plugin.model.id); // todo check format
        const storagePath = join(configStorage.hostStoragePath, plugin.model.id);
        const pluginContext: theia.PluginContext = {
            extensionPath: plugin.pluginFolder,
            globalState: new Memento(plugin.model.id, true, this.storageProxy),
            workspaceState: new Memento(plugin.model.id, false, this.storageProxy),
            subscriptions: subscriptions,
            asAbsolutePath: asAbsolutePath,
            logPath: logPath,
            storagePath: storagePath,
        };
        this.pluginContextsMap.set(plugin.model.id, pluginContext);

        let stopFn = undefined;
        if (typeof pluginMain[plugin.lifecycle.stopMethod] === 'function') {
            stopFn = pluginMain[plugin.lifecycle.stopMethod];
        }
        if (typeof pluginMain[plugin.lifecycle.startMethod] === 'function') {
            const pluginExport = pluginMain[plugin.lifecycle.startMethod].apply(getGlobal(), [pluginContext]);
            this.activatedPlugins.set(plugin.model.id, new ActivatedPlugin(pluginContext, pluginExport, stopFn));

            // resolve activation promise
            if (this.pluginActivationPromises.has(plugin.model.id)) {
                this.pluginActivationPromises.get(plugin.model.id)!.resolve();
                this.pluginActivationPromises.delete(plugin.model.id);
            }
        } else {
            console.log(`There is no ${plugin.lifecycle.startMethod} method on plugin`);
        }
    }

    getAllPlugins(): Plugin[] {
        return Array.from(this.registry.values());
    }
    getPluginExport(pluginId: string): PluginAPI | undefined {
        const activePlugin = this.activatedPlugins.get(pluginId);
        if (activePlugin) {
            return activePlugin.exports;
        }
        return undefined;
    }

    getPluginById(pluginId: string): Plugin | undefined {
        return this.registry.get(pluginId);
    }

    isRunning(pluginId: string): boolean {
        return this.registry.has(pluginId);
    }

    activatePlugin(pluginId: string): PromiseLike<void> {
        if (this.pluginActivationPromises.has(pluginId)) {
            return this.pluginActivationPromises.get(pluginId)!.promise;
        }

        const deferred = new Deferred<void>();
        this.pluginActivationPromises.set(pluginId, deferred);
        return deferred.promise;
    }

}

// for electron
function getGlobal() {
    // tslint:disable-next-line:no-null-keyword
    return typeof self === 'undefined' ? typeof global === 'undefined' ? null : global : self;
}
