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
import * as fs from 'fs';
import * as path from 'path';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileSystem } from '@theia/filesystem/lib/common';
import { PluginPaths } from './paths/const';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';

@injectable()
export class PluginsKeyValueStorage {
    private theiaDirPath: string | undefined;
    private globalDataPath: string | undefined;

    private deferredTheiaDirPath = new Deferred<string>();

    constructor(
        @inject(PluginPathsService) private readonly pluginPathsService: PluginPathsService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        this.setupDirectories();
    }

    private async setupDirectories() {
        const theiaDirPath = await this.pluginPathsService.getTheiaDirPath();
        await this.fileSystem.createFolder(theiaDirPath);
        this.theiaDirPath = theiaDirPath;

        this.globalDataPath = path.join(this.theiaDirPath, PluginPaths.PLUGINS_GLOBAL_STORAGE_DIR, 'global-state.json');
        await this.fileSystem.createFolder(path.dirname(this.globalDataPath));

        this.deferredTheiaDirPath.resolve(this.theiaDirPath);
    }

    async set(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean> {
        const dataPath = await this.getDataPath(isGlobal);
        if (!dataPath) {
            throw new Error('Cannot save data: no opened workspace');
        }

        const data = this.readFromFile(dataPath);

        if (value === undefined || value === {}) {
            delete data[key];
        } else {
            data[key] = value;
        }

        this.writeToFile(dataPath, data);
        return true;
    }

    async get(key: string, isGlobal: boolean): Promise<KeysToAnyValues> {
        const dataPath = await this.getDataPath(isGlobal);
        if (!dataPath) {
            return {};
        }

        const data = this.readFromFile(dataPath);
        return data[key];
    }

    async getAll(isGlobal: boolean): Promise<KeysToKeysToAnyValue> {
        const dataPath = await this.getDataPath(isGlobal);
        if (!dataPath) {
            return {};
        }

        const data = this.readFromFile(dataPath);
        return data;
    }

    private async getDataPath(isGlobal: boolean): Promise<string | undefined> {
        if (this.theiaDirPath === undefined) {
            // wait for Theia data directory path if it hasn't been initialized yet
            await this.deferredTheiaDirPath.promise;
        }

        if (isGlobal) {
            return this.globalDataPath!;
        } else {
            const storagePath = await this.pluginPathsService.getLastStoragePath();
            return storagePath ? path.join(storagePath, 'workspace-state.json') : undefined;
        }
    }

    private readFromFile(pathToFile: string): KeysToKeysToAnyValue {
        if (!fs.existsSync(pathToFile)) {
            return {};
        }

        const rawData = fs.readFileSync(pathToFile, 'utf8');
        try {
            return JSON.parse(rawData);
        } catch (error) {
            console.error('Failed to parse data from "', pathToFile, '". Reason:', error);
            return {};
        }
    }

    private writeToFile(pathToFile: string, data: KeysToKeysToAnyValue): void {
        if (!fs.existsSync(path.dirname(pathToFile))) {
            fs.mkdirSync(path.dirname(pathToFile));
        }

        const rawData = JSON.stringify(data);
        fs.writeFileSync(pathToFile, rawData, 'utf8');
    }

}
