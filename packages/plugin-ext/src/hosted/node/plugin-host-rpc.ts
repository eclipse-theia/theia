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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { dynamicRequire, removeFromCache } from '@theia/core/lib/node/dynamic-require';
import { ContainerModule, inject, injectable, postConstruct, unmanaged } from '@theia/core/shared/inversify';
import { AbstractPluginManagerExtImpl, PluginHost, PluginManagerExtImpl } from '../../plugin/plugin-manager';
import { MAIN_RPC_CONTEXT, Plugin, PluginAPIFactory, PluginManager,
    LocalizationExt
} from '../../common/plugin-api-rpc';
import { PluginMetadata, PluginModel } from '../../common/plugin-protocol';
import { createAPIFactory } from '../../plugin/plugin-context';
import { EnvExtImpl } from '../../plugin/env';
import { PreferenceRegistryExtImpl } from '../../plugin/preference-registry';
import { ExtPluginApi, ExtPluginApiBackendInitializationFn } from '../../common/plugin-ext-api-contribution';
import { DebugExtImpl } from '../../plugin/debug/debug-ext';
import { EditorsAndDocumentsExtImpl } from '../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../plugin/workspace';
import { MessageRegistryExt } from '../../plugin/message-registry';
import { ClipboardExt } from '../../plugin/clipboard-ext';
import { loadManifest } from './plugin-manifest-loader';
import { KeyValueStorageProxy } from '../../plugin/plugin-storage';
import { WebviewsExtImpl } from '../../plugin/webviews';
import { TerminalServiceExtImpl } from '../../plugin/terminal-ext';
import { SecretsExtImpl } from '../../plugin/secrets-ext';
import { connectProxyResolver } from './plugin-host-proxy';
import { LocalizationExtImpl } from '../../plugin/localization-ext';
import { RPCProtocol, ProxyIdentifier } from '../../common/rpc-protocol';
import { PluginApiCache } from '../../plugin/node/plugin-container-module';

/**
 * The full set of all possible `Ext` interfaces that a plugin manager can support.
 */
export interface ExtInterfaces {
    envExt: EnvExtImpl,
    storageExt: KeyValueStorageProxy,
    debugExt: DebugExtImpl,
    editorsAndDocumentsExt: EditorsAndDocumentsExtImpl,
    messageRegistryExt: MessageRegistryExt,
    workspaceExt: WorkspaceExtImpl,
    preferenceRegistryExt: PreferenceRegistryExtImpl,
    clipboardExt: ClipboardExt,
    webviewExt: WebviewsExtImpl,
    terminalServiceExt: TerminalServiceExtImpl,
    secretsExt: SecretsExtImpl,
    localizationExt: LocalizationExtImpl
}

/**
 * The RPC proxy identifier keys to set in the RPC object to register our `Ext` interface implementations.
 */
export type RpcKeys<EXT extends Partial<ExtInterfaces>> = Partial<Record<keyof EXT, ProxyIdentifier<any>>> & {
    $pluginManager: ProxyIdentifier<any>;
};

export const PluginContainerModuleLoader = Symbol('PluginContainerModuleLoader');
/**
 * A function that loads a `PluginContainerModule` exported by a plugin's entry-point
 * script, returning the per-`Container` cache of its exported API instances if the
 * module has an API factory registered.
 */
export type PluginContainerModuleLoader = (module: ContainerModule) => PluginApiCache<object> | undefined;

/**
 * Handle the RPC calls.
 *
 * @template PM is the plugin manager (ext) type
 * @template PAF is the plugin API factory type
 * @template EXT is the type identifying the `Ext` interfaces supported by the plugin manager
 */
@injectable()
export abstract class AbstractPluginHostRPC<PM extends AbstractPluginManagerExtImpl<any>, PAF, EXT extends Partial<ExtInterfaces>> {

    @inject(RPCProtocol)
    protected readonly rpc: any;

    @inject(PluginContainerModuleLoader)
    protected readonly loadContainerModule: PluginContainerModuleLoader;

    @inject(AbstractPluginManagerExtImpl)
    protected readonly pluginManager: PM;

    protected readonly banner: string;

    protected apiFactory: PAF;

