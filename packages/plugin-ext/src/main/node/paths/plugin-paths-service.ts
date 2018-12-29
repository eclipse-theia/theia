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
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import * as path from 'path';
import * as crypto from 'crypto';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { isWindows } from '@theia/core';
import { PluginPaths } from './const';
import { PluginPathsService } from '../../common/plugin-paths-protocol';
import { THEIA_EXT, VSCODE_EXT, getTemporaryWorkspaceFileUri } from '@theia/workspace/lib/browser/workspace-service';

// Service to provide configuration paths for plugin api.
@injectable()
export class PluginPathsServiceImpl implements PluginPathsService {

    private windowsDataFolders = [PluginPaths.WINDOWS_APP_DATA_DIR, PluginPaths.WINDOWS_ROAMING_DIR];
    // storage path is undefined when no workspace is opened
    private cachedStoragePath: string | undefined;
    // is returned when storage path requested before initialization
    private deferredStoragePath: Deferred<string | undefined>;
    // shows if storage path is initialized
    private storagePathInitialized: boolean;

    constructor(
        @inject(FileSystem) readonly fileSystem: FileSystem,
    ) {
        this.deferredStoragePath = new Deferred<string>();
        this.storagePathInitialized = false;
    }

    async provideHostLogPath(): Promise<string> {
        const parentLogsDir = await this.getLogsDirPath();

        if (!parentLogsDir) {
            return Promise.reject(new Error('Unable to get parent log directory'));
        }

        if (parentLogsDir && !await this.fileSystem.exists(parentLogsDir)) {
            await this.fileSystem.createFolder(parentLogsDir);
        }

        const pluginDirPath = path.join(parentLogsDir, this.gererateTimeFolderName(), 'host');
        if (!await this.fileSystem.exists(pluginDirPath)) {
            await this.fileSystem.createFolder(pluginDirPath);
        }

        return new URI(pluginDirPath).path.toString();
    }

    async provideHostStoragePath(workspace: FileStat | undefined, roots: FileStat[]): Promise<string | undefined> {
        const parentStorageDir = await this.getWorkspaceStorageDirPath();

        if (!parentStorageDir) {
            return Promise.reject(new Error('Unable to get parent storage directory'));
        }

        if (!workspace) {
            if (!this.storagePathInitialized) {
                this.deferredStoragePath.resolve(undefined);
                this.storagePathInitialized = true;
            }
            this.cachedStoragePath = undefined;
            return Promise.resolve(undefined);
        }

        if (await !this.fileSystem.exists(parentStorageDir)) {
            await this.fileSystem.createFolder(parentStorageDir);
        }

        const storageDirName = await this.buildWorkspaceId(workspace, roots);
        const storageDirPath = path.join(parentStorageDir, storageDirName);
        if (!await this.fileSystem.exists(storageDirPath)) {
            await this.fileSystem.createFolder(storageDirPath);
        }

        const storagePathString = new URI(storageDirPath).path.toString();
        if (!this.storagePathInitialized) {
            this.deferredStoragePath.resolve(storagePathString);
            this.storagePathInitialized = true;
        }
        this.cachedStoragePath = storagePathString;

        return this.cachedStoragePath;
    }

    async getLastStoragePath(): Promise<string | undefined> {
        if (this.storagePathInitialized) {
            return Promise.resolve(this.cachedStoragePath);
        } else {
            return this.deferredStoragePath.promise;
        }
    }

    async buildWorkspaceId(workspace: FileStat, roots: FileStat[]): Promise<string> {
        const homeDir = await this.getUserHomeDir();
        const untitledWorkspace = getTemporaryWorkspaceFileUri(new URI(homeDir));

        if (untitledWorkspace.toString() === workspace.uri) {
            // if workspace is temporary
            // then let create a storage path for each set of workspace roots
            const rootsStr = roots.map(root => root.uri).sort().join(',');
            return crypto.createHash('md5').update(rootsStr).digest('hex');
        } else {
            const uri = new URI(workspace.uri);
            let displayName = uri.displayName;

            if ((!workspace || !workspace.isDirectory) && (displayName.endsWith(`.${THEIA_EXT}`) || displayName.endsWith(`.${VSCODE_EXT}`))) {
                displayName = displayName.slice(0, displayName.lastIndexOf('.'));
            }

            return crypto.createHash('md5').update(uri.toString()).digest('hex');
        }
    }

    /**
     * Generate time folder name in format: YYYYMMDDTHHMMSS, for example: 20181205T093828
     */
    private gererateTimeFolderName(): string {
        return new Date().toISOString().replace(/[-:]|(\..*)/g, '');
    }

    private async getLogsDirPath(): Promise<string> {
        const theiaDir = await this.getTheiaDirPath();
        return path.join(theiaDir, PluginPaths.PLUGINS_LOGS_DIR);
    }

    private async getWorkspaceStorageDirPath(): Promise<string> {
        const theiaDir = await this.getTheiaDirPath();
        return path.join(theiaDir, PluginPaths.PLUGINS_WORKSPACE_STORAGE_DIR);
    }

    async getTheiaDirPath(): Promise<string> {
        const homeDir = await this.getUserHomeDir();
        return path.join(
            homeDir,
            ...(isWindows ? this.windowsDataFolders : ['']),
            PluginPaths.THEIA_DIR
        );
    }

    private async getUserHomeDir(): Promise<string> {
        const homeDirStat = await this.fileSystem.getCurrentUserHome();
        if (!homeDirStat) {
            return Promise.reject(new Error('Unable to get user home directory'));
        }
        return homeDirStat.uri;
    }

}
