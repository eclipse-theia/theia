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

import { PluginManagerExtImpl } from '../../plugin/plugin-manager';
import { MAIN_RPC_CONTEXT, Plugin, PluginAPIFactory } from '../../common/plugin-api-rpc';
import { PluginMetadata } from '../../common/plugin-protocol';
import { createAPIFactory } from '../../plugin/plugin-context';
import { EnvExtImpl } from '../../plugin/env';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';
import { ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { DebugExtImpl } from '../../plugin/node/debug/debug';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../plugin/workspace';
import { MessageRegistryExt } from '../../plugin/message-registry';
import { EnvNodeExtImpl } from '../../plugin/node/env-node-ext';
import { ClipboardExt } from '../../plugin/clipboard-ext';
import { loadManifest } from './plugin-manifest-loader';
import { KeyValueStorageProxy } from '../../plugin/plugin-storage';
import { WebviewsExtImpl } from '../../plugin/webviews';

/**
 * Handle the RPC calls.
 */
export class PluginHostRPC {

    private apiFactory: PluginAPIFactory;

    private pluginManager: PluginManagerExtImpl;

    // tslint:disable-next-line:no-any
    constructor(protected readonly rpc: any) {
    }

    initialize(): void {
        const envExt = new EnvNodeExtImpl(this.rpc);
        const storageProxy = new KeyValueStorageProxy(this.rpc);
        const debugExt = new DebugExtImpl(this.rpc);
        const editorsAndDocumentsExt = new EditorsAndDocumentsExtImpl(this.rpc);
        const messageRegistryExt = new MessageRegistryExt(this.rpc);
        const workspaceExt = new WorkspaceExtImpl(this.rpc, editorsAndDocumentsExt, messageRegistryExt);
        const preferenceRegistryExt = new PreferenceRegistryExtImpl(this.rpc, workspaceExt);
        const clipboardExt = new ClipboardExt(this.rpc);
        const webviewExt = new WebviewsExtImpl(this.rpc, workspaceExt);
        this.pluginManager = this.createPluginManager(envExt, storageProxy, preferenceRegistryExt, webviewExt, this.rpc);
        this.rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, this.pluginManager);
        this.rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, editorsAndDocumentsExt);
        this.rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, workspaceExt);
        this.rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, preferenceRegistryExt);
        this.rpc.set(MAIN_RPC_CONTEXT.STORAGE_EXT, storageProxy);
        this.rpc.set(MAIN_RPC_CONTEXT.WEBVIEWS_EXT, webviewExt);

        this.apiFactory = createAPIFactory(
            this.rpc,
            this.pluginManager,
            envExt,
            debugExt,
            preferenceRegistryExt,
            editorsAndDocumentsExt,
            workspaceExt,
            messageRegistryExt,
            clipboardExt,
            webviewExt
        );
    }

    // tslint:disable-next-line:no-any
    initContext(contextPath: string, plugin: Plugin): any {
        const { name, version } = plugin.rawModel;
        console.log('PLUGIN_HOST(' + process.pid + '): initializing(' + name + '@' + version + ' with ' + contextPath + ')');
        try {
            const backendInit = require(contextPath);
            backendInit.doInitialization(this.apiFactory, plugin);
        } catch (e) {
            console.error(e);
        }
    }

    createPluginManager(
        envExt: EnvExtImpl, storageProxy: KeyValueStorageProxy, preferencesManager: PreferenceRegistryExtImpl, webview: WebviewsExtImpl,
        // tslint:disable-next-line:no-any
        rpc: any): PluginManagerExtImpl {
        const { extensionTestsPath } = process.env;
        const self = this;
        const pluginManager = new PluginManagerExtImpl({
            loadPlugin(plugin: Plugin): void {
                console.log('PLUGIN_HOST(' + process.pid + '): PluginManagerExtImpl/loadPlugin(' + plugin.pluginPath + ')');
                try {
                    // cleaning the cache for all files of that plug-in.
                    Object.keys(require.cache).forEach(function (key): void {
                        const mod: NodeJS.Module = require.cache[key];

                        // attempting to reload a native module will throw an error, so skip them
                        if (mod.id.endsWith('.node')) {
                            return;
                        }

                        // remove children that are part of the plug-in
                        let i = mod.children.length;
                        while (i--) {
                            const childMod: NodeJS.Module = mod.children[i];
                            // ensure the child module is not null, is in the plug-in folder, and is not a native module (see above)
                            if (childMod && childMod.id.startsWith(plugin.pluginFolder) && !childMod.id.endsWith('.node')) {
                                // cleanup exports - note that some modules (e.g. ansi-styles) define their
                                // exports in an immutable manner, so overwriting the exports throws an error
                                delete childMod.exports;
                                mod.children.splice(i, 1);
                                for (let j = 0; j < childMod.children.length; j++) {
                                    delete childMod.children[j];
                                }
                            }
                        }

                        if (key.startsWith(plugin.pluginFolder)) {
                            // delete entry
                            delete require.cache[key];
                            const ix = mod.parent!.children.indexOf(mod);
                            if (ix >= 0) {
                                mod.parent!.children.splice(ix, 1);
                            }
                        }

                    });
                    return require(plugin.pluginPath);
                } catch (e) {
                    console.error(e);
                }
            },
            async init(raw: PluginMetadata[]): Promise<[Plugin[], Plugin[]]> {
                console.log('PLUGIN_HOST(' + process.pid + '): PluginManagerExtImpl/init()');
                const result: Plugin[] = [];
                const foreign: Plugin[] = [];
                for (const plg of raw) {
                    try {
                        const pluginModel = plg.model;
                        const pluginLifecycle = plg.lifecycle;

                        const rawModel = await loadManifest(pluginModel.packagePath);
                        rawModel.packagePath = pluginModel.packagePath;
                        if (pluginModel.entryPoint!.frontend) {
                            foreign.push({
                                pluginPath: pluginModel.entryPoint.frontend!,
                                pluginFolder: pluginModel.packagePath,
                                model: pluginModel,
                                lifecycle: pluginLifecycle,
                                rawModel
                            });
                        } else {
                            let backendInitPath = pluginLifecycle.backendInitPath;
                            // if no init path, try to init as regular Theia plugin
                            if (!backendInitPath) {
                                backendInitPath = __dirname + '/scanners/backend-init-theia.js';
                            }

                            const plugin: Plugin = {
                                pluginPath: pluginModel.entryPoint.backend!,
                                pluginFolder: pluginModel.packagePath,
                                model: pluginModel,
                                lifecycle: pluginLifecycle,
                                rawModel
                            };

                            self.initContext(backendInitPath, plugin);

                            result.push(plugin);
                        }
                    } catch (e) {
                        console.error(`Failed to initialize ${plg.model.id} plugin.`, e);
                    }
                }
                return [result, foreign];
            },
            initExtApi(extApi: ExtPluginApi[]): void {
                for (const api of extApi) {
                    if (api.backendInitPath) {
                        try {
                            const extApiInit = require(api.backendInitPath);
                            extApiInit.provideApi(rpc, pluginManager);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            },
            loadTests: extensionTestsPath ? async () => {
                // tslint:disable:no-any
                // Require the test runner via node require from the provided path
                let testRunner: any;
                let requireError: Error | undefined;
                try {
                    testRunner = require(extensionTestsPath);
                } catch (error) {
                    requireError = error;
                }

                // Execute the runner if it follows our spec
                if (testRunner && typeof testRunner.run === 'function') {
                    return new Promise<void>((resolve, reject) => {
                        testRunner.run(extensionTestsPath, (error: any) => {
                            if (error) {
                                reject(error.toString());
                            } else {
                                resolve(undefined);
                            }
                        });
                    });
                }
                throw new Error(requireError ?
                    requireError.toString() :
                    `Path ${extensionTestsPath} does not point to a valid extension test runner.`
                );
            } : undefined
        }, envExt, storageProxy, preferencesManager, webview, rpc);
        return pluginManager;
    }
}
