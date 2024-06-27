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
// eslint-disable-next-line import/no-extraneous-dependencies
import 'reflect-metadata';
import { Container } from '@theia/core/shared/inversify';
import * as theia from '@theia/plugin';
import { emptyPlugin, MAIN_RPC_CONTEXT, Plugin } from '../../../common/plugin-api-rpc';
import { ExtPluginApi } from '../../../common/plugin-ext-api-contribution';
import { getPluginId, PluginMetadata } from '../../../common/plugin-protocol';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { ClipboardExt } from '../../../plugin/clipboard-ext';
import { EditorsAndDocumentsExtImpl } from '../../../plugin/editors-and-documents';
import { MessageRegistryExt } from '../../../plugin/message-registry';
import { createAPIFactory } from '../../../plugin/plugin-context';
import { PluginManagerExtImpl } from '../../../plugin/plugin-manager';
import { KeyValueStorageProxy } from '../../../plugin/plugin-storage';
import { PreferenceRegistryExtImpl } from '../../../plugin/preference-registry';
import { WebviewsExtImpl } from '../../../plugin/webviews';
import { WorkspaceExtImpl } from '../../../plugin/workspace';
import { loadManifest } from './plugin-manifest-loader';
import { EnvExtImpl } from '../../../plugin/env';
import { DebugExtImpl } from '../../../plugin/debug/debug-ext';
import { LocalizationExtImpl } from '../../../plugin/localization-ext';
import pluginHostModule from './worker-plugin-module';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as any;

const pluginsApiImpl = new Map<string, typeof theia>();
const pluginsModulesNames = new Map<string, Plugin>();

const scripts = new Set<string>();

function initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
    const path = './context/' + contextPath;

    if (!scripts.has(path)) {
        ctx.importScripts(path);
        scripts.add(path);
    }
}

const container = new Container();
container.load(pluginHostModule);

const rpc: RPCProtocol = container.get(RPCProtocol);
const pluginManager = container.get(PluginManagerExtImpl);
pluginManager.setPluginHost({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loadPlugin(plugin: Plugin): any {
            if (plugin.pluginPath) {
                if (isElectron()) {
                    ctx.importScripts(plugin.pluginPath);
                } else {
                    if (plugin.lifecycle.frontendModuleName) {
                        // Set current module name being imported
                        ctx.frontendModuleName = plugin.lifecycle.frontendModuleName;
                    }

                    ctx.importScripts('./hostedPlugin/' + getPluginId(plugin.model) + '/' + plugin.pluginPath);
                }
            }

            if (plugin.lifecycle.frontendModuleName) {
                if (!ctx[plugin.lifecycle.frontendModuleName]) {
                    console.error(`WebWorker: Cannot start plugin "${plugin.model.name}". Frontend plugin not found: "${plugin.lifecycle.frontendModuleName}"`);
                    return;
                }
                return ctx[plugin.lifecycle.frontendModuleName];
            }
        },
        async init(rawPluginData: PluginMetadata[]): Promise<[Plugin[], Plugin[]]> {
            const result: Plugin[] = [];
            const foreign: Plugin[] = [];
            // Process the plugins concurrently, making sure to keep the order.
            const plugins = await Promise.all<{
                /** Where to push the plugin: `result` or `foreign` */
                target: Plugin[],
                plugin: Plugin
            }>(rawPluginData.map(async plg => {
                const pluginModel = plg.model;
                const pluginLifecycle = plg.lifecycle;
                if (pluginModel.entryPoint!.frontend) {
                    let frontendInitPath = pluginLifecycle.frontendInitPath;
                    if (frontendInitPath) {
                        initialize(frontendInitPath, plg);
                    } else {
                        frontendInitPath = '';
                    }
                    const rawModel = await loadManifest(pluginModel);
                    const plugin: Plugin = {
                        pluginPath: pluginModel.entryPoint.frontend!,
                        pluginFolder: pluginModel.packagePath,
                        pluginUri: pluginModel.packageUri,
                        model: pluginModel,
                        lifecycle: pluginLifecycle,
                        rawModel,
                        isUnderDevelopment: !!plg.isUnderDevelopment
                    };
                    const apiImpl = apiFactory(plugin);
                    pluginsApiImpl.set(plugin.model.id, apiImpl);
                    pluginsModulesNames.set(plugin.lifecycle.frontendModuleName!, plugin);
                    return { target: result, plugin };
                } else {
                    return {
                        target: foreign,
                        plugin: {
                            pluginPath: pluginModel.entryPoint.backend,
                            pluginFolder: pluginModel.packagePath,
                            pluginUri: pluginModel.packageUri,
                            model: pluginModel,
                            lifecycle: pluginLifecycle,
                            get rawModel(): never {
                                throw new Error('not supported');
                            },
                            isUnderDevelopment: !!plg.isUnderDevelopment
                        }
                    };
                }
            }));
            // Collect the ordered plugins and insert them in the target array:
            for (const { target, plugin } of plugins) {
                target.push(plugin);
            }
            return [result, foreign];
        },
        initExtApi(extApi: ExtPluginApi[]): void {
            for (const api of extApi) {
                try {
                    if (api.frontendExtApi) {
                        ctx.importScripts(api.frontendExtApi.initPath);
                        ctx[api.frontendExtApi.initVariable][api.frontendExtApi.initFunction](rpc, pluginsModulesNames);
                    }

                } catch (e) {
                    console.error(e);
                }
            }
        }
    });

const envExt = container.get(EnvExtImpl);
const debugExt = container.get(DebugExtImpl);
const preferenceRegistryExt = container.get(PreferenceRegistryExtImpl);
const editorsAndDocuments = container.get(EditorsAndDocumentsExtImpl);
const workspaceExt = container.get(WorkspaceExtImpl);
const messageRegistryExt = container.get(MessageRegistryExt);
const clipboardExt = container.get(ClipboardExt);
const webviewExt = container.get(WebviewsExtImpl);
const localizationExt = container.get(LocalizationExtImpl);
const storageProxy = container.get(KeyValueStorageProxy);

const apiFactory = createAPIFactory(
    rpc,
    pluginManager,
    envExt,
    debugExt,
    preferenceRegistryExt,
    editorsAndDocuments,
    workspaceExt,
    messageRegistryExt,
    clipboardExt,
    webviewExt,
    localizationExt
);
let defaultApi: typeof theia;

const handler = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (target: any, name: string) => {
        const plugin = pluginsModulesNames.get(name);
        if (plugin) {
            const apiImpl = pluginsApiImpl.get(plugin.model.id);
            return apiImpl;
        }

        if (!defaultApi) {
            defaultApi = apiFactory(emptyPlugin);
        }

        return defaultApi;
    }
};
ctx['theia'] = new Proxy(Object.create(null), handler);

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, pluginManager);
rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, editorsAndDocuments);
rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, workspaceExt);
rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, preferenceRegistryExt);
rpc.set(MAIN_RPC_CONTEXT.STORAGE_EXT, storageProxy);
rpc.set(MAIN_RPC_CONTEXT.WEBVIEWS_EXT, webviewExt);

function isElectron(): boolean {
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}
