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

import { interfaces } from 'inversify';
import { StorageMain } from '../../api/plugin-api';
import { PluginServer } from '../../common/plugin-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';

export class StorageMainImpl implements StorageMain {

    private pluginServer: PluginServer;

    constructor(container: interfaces.Container) {
        this.pluginServer = container.get(PluginServer);
    }

    $set(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean> {
        return this.pluginServer.keyValueStorageSet(key, value, isGlobal);
    }

    $get(key: string, isGlobal: boolean): Promise<KeysToAnyValues> {
        return this.pluginServer.keyValueStorageGet(key, isGlobal);
    }

    $getAll(isGlobal: boolean): Promise<KeysToKeysToAnyValue> {
        return this.pluginServer.keyValueStorageGetAll(isGlobal);
    }

}
