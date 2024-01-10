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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { PluginDeployerImpl } from './plugin-deployer-impl';
import { PluginsKeyValueStorage } from './plugins-key-value-storage';
import { PluginServer, PluginDeployer, PluginStorageKind, PluginType, UnresolvedPluginEntry, PluginIdentifiers, PluginDeployOptions } from '../../common/plugin-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';

@injectable()
export class PluginServerHandler implements PluginServer {

    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    @inject(PluginsKeyValueStorage)
    protected readonly pluginsKeyValueStorage: PluginsKeyValueStorage;

    async deploy(pluginEntry: string, arg2?: PluginType | CancellationToken, options?: PluginDeployOptions): Promise<void> {
        const type = typeof arg2 === 'number' ? arg2 as PluginType : undefined;
        const successfulDeployments = await this.doDeploy({
            id: pluginEntry,
            type: type ?? PluginType.User
        }, options);
        if (successfulDeployments === 0) {
            const optionText = options ? ` and options ${JSON.stringify(options)} ` : ' ';
            throw new Error(`Deployment of extension with ID ${pluginEntry}${optionText}failed.`);
        }
    }

    protected doDeploy(pluginEntry: UnresolvedPluginEntry, options?: PluginDeployOptions): Promise<number> {
        return this.pluginDeployer.deploy(pluginEntry, options);
    }

    uninstall(pluginId: PluginIdentifiers.VersionedId): Promise<void> {
        return this.pluginDeployer.uninstall(pluginId);
    }

    undeploy(pluginId: PluginIdentifiers.VersionedId): Promise<void> {
        return this.pluginDeployer.undeploy(pluginId);
    }

    setStorageValue(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        return this.pluginsKeyValueStorage.set(key, value, kind);
    }

    getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        return this.pluginsKeyValueStorage.get(key, kind);
    }

    getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        return this.pluginsKeyValueStorage.getAll(kind);
    }

}
