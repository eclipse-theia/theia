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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileSystemLocking } from '@theia/core/lib/node';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PluginPaths } from './paths/const';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { PluginStorageKind } from '../../common';

export interface Store {
    fsPath: string
    values: KeysToKeysToAnyValue
}

@injectable()
export class PluginsKeyValueStorage {

    private stores: Record<string, Store> = Object.create(null);
    private storesToSync = new Set<Store>();
    private syncStoresTimeout?: NodeJS.Timeout;

    private deferredGlobalDataPath = new Deferred<string | undefined>();

    @inject(PluginPathsService)
    private pluginPathsService: PluginPathsService;

    @inject(EnvVariablesServer)
    private envServer: EnvVariablesServer;

    @inject(FileSystemLocking)
    private fsLocking: FileSystemLocking;

    @postConstruct()
    protected init(): void {
        this.deferredGlobalDataPath.resolve(this.getGlobalDataPath().catch(error => {
            console.error('Failed to initialize global state path:', error);
            return undefined;
        }));
        process.once('beforeExit', () => this.dispose());
        this.syncStores();
    }

    async set(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        const store = await this.getStore(kind);
        if (!store) {
            console.warn('Cannot save data: no opened workspace');
            return false;
        }
        if (value === undefined || Object.keys(value).length === 0) {
            delete store.values[key];
        } else {
            store.values[key] = value;
        }
        this.storesToSync.add(store);
        return true;
    }

    async get(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        const store = await this.getStore(kind);
        return store?.values[key] ?? {};
    }

    async getAll(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const store = await this.getStore(kind);
        return store?.values ?? {};
    }

    private async getGlobalDataPath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const globalStorageFsPath = path.join(FileUri.fsPath(configDirUri), PluginPaths.PLUGINS_GLOBAL_STORAGE_DIR);
        await fs.ensureDir(globalStorageFsPath);
        return path.join(globalStorageFsPath, 'global-state.json');
    }

    private async initializeStore(storePath: string): Promise<Store> {
        return this.fsLocking.lockPath(storePath, async resolved => {
            const values = await this.readFromFile(resolved);
            return {
                values,
                fsPath: storePath
            };
        });
    }

    private async getStore(kind: PluginStorageKind): Promise<Store | undefined> {
        const dataPath = await this.getDataPath(kind);
        if (dataPath) {
            return this.stores[dataPath] ??= await this.initializeStore(dataPath);
        }
    }

    private syncStores(): void {
        this.syncStoresTimeout = setTimeout(async () => {
            await Promise.all(Array.from(this.storesToSync, async ({ fsPath, values }) => {
                await this.fsLocking.lockPath(fsPath, async storePath => {
                    await this.writeToFile(storePath, values);
                });
            }));
            this.storesToSync.clear();
            if (this.syncStoresTimeout) {
                this.syncStores();
            }
        }, this.getSyncStoreTimeout());
    }

    private getSyncStoreTimeout(): number {
        // 0-10s + 1min
        return 10_000 * Math.random() + 60_000;
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

    private dispose(): void {
        clearTimeout(this.syncStoresTimeout);
        this.syncStoresTimeout = undefined;
    }
}
