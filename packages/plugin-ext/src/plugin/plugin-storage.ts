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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as theia from '@theia/plugin';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { PLUGIN_RPC_CONTEXT, StorageMain, StorageExt } from '../common/plugin-api-rpc';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../common/types';
import { RPCProtocol } from '../common/rpc-protocol';

export class Memento implements theia.Memento {

    private cache: KeysToAnyValues;

    constructor(
        private readonly pluginId: string,
        private readonly isPluginGlobalData: boolean,
        private readonly storage: KeyValueStorageProxy
    ) {
        this.cache = storage.getPerPluginData(pluginId, isPluginGlobalData);

        if (!this.isPluginGlobalData) {
            this.storage.storageDataChangedEvent((data: KeysToKeysToAnyValue) => {
                this.cache = data[this.pluginId] ? data[this.pluginId] : {};
            });
        }
    }

    keys(): string[] {
        return Object.entries(this.cache).filter(([, value]) => value !== undefined).map(([key]) => key);
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        if (key && this.cache.hasOwnProperty(key)) {
            return this.cache[key];
        } else {
            return defaultValue;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update(key: string, value: any): Promise<void> {
        if (value === undefined) {
            delete this.cache[key];
        } else {
            this.cache[key] = value;
        }
        return this.storage.setPerPluginData(this.pluginId, this.cache, this.isPluginGlobalData).then(_ => undefined);
    }
}

export class GlobalState extends Memento {

    /** @todo: API is not yet implemented. */
    setKeysForSync(keys: readonly string[]): void { }
}

/**
 * Singleton.
 * Is used to proxy storage requests to main side.
 */
export class KeyValueStorageProxy implements StorageExt {

    private storageDataChangedEmitter = new Emitter<KeysToKeysToAnyValue>();
    public readonly storageDataChangedEvent: Event<KeysToKeysToAnyValue> = this.storageDataChangedEmitter.event;

    private readonly proxy: StorageMain;

    private globalDataCache: KeysToKeysToAnyValue;
    private workspaceDataCache: KeysToKeysToAnyValue;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy<StorageMain>(PLUGIN_RPC_CONTEXT.STORAGE_MAIN);
    }

    init(initGlobalData: KeysToKeysToAnyValue, initWorkspaceData: KeysToKeysToAnyValue): void {
        this.globalDataCache = initGlobalData;
        this.workspaceDataCache = initWorkspaceData;
    }

    getPerPluginData(key: string, isGlobal: boolean): KeysToAnyValues {
        if (isGlobal) {
            const existed = this.globalDataCache[key];
            return existed ? existed : {};
        } else {
            const existed = this.workspaceDataCache[key];
            return existed ? existed : {};
        }
    }

    setPerPluginData(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean> {
        if (isGlobal) {
            this.globalDataCache[key] = value;
        } else {
            this.workspaceDataCache[key] = value;
        }

        return this.proxy.$set(key, value, isGlobal);
    }

    $updatePluginsWorkspaceData(workspaceData: KeysToKeysToAnyValue): void {
        this.workspaceDataCache = workspaceData;
        this.storageDataChangedEmitter.fire(workspaceData);
    }

}
