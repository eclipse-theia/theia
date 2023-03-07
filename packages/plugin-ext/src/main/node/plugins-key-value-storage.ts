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

import { deepmerge } from '@theia/core/shared/@theia/application-package';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileSystemLocking } from '@theia/core/lib/node';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PluginPaths } from './paths/const';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { PluginStorageKind } from '../../common';

@injectable()
export class PluginsKeyValueStorage {

    protected stores: Record<string, KeysToKeysToAnyValue> = Object.create(null);
    protected storesToSync = new Map<string, KeysToKeysToAnyValue>();
    protected syncStoresTimeout: NodeJS.Timeout;

    private deferredGlobalDataPath = new Deferred<string | undefined>();

    @inject(PluginPathsService)
    private pluginPathsService: PluginPathsService;

    @inject(EnvVariablesServer)
    protected envServer: EnvVariablesServer;

    @inject(FileSystemLocking)
    protected fsLocking: FileSystemLocking;

    @postConstruct()
    protected init(): void {
        this.deferredGlobalDataPath.resolve(this.getGlobalDataPath().catch(error => {
            console.error('Failed to initialize global state path:', error);
            return undefined;
        }));
        process.once('beforeExit', () => clearTimeout(this.syncStoresTimeout));
        this.syncStores();
    }

    async set(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        const [dataPath, store] = await this.getStoreWithPath(kind) ?? [];
        if (!store) {
            console.warn('Cannot save data: no opened workspace');
            return false;
        }
        if (value === undefined || Object.keys(value).length === 0) {
            delete store[key];
        } else {
            store[key] = value;
        }
        this.storesToSync.set(dataPath!, store);
        return true;
    }

    async get(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        const store = await this.getStore(kind);
        return store?.[key] ?? {};
    }

    async getAll(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const store = await this.getStore(kind);
        return store ?? {};
    }

    private async getGlobalDataPath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const globalStorageFsPath = path.join(FileUri.fsPath(configDirUri), PluginPaths.PLUGINS_GLOBAL_STORAGE_DIR);
        await fs.ensureDir(globalStorageFsPath);
        return path.join(globalStorageFsPath, 'global-state.json');
    }

    private async initializeStore(dataPath: string): Promise<KeysToKeysToAnyValue> {
        return this.fsLocking.lockPath(dataPath, resolved => this.readFromFile(resolved));
    }

    private async getStore(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue | undefined> {
        const [, store] = await this.getStoreWithPath(kind) ?? [];
        return store;
    }

    private async getStoreWithPath(kind: PluginStorageKind): Promise<[string, KeysToKeysToAnyValue] | undefined> {
        const dataPath = await this.getDataPath(kind);
        if (dataPath) {
            const store = this.stores[dataPath] ??= await this.initializeStore(dataPath);
            return [dataPath, store];
        }
    }

    private syncStores(): void {
        this.syncStoresTimeout = setTimeout(async () => {
            await Promise.all(Array.from(this.storesToSync, async ([dataPath, store]) => {
                await this.fsLocking.lockPath(dataPath, async resolved => {
                    const storeOnDisk = await this.readFromFile(dataPath);
                    const updatedStore = deepmerge(storeOnDisk, store);
                    this.stores[dataPath] = updatedStore;
                    await this.writeToFile(resolved, updatedStore);
                });
            }));
            this.storesToSync.clear();
            this.syncStores();
        }, 60_000);
    }

    private async getDataPath(kind: PluginStorageKind): Promise<string | undefined> {
        if (!kind) {
            return this.deferredGlobalDataPath.promise;
        }
        const storagePath = await this.pluginPathsService.getHostStoragePath(kind.workspace, kind.roots);
        if (storagePath) {
            return path.join(storagePath, 'workspace-state.json');
        }
    }

    private async readFromFile(pathToFile: string): Promise<KeysToKeysToAnyValue> {
        if (!await fs.pathExists(pathToFile)) {
            return {};
        }
        try {
            return await fs.readJSON(pathToFile);
        } catch (error) {
            console.error('Failed to parse data from "', pathToFile, '". Reason:', error);
            return {};
        }
    }

    private async writeToFile(pathToFile: string, data: KeysToKeysToAnyValue): Promise<void> {
        await fs.ensureDir(path.dirname(pathToFile));
        await fs.writeJSON(pathToFile, data);
    }
}