    constructor(
        @unmanaged() name: string,
        @unmanaged() private readonly backendInitPath: string | undefined,
        @unmanaged() private readonly extRpc: RpcKeys<EXT>) {
        this.banner = `${name}(${process.pid}):`;
    }

    @postConstruct()
    initialize(): void {
        this.pluginManager.setPluginHost(this.createPluginHost());

        const extInterfaces = this.createExtInterfaces();
        this.registerExtInterfaces(extInterfaces);

        this.apiFactory = this.createAPIFactory(extInterfaces);

        this.loadContainerModule(new ContainerModule(bind => bind(PluginManager).toConstantValue(this.pluginManager)));
    }

    async terminate(): Promise<void> {
        await this.pluginManager.terminate();
    }

    protected abstract createAPIFactory(extInterfaces: EXT): PAF;

    protected abstract createExtInterfaces(): EXT;

    protected registerExtInterfaces(extInterfaces: EXT): void {
        for (const _key in this.extRpc) {
            if (Object.hasOwnProperty.call(this.extRpc, _key)) {
                const key = _key as keyof ExtInterfaces;
                // In case of present undefineds
                if (extInterfaces[key]) {
                    this.rpc.set(this.extRpc[key], extInterfaces[key]);
                }
            }
        }
        this.rpc.set(this.extRpc.$pluginManager, this.pluginManager);
    }

    initContext(contextPath: string, plugin: Plugin): void {
        const { name, version } = plugin.rawModel;
        console.debug(this.banner, 'initializing(' + name + '@' + version + ' with ' + contextPath + ')');
        try {
            type BackendInitFn = (pluginApiFactory: PAF, plugin: Plugin) => void;
            const backendInit = dynamicRequire<{ doInitialization: BackendInitFn }>(contextPath);
            backendInit.doInitialization(this.apiFactory, plugin);
        } catch (e) {
            console.error(e);
        }
    }

    protected getBackendPluginPath(pluginModel: PluginModel): string | undefined {
        return pluginModel.entryPoint.backend;
    }

    /**
     * Create the {@link PluginHost} that is required by my plugin manager ext interface to delegate
     * critical behaviour such as loading and initializing plugins to me.
     */
    createPluginHost(): PluginHost {
        const { extensionTestsPath } = process.env;
        const self = this;
        return {
            loadPlugin(plugin: Plugin): any {
                console.debug(self.banner, 'PluginManagerExtImpl/loadPlugin(' + plugin.pluginPath + ')');
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
                console.log(self.banner, 'PluginManagerExtImpl/init()');
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
                            // Headless and backend plugins are, for now, very similar
                            let backendInitPath = pluginLifecycle.backendInitPath;
                            // if no init path, try to init as regular Theia plugin
                            if (!backendInitPath && self.backendInitPath) {
                                backendInitPath = __dirname + self.backendInitPath;
                            }

                            const pluginPath = self.getBackendPluginPath(pluginModel);
                            const plugin: Plugin = {
                                pluginPath,
                                pluginFolder: pluginModel.packagePath,
                                pluginUri: pluginModel.packageUri,
                                model: pluginModel,
                                lifecycle: pluginLifecycle,
                                rawModel,
                                isUnderDevelopment: !!plg.isUnderDevelopment
                            };

                            if (backendInitPath) {
                                self.initContext(backendInitPath, plugin);
                            } else {
                                const { name, version } = plugin.rawModel;
                                console.debug(self.banner, 'initializing(' + name + '@' + version + ' without any default API)');
                            }
                            result.push(plugin);
                        }
                    } catch (e) {
                        console.error(self.banner, `Failed to initialize ${plg.model.id} plugin.`, e);
                    }
                }
                return [result, foreign];
            },
            initExtApi(extApi: ExtPluginApi[]): void {
                for (const api of extApi) {
                    try {
                        self.initExtApi(api);
                    } catch (e) {
                        console.error(e);
                    }
                }
            },
            loadTests: extensionTestsPath ? async () => {
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
        };
    }

    /**
     * Initialize the end of the given provided extension API applicable to the current plugin host.
     * Errors should be propagated to the caller.
     *
     * @param extApi the extension API to initialize, if appropriate
     * @throws if any error occurs in initializing the extension API
     */
     protected abstract initExtApi(extApi: ExtPluginApi): void;
}

