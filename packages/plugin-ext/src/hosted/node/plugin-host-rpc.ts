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

import { dynamicRequire, removeFromCache } from '@theia/core/lib/node/dynamic-require';
import { PluginManagerExtImpl } from '../../plugin/plugin-manager';
import { LocalizationExt, MAIN_RPC_CONTEXT, Plugin, PluginAPIFactory } from '../../common/plugin-api-rpc';
import { PluginMetadata } from '../../common/plugin-protocol';
import { createAPIFactory } from '../../plugin/plugin-context';
import { EnvExtImpl } from '../../plugin/env';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';
import { ExtPluginApi, ExtPluginApiBackendInitializationFn } from '../../common/plugin-ext-api-contribution';
import { DebugExtImpl } from '../../plugin/debug/debug-ext';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../plugin/workspace';
import { MessageRegistryExt } from '../../plugin/message-registry';
import { EnvNodeExtImpl } from '../../plugin/node/env-node-ext';
import { ClipboardExt } from '../../plugin/clipboard-ext';
import { loadManifest } from './plugin-manifest-loader';
import { KeyValueStorageProxy } from '../../plugin/plugin-storage';
import { WebviewsExtImpl } from '../../plugin/webviews';
import { TerminalServiceExtImpl } from '../../plugin/terminal-ext';
import { SecretsExtImpl } from '../../plugin/secrets-ext';
import { BackendInitializationFn } from '../../common';
import { connectProxyResolver } from './plugin-host-proxy';
import { LocalizationExtImpl } from '../../plugin/localization-ext';

/**
 * Handle the RPC calls.
 */
export class PluginHostRPC {

    private apiFactory: PluginAPIFactory;

    private pluginManager: PluginManagerExtImpl;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const terminalService = new TerminalServiceExtImpl(this.rpc);
        const secretsExt = new SecretsExtImpl(this.rpc);
        const localizationExt = new LocalizationExtImpl(this.rpc);
        this.pluginManager = this.createPluginManager(envExt, terminalService, storageProxy, preferenceRegistryExt, webviewExt, secretsExt, localizationExt, this.rpc);
        this.rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, this.pluginManager);
        this.rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, editorsAndDocumentsExt);
        this.rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, workspaceExt);
        this.rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, preferenceRegistryExt);
        this.rpc.set(MAIN_RPC_CONTEXT.STORAGE_EXT, storageProxy);
        this.rpc.set(MAIN_RPC_CONTEXT.WEBVIEWS_EXT, webviewExt);
        this.rpc.set(MAIN_RPC_CONTEXT.SECRETS_EXT, secretsExt);

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
            webviewExt,
            localizationExt
        );
        connectProxyResolver(workspaceExt, preferenceRegistryExt);
    }

    async terminate(): Promise<void> {
        await this.pluginManager.terminate();
    }

    initContext(contextPath: string, plugin: Plugin): void {
        const { name, version } = plugin.rawModel;
        console.debug('PLUGIN_HOST(' + process.pid + '): initializing(' + name + '@' + version + ' with ' + contextPath + ')');
        try {
            const backendInit = dynamicRequire<{ doInitialization: BackendInitializationFn }>(contextPath);
            backendInit.doInitialization(this.apiFactory, plugin);
        } catch (e) {
            console.error(e);
        }
    }

    createPluginManager(
        envExt: EnvExtImpl, terminalService: TerminalServiceExtImpl, storageProxy: KeyValueStorageProxy,
        preferencesManager: PreferenceRegistryExtImpl, webview: WebviewsExtImpl, secretsExt: SecretsExtImpl, localization: LocalizationExt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rpc: any
    ): PluginManagerExtImpl {
        const { extensionTestsPath } = process.env;
        const self = this;
        const pluginManager = new PluginManagerExtImpl({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loadPlugin(plugin: Plugin): any {
                console.debug('PLUGIN_HOST(' + process.pid + '): PluginManagerExtImpl/loadPlugin(' + plugin.pluginPath + ')');
                // cleaning the cache for all files of that plug-in.
                // this prevents a memory leak on plugin host restart. See for reference:
                // https://github.com/eclipse-theia/theia/pull/4931
                // https://github.com/nodejs/node/issues/8443
                removeFromCache(mod => mod.id.startsWith(plugin.pluginFolder));
                if (plugin.pluginPath) {
                    return dynamicRequire(plugin.pluginPath);
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
                                pluginUri: pluginModel.packageUri,
                                model: pluginModel,
                                lifecycle: pluginLifecycle,
                                rawModel,
                                isUnderDevelopment: !!plg.isUnderDevelopment
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
                                pluginUri: pluginModel.packageUri,
                                model: pluginModel,
                                lifecycle: pluginLifecycle,
                                rawModel,
                                isUnderDevelopment: !!plg.isUnderDevelopment
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
                            const extApiInit = dynamicRequire<{ provideApi: ExtPluginApiBackendInitializationFn }>(api.backendInitPath);
                            extApiInit.provideApi(rpc, pluginManager);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            },
            loadTests: extensionTestsPath ? async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any */
                // Require the test runner via node require from the provided path
                let testRunner: any;
                let requireError: Error | undefined;
                try {
                    testRunner = dynamicRequire(extensionTestsPath);
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
        }, envExt, terminalService, storageProxy, secretsExt, preferencesManager, webview, localization, rpc);
        return pluginManager;
    }
}
