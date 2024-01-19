// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { generateUuid } from '@theia/core/lib/common/uuid';
import { injectable, inject, named } from '@theia/core/shared/inversify';
import { getPluginId, DeployedPlugin, HostedPluginServer, PluginDeployer } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { setUpPluginApi } from '../../main/node/main-context';
import { RPCProtocol, RPCProtocolImpl } from '@theia/plugin-ext/lib/common/rpc-protocol';
import { ContributionProvider, Disposable, DisposableCollection, nls } from '@theia/core';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { IPCChannel } from '@theia/core/lib/node';
import { BackendApplicationConfigProvider } from '@theia/core/lib/node/backend-application-config-provider';
import { HostedPluginProcess } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-process';
import { IShellTerminalServer } from '@theia/terminal/lib/common/shell-terminal-protocol';
import { HeadlessPluginManagerExt, HEADLESSMAIN_RPC_CONTEXT } from '../../common/headless-plugin-rpc';
import { AbstractHostedPluginSupport, PluginContributions } from '@theia/plugin-ext/lib/hosted/common/hosted-plugin';
import { TheiaHeadlessPluginScanner } from './scanners/scanner-theia-headless';
import { SupportedHeadlessActivationEvents } from '../../common/headless-plugin-protocol';
import { PluginDeployerImpl } from '@theia/plugin-ext/lib/main/node/plugin-deployer-impl';

import URI from '@theia/core/lib/common/uri';
import * as fs from 'fs';
import * as asyncFs from 'fs/promises';

export type HeadlessPluginHost = string;

export function isHeadlessPlugin(plugin: DeployedPlugin): boolean {
    return !!plugin.metadata.model.entryPoint.headless;
}

@injectable()
export class HeadlessHostedPluginSupport extends AbstractHostedPluginSupport<HeadlessPluginManagerExt, HostedPluginServer> {

    @inject(HostedPluginProcess)
    protected readonly pluginProcess: HostedPluginProcess;

    @inject(IShellTerminalServer)
    protected readonly shellTerminalServer: IShellTerminalServer;

    @inject(TheiaHeadlessPluginScanner)
    protected readonly scanner: TheiaHeadlessPluginScanner;

    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    @inject(ContributionProvider)
    @named(SupportedHeadlessActivationEvents)
    protected readonly supportedActivationEventsContributions: ContributionProvider<string[]>;

    constructor() {
        super(generateUuid());
    }

    shutDown(): void {
        this.pluginProcess.terminatePluginServer();
    }

    protected createTheiaReadyPromise(): Promise<unknown> {
        return Promise.all([this.envServer.getVariables()]);
    }

    // Only load headless plugins
    protected acceptPlugin(plugin: DeployedPlugin): boolean | DeployedPlugin {
        if (!isHeadlessPlugin(plugin)) {
            return false;
        }

        if (plugin.metadata.model.engine.type === this.scanner.apiType) {
            // Easy case: take it as it is
            return true;
        }

        // Adapt it for headless
        return this.scanner.adaptForHeadless(plugin);
    }

    protected handleContributions(_plugin: DeployedPlugin): Disposable {
        // We have no contribution points, yet, for headless plugins
        return Disposable.NULL;
    }

    protected override async beforeSyncPlugins(toDisconnect: DisposableCollection): Promise<void> {
        await super.beforeSyncPlugins(toDisconnect);

        // Plugin deployment is asynchronous, so wait until that's finished.
        return new Promise<void>((resolve, reject) => {
            this.pluginDeployer.onDidDeploy(resolve);
            toDisconnect.push(Disposable.create(reject));
        });
    }

    protected async obtainManager(host: string, hostContributions: PluginContributions[], toDisconnect: DisposableCollection): Promise<HeadlessPluginManagerExt | undefined> {
        let manager = this.managers.get(host);
        if (!manager) {
            const pluginId = getPluginId(hostContributions[0].plugin.metadata.model);
            const rpc = this.initRpc(host, pluginId);
            toDisconnect.push(rpc);

            manager = rpc.getProxy(HEADLESSMAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
            this.managers.set(host, manager);
            toDisconnect.push(Disposable.create(() => this.managers.delete(host)));

            const [extApi, globalState] = await Promise.all([
                this.server.getExtPluginAPI(),
                this.pluginServer.getAllStorageValues(undefined)
            ]);
            if (toDisconnect.disposed) {
                return undefined;
            }

            const activationEvents = this.supportedActivationEventsContributions.getContributions().flatMap(array => array);
            const shell = await this.shellTerminalServer.getDefaultShell();
            const isElectron = environment.electron.is();

            await manager.$init({
                activationEvents,
                globalState,
                env: {
                    language: nls.locale || nls.defaultLocale,
                    shell,
                    appName: BackendApplicationConfigProvider.get().applicationName,
                    appHost: isElectron ? 'desktop' : 'web' // TODO: 'web' could be the embedder's name, e.g. 'github.dev'
                },
                extApi
            });
            if (toDisconnect.disposed) {
                return undefined;
            }
        }
        return manager;
    }

    protected initRpc(host: HeadlessPluginHost, pluginId: string): RPCProtocol {
        const rpc = this.createServerRpc(host);
        this.container.bind(RPCProtocol).toConstantValue(rpc);
        setUpPluginApi(rpc, this.container);
        this.mainPluginApiProviders.getContributions().forEach(p => p.initialize(rpc, this.container));
        return rpc;
    }

    protected createServerRpc(pluginHostId: string): RPCProtocol {
        const channel = new IPCChannel(this.pluginProcess['childProcess']);

        return new RPCProtocolImpl(channel);
    }

    protected async getStoragePath(): Promise<string | undefined> {
        // Headless plugins are associated with the main Node process, so
        // their storage is the global storage.
        return this.getHostGlobalStoragePath();
    }

    protected async getHostGlobalStoragePath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const globalStorageFolderUri = new URI(configDirUri).resolve('globalStorage');
        const globalStorageFolderUrl = new URL(globalStorageFolderUri.toString());

        let stat: fs.Stats | undefined;

        try {
            stat = await asyncFs.stat(globalStorageFolderUrl);
        } catch (_) {
            // OK, no such directory
        }

        if (stat && !stat.isDirectory()) {
            throw new Error(`Global storage folder is not a directory: ${globalStorageFolderUri}`);
        }

        // Make sure that folder by the path exists
        if (!stat) {
            await asyncFs.mkdir(globalStorageFolderUrl, { recursive: true });
        }

        const globalStorageFolderFsPath = await asyncFs.realpath(globalStorageFolderUrl);
        if (!globalStorageFolderFsPath) {
            throw new Error(`Could not resolve the FS path for URI: ${globalStorageFolderUri}`);
        }
        return globalStorageFolderFsPath;
    }
}
