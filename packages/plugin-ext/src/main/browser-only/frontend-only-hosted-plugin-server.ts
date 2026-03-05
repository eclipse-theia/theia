// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Event } from '@theia/core';
import {
    HostedPluginServer,
    HostedPluginClient,
    DeployedPlugin,
    PluginIdentifiers,
} from '../../common/plugin-protocol';
import { ExtPluginApi } from '../../common/plugin-ext-api-contribution';
import { BrowserOnlyPluginsProvider } from './browser-only-plugins-provider';

@injectable()
export class FrontendOnlyHostedPluginServer implements HostedPluginServer {

    @inject(BrowserOnlyPluginsProvider) protected readonly pluginsProvider: BrowserOnlyPluginsProvider;

    private plugins: DeployedPlugin[] | undefined;

    private async loadPlugins(): Promise<DeployedPlugin[]> {
        if (this.plugins === undefined) {
            this.plugins = await this.pluginsProvider.getPlugins();
        }
        return this.plugins;
    }

    setClient(_client: HostedPluginClient | undefined): void { }
    dispose(): void { }
    readonly onDidOpenConnection = Event.None;
    readonly onDidCloseConnection = Event.None;

    async getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        const plugins = await this.loadPlugins();
        return plugins.map(p => PluginIdentifiers.componentsToVersionedId(p.metadata.model));
    }

    async getInstalledPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        return this.getDeployedPluginIds();
    }

    getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return Promise.resolve([] as readonly PluginIdentifiers.VersionedId[]);
    }

    getDisabledPluginIds(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
        return Promise.resolve([]);
    }

    async getDeployedPlugins(ids: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]> {
        const plugins = await this.loadPlugins();
        const byVersionedId = new Map(plugins.map(p => [PluginIdentifiers.componentsToVersionedId(p.metadata.model), p]));
        return ids.map(id => byVersionedId.get(id)).filter((p): p is DeployedPlugin => p !== undefined);
    }

    getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return Promise.resolve([]);
    }

    onMessage(_targetHost: string, _message: Uint8Array): Promise<void> {
        return Promise.resolve();
    }
}
