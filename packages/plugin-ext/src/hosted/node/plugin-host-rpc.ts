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
import { MAIN_RPC_CONTEXT, Plugin, PluginAPIFactory } from '../../api/plugin-api';
import { PluginMetadata } from '../../common/plugin-protocol';
import { createAPIFactory } from '../../plugin/plugin-context';
import { EnvExtImpl } from '../../plugin/env';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';
import { ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { DebugExtImpl } from '../../plugin/node/debug/debug';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../plugin/workspace';
import { MessageRegistryExt } from '../../plugin/message-registry';

/**
 * Handle the RPC calls.
 */
export class PluginHostRPC {

    private apiFactory: PluginAPIFactory;

    private pluginManager: PluginManagerExtImpl;

    // tslint:disable-next-line:no-any
    constructor(protected readonly rpc: any) {
    }

    initialize() {
        const envExt = new EnvExtImpl(this.rpc);
        const debugExt = new DebugExtImpl(this.rpc);
        const editorsAndDocumentsExt = new EditorsAndDocumentsExtImpl(this.rpc);
        const messageRegistryExt = new MessageRegistryExt(this.rpc);
        const workspaceExt = new WorkspaceExtImpl(this.rpc, editorsAndDocumentsExt, messageRegistryExt);
        const preferenceRegistryExt = new PreferenceRegistryExtImpl(this.rpc, workspaceExt);
        this.pluginManager = this.createPluginManager(envExt, preferenceRegistryExt, this.rpc);
        this.rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, this.pluginManager);
        this.rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, editorsAndDocumentsExt);
        this.rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, workspaceExt);
        this.rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, preferenceRegistryExt);

        this.apiFactory = createAPIFactory(
            this.rpc,
            this.pluginManager,
            envExt,
            debugExt,
            preferenceRegistryExt,
            editorsAndDocumentsExt,
            workspaceExt,
            messageRegistryExt
        );
    }

    // tslint:disable-next-line:no-any
    initContext(contextPath: string, plugin: Plugin): any {
        console.log('PLUGIN_HOST(' + process.pid + '): initializing(' + contextPath + ')');
        try {
            const backendInit = require(contextPath);
            backendInit.doInitialization(this.apiFactory, plugin);
        } catch (e) {
            console.error(e);
        }
    }

    /*
     * Stop the given context by calling the plug-in manager.
     * note: stopPlugin can also be invoked through RPC proxy.
     */
    stopContext(): PromiseLike<void> {
        return this.pluginManager.$stopPlugin('');
    }

    // tslint:disable-next-line:no-any
    createPluginManager(envExt: EnvExtImpl, preferencesManager: PreferenceRegistryExtImpl, rpc: any): PluginManagerExtImpl {
        const { extensionTestsPath } = process.env;
        const self = this;
        const pluginManager = new PluginManagerExtImpl({
            loadPlugin(plugin: Plugin): void {
                console.log('PLUGIN_HOST(' + process.pid + '): PluginManagerExtImpl/loadPlugin(' + plugin.pluginPath + ')');
                try {
                    // cleaning the cache for all files of that plug-in.
                    Object.keys(require.cache).forEach(key => {
                        if (key.startsWith(plugin.pluginFolder)) {
                            // delete entry
                            delete require.cache[key];
                        }
                    });
                    return require(plugin.pluginPath);
                } catch (e) {
                    console.error(e);
                }
            },
            init(raw: PluginMetadata[]): [Plugin[], Plugin[]] {
                console.log('PLUGIN_HOST(' + process.pid + '): PluginManagerExtImpl/init()');
                const result: Plugin[] = [];
                const foreign: Plugin[] = [];
                for (const plg of raw) {
                    const pluginModel = plg.model;
                    const pluginLifecycle = plg.lifecycle;
                    if (pluginModel.entryPoint!.backend) {

                        let backendInitPath = pluginLifecycle.backendInitPath;
                        // if no init path, try to init as regular Theia plugin
                        if (!backendInitPath) {
                            backendInitPath = __dirname + '/scanners/backend-init-theia.js';
                        }

                        const plugin: Plugin = {
                            pluginPath: pluginModel.entryPoint.backend!,
                            pluginFolder: plg.source.packagePath,
                            model: pluginModel,
                            lifecycle: pluginLifecycle,
                            rawModel: plg.source
                        };

                        self.initContext(backendInitPath, plugin);

                        result.push(plugin);
                    } else {
                        foreign.push({
                            pluginPath: pluginModel.entryPoint.frontend!,
                            pluginFolder: plg.source.packagePath,
                            model: pluginModel,
                            lifecycle: pluginLifecycle,
                            rawModel: plg.source
                        });
                    }
                }
                return [result, foreign];
            },
            initExtApi(extApi: ExtPluginApi[]) {
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
        }, envExt, preferencesManager, rpc);
        return pluginManager;
    }
}
