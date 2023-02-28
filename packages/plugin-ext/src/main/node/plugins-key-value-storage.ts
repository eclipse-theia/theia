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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import * as fs from '@theia/core/shared/fs-extra';
import { Mutex } from 'async-mutex';
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

    private readonly deferredGlobalDataPath = new Deferred<string | undefined>();

    @inject(PluginPathsService)
    private readonly pluginPathsService: PluginPathsService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @postConstruct()
    protected init(): void {
        this.deferredGlobalDataPath.resolve(this.getGlobalDataPath().catch(error => {
            console.error('Failed to initialize global state path:', error);
            return undefined;
        }));
    }

    async set(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        const dataPath = await this.getDataPath(kind);
        if (!dataPath) {
            console.warn('Cannot save data: no opened workspace');
            return false;
        }
        return this.getGlobalStateFileLock(dataPath)
            .runExclusive(async () => {
                const data = await this.readFromFile(dataPath);
                if (value === undefined || value === {}) {
                    delete data[key];
                } else {
                    data[key] = value;
                }
                await this.writeToFile(dataPath, data);
                return true;
            });
    }

    async get(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        const dataPath = await this.getDataPath(kind);
        if (!dataPath) {
            return {};
        }
        return this.getGlobalStateFileLock(dataPath)
            .runExclusive(async () => {
                const data = await this.readFromFile(dataPath);
                return data[key];
            });
    }

    async getAll(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const dataPath = await this.getDataPath(kind);
        if (!dataPath) {
            return {};
        }
        return this.getGlobalStateFileLock(dataPath)
            .runExclusive(() => this.readFromFile(dataPath));
    }

    /**
     * @returns A process-global map of `dataFile` paths to its unique `Mutex`.
     */
    protected getGlobalStateFileLocks(): Map<string, Mutex> {
        const kGlobalDataPathMutex = Symbol.for('PluginsKeyValueStorage.GlobalDataPathLocks');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let locks = (globalThis as any)[kGlobalDataPathMutex];
        if (!locks) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any)[kGlobalDataPathMutex] = locks = this.initializeGlobalStateFileLocks();
        }
        return locks;
    }

    protected initializeGlobalStateFileLocks(): Map<string, Mutex> {
        // note: Consider setting up a background cleanup task for any unlocked
        // mutexes in this map in case we churn through lots of dataPaths.
        // Right now the amount of entries seems manageable without cleanup.
        return new Map();
    }

    /**
     * @returns A process-global `Mutex` to guard accesses across the process
     * to the `dataPath` file.
     */
    protected getGlobalStateFileLock(dataPath: string): Mutex {
        const locks = this.getGlobalStateFileLocks();
        let lock = locks.get(dataPath);
        if (!lock) {
            locks.set(dataPath, lock = new Mutex());
        }
        return lock;
    }

    private async getGlobalDataPath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        const globalStorageFsPath = path.join(FileUri.fsPath(configDirUri), PluginPaths.PLUGINS_GLOBAL_STORAGE_DIR);
        await fs.ensureDir(globalStorageFsPath);
        return path.join(globalStorageFsPath, 'global-state.json');
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
