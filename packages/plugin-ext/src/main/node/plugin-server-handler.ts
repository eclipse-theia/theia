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

import { injectable, inject } from 'inversify';
import { PluginDeployerImpl } from './plugin-deployer-impl';
import { PluginsKeyValueStorage } from './plugins-key-value-storage';
import { PluginServer, PluginDeployer } from '../../common/plugin-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';

@injectable()
export class PluginServerHandler implements PluginServer {

    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    @inject(PluginsKeyValueStorage)
    protected readonly pluginsKeyValueStorage: PluginsKeyValueStorage;

    deploy(pluginEntry: string): Promise<void> {
        return this.pluginDeployer.deploy(pluginEntry);
    }

    keyValueStorageSet(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean> {
        return this.pluginsKeyValueStorage.set(key, value, isGlobal);
    }

    keyValueStorageGet(key: string, isGlobal: boolean): Promise<KeysToAnyValues> {
        return this.pluginsKeyValueStorage.get(key, isGlobal);
    }

    keyValueStorageGetAll(isGlobal: boolean = false): Promise<KeysToKeysToAnyValue> {
        return this.pluginsKeyValueStorage.getAll(isGlobal);
    }

}
