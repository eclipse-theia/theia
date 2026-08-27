// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
// ****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { LIST_JSON, PLUGINS_BASE_PATH } from '@theia/plugin-utils/lib/common/constants';
import { DeployedPlugin, ExtPluginApi, HostedPluginClient, HostedPluginServer, PluginIdentifiers } from '../../common';
import { Event, RpcConnectionEventEmitter } from '@theia/core';
import { memoizeAsync } from './async-memoize';

export const PluginLocalOptions = Symbol('PluginLocalOptions');
/**
 * Optional override for the statically deployed plugins of a browser-only application. By
 * default we use whatever the build prepared, i.e. `lib/frontend/hostedPlugin/list.json`. Bind
 * this to supply the metadata by hand instead, e.g. if the plugins are hosted somewhere the
 * build can't see.
 */
export interface PluginLocalOptions {
    pluginMetadata: DeployedPlugin[];
}

/**
 * Serves the plugins statically deployed into the frontend bundle. There's no backend in a
 * browser-only application, so nothing can be deployed or undeployed at runtime.
 */
@injectable()
export class FrontendHostedPluginServer implements HostedPluginServer, RpcConnectionEventEmitter {
    readonly onDidOpenConnection: Event<void> = Event.None;
    readonly onDidCloseConnection: Event<void> = Event.None;

    @inject(PluginLocalOptions) @optional()
    protected readonly options?: PluginLocalOptions;

    protected client: HostedPluginClient | undefined;

    /** The statically deployed plugins, from {@link PluginLocalOptions} if bound, otherwise from the list the build wrote. */
    protected readonly getPlugins = memoizeAsync((): Promise<DeployedPlugin[]> =>
        this.options ? Promise.resolve(this.options.pluginMetadata) : this.fetchDeployedPlugins());

    protected async fetchDeployedPlugins(): Promise<DeployedPlugin[]> {
        // Resolved against `document.baseURI`, like `HostedPluginFileSystemProvider#toUrl`, so
        // this keeps working when the application is deployed under a sub-path.
        const url = new URL(`${PLUGINS_BASE_PATH}/${LIST_JSON}`, document.baseURI).toString();
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }
            const plugins = await response.json();
            if (!Array.isArray(plugins)) {
                throw new Error(`expected an array but got ${typeof plugins}`);
            }
            return plugins;
        } catch (error) {
            throw new Error(`Failed to load the deployed plugins from '${url}': ${error.message}`);
        }
    }

    async getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        const plugins = await this.getPlugins();
        return plugins.map(p => PluginIdentifiers.componentsToVersionedId(p.metadata.model));
    }

    getInstalledPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
        // the statically deployed plugins are the only ones that could ever be "installed"
        return this.getDeployedPluginIds();
    }

    async getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return [];
    }

    async getDisabledPluginIds(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
        return [];
    }

    async getDeployedPlugins(ids: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]> {
        const plugins = await this.getPlugins();
        const requested = new Set(ids);
        return plugins.filter(p => requested.has(PluginIdentifiers.componentsToVersionedId(p.metadata.model)));
    }

    async getExtPluginAPI(): Promise<ExtPluginApi[]> {
        return [];
    }

    async onMessage(targetHost: string, message: Uint8Array): Promise<void> {
        // the frontend delivers messages to the plugin host directly, not through here
    }

    setClient(client: HostedPluginClient | undefined): void {
        this.client = client;
    }

    getClient(): HostedPluginClient | undefined {
        return this.client;
    }

    dispose(): void {
        this.client = undefined;
    }
}