/**
 * The RPC handler for frontend-connection-scoped plugins (Theia and VSCode plugins).
 */
@injectable()
export class PluginHostRPC extends AbstractPluginHostRPC<PluginManagerExtImpl, PluginAPIFactory, ExtInterfaces> {
    @inject(EnvExtImpl)
    protected readonly envExt: EnvExtImpl;

    @inject(LocalizationExt)
    protected readonly localizationExt: LocalizationExtImpl;

    @inject(KeyValueStorageProxy)
    protected readonly keyValueStorageProxy: KeyValueStorageProxy;

    @inject(DebugExtImpl)
    protected readonly debugExt: DebugExtImpl;

    @inject(EditorsAndDocumentsExtImpl)
    protected readonly editorsAndDocumentsExt: EditorsAndDocumentsExtImpl;

    @inject(MessageRegistryExt)
    protected readonly messageRegistryExt: MessageRegistryExt;

    @inject(WorkspaceExtImpl)
    protected readonly workspaceExt: WorkspaceExtImpl;

    @inject(PreferenceRegistryExtImpl)
    protected readonly preferenceRegistryExt: PreferenceRegistryExtImpl;

    @inject(ClipboardExt)
    protected readonly clipboardExt: ClipboardExt;

    @inject(WebviewsExtImpl)
    protected readonly webviewExt: WebviewsExtImpl;

    @inject(TerminalServiceExtImpl)
    protected readonly terminalServiceExt: TerminalServiceExtImpl;

    @inject(SecretsExtImpl)
    protected readonly secretsExt: SecretsExtImpl;

    constructor() {
        super('PLUGIN_HOST', '/scanners/backend-init-theia.js',
            {
                $pluginManager: MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT,
                editorsAndDocumentsExt: MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT,
                workspaceExt: MAIN_RPC_CONTEXT.WORKSPACE_EXT,
                preferenceRegistryExt: MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT,
                storageExt: MAIN_RPC_CONTEXT.STORAGE_EXT,
                webviewExt: MAIN_RPC_CONTEXT.WEBVIEWS_EXT,
                secretsExt: MAIN_RPC_CONTEXT.SECRETS_EXT
            }
        );
    }

    protected createExtInterfaces(): ExtInterfaces {
        connectProxyResolver(this.workspaceExt, this.preferenceRegistryExt);
        return {
            envExt: this.envExt,
            storageExt: this.keyValueStorageProxy,
            debugExt: this.debugExt,
            editorsAndDocumentsExt: this.editorsAndDocumentsExt,
            messageRegistryExt: this.messageRegistryExt,
            workspaceExt: this.workspaceExt,
            preferenceRegistryExt: this.preferenceRegistryExt,
            clipboardExt: this.clipboardExt,
            webviewExt: this.webviewExt,
            terminalServiceExt: this.terminalServiceExt,
            secretsExt: this.secretsExt,
            localizationExt: this.localizationExt
        };
    }

    protected createAPIFactory(extInterfaces: ExtInterfaces): PluginAPIFactory {
        const {
            envExt, debugExt, preferenceRegistryExt, editorsAndDocumentsExt, workspaceExt,
            messageRegistryExt, clipboardExt, webviewExt, localizationExt
        } = extInterfaces;
        return createAPIFactory(this.rpc, this.pluginManager, envExt, debugExt, preferenceRegistryExt,
            editorsAndDocumentsExt, workspaceExt, messageRegistryExt, clipboardExt, webviewExt,
            localizationExt);
    }

    protected initExtApi(extApi: ExtPluginApi): void {
        interface PluginExports {
            containerModule?: ContainerModule;
            provideApi?: ExtPluginApiBackendInitializationFn;
        }
        if (extApi.backendInitPath) {
            const { containerModule, provideApi } = dynamicRequire<PluginExports>(extApi.backendInitPath);
            if (containerModule) {
                this.loadContainerModule(containerModule);
            }
            if (provideApi) {
                provideApi(this.rpc, this.pluginManager);
            }
        }
    }
}
