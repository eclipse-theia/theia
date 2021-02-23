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

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { readdir, remove } from '@theia/core/shared/fs-extra';
import * as crypto from 'crypto';
import { ILogger } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { PluginPaths } from './const';
import { PluginPathsService } from '../../common/plugin-paths-protocol';
import { THEIA_EXT, VSCODE_EXT, getTemporaryWorkspaceFileUri } from '@theia/workspace/lib/common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PluginCliContribution } from '../plugin-cli-contribution';

const SESSION_TIMESTAMP_PATTERN = /^\d{8}T\d{6}$/;

// Service to provide configuration paths for plugin api.
@injectable()
export class PluginPathsServiceImpl implements PluginPathsService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(PluginCliContribution)
    protected readonly cliContribution: PluginCliContribution;

    async getHostLogPath(): Promise<string> {
        const parentLogsDir = await this.getLogsDirPath();

        if (!parentLogsDir) {
            throw new Error('Unable to get parent log directory');
        }

        const pluginDirPath = path.join(parentLogsDir, this.generateTimeFolderName(), 'host');
        await fs.mkdirs(pluginDirPath);
        // no `await` as We should never wait for the cleanup
        this.cleanupOldLogs(parentLogsDir);
        return pluginDirPath;
    }

    async getHostStoragePath(workspaceUri: string | undefined, rootUris: string[]): Promise<string | undefined> {
        const parentStorageDir = await this.getWorkspaceStorageDirPath();

        if (!parentStorageDir) {
            throw new Error('Unable to get parent storage directory');
        }

        if (!workspaceUri) {
            return undefined;
        }

        await fs.mkdirs(parentStorageDir);

        const storageDirName = await this.buildWorkspaceId(workspaceUri, rootUris);
        const storageDirPath = path.join(parentStorageDir, storageDirName);
        await fs.mkdirs(storageDirPath);

        return storageDirPath;
    }

    protected async buildWorkspaceId(workspaceUri: string, rootUris: string[]): Promise<string> {
        const untitledWorkspace = await getTemporaryWorkspaceFileUri(this.envServer);

        if (untitledWorkspace.toString() === workspaceUri) {
            // if workspace is temporary
            // then let create a storage path for each set of workspace roots
            const rootsStr = rootUris.sort().join(',');
            return this.createHash(rootsStr);
        } else {
            let stat;
            try {
                stat = await fs.stat(FileUri.fsPath(workspaceUri));
            } catch { /* no-op */ }
            let displayName = new URI(workspaceUri).displayName;
            if ((!stat || !stat.isDirectory()) && (displayName.endsWith(`.${THEIA_EXT}`) || displayName.endsWith(`.${VSCODE_EXT}`))) {
                displayName = displayName.slice(0, displayName.lastIndexOf('.'));
            }

            return this.createHash(workspaceUri);
        }
    }

    /**
     * Creates a hash digest of the given string.
     */
    protected createHash(str: string): string {
        try {
            // md5 is not FIPS-approved but we have to continue use it as there're existing storage folders based on it
            return crypto.createHash('md5').update(str).digest('hex');
        } catch (e) {
            if (e.message.indexOf('disabled for FIPS') > -1) {
                // SHA256 is FIPS-compliant
                return crypto.createHash('sha256').update(str).digest('hex');
            } else {
                throw e;
            }
        }
        // see more details in the issues 8378
    }

    /**
     * Generate time folder name in format: YYYYMMDDTHHMMSS, for example: 20181205T093828
     */
    private generateTimeFolderName(): string {
        const timeStamp = new Date().toISOString().replace(/[-:]|(\..*)/g, '');
        // Helps ensure our timestamp generation logic is "valid".
        // Changes to the timestamp structure may break old logs deletion logic.
        if (!SESSION_TIMESTAMP_PATTERN.test(timeStamp)) {
            this.logger.error(`Generated log folder name: "${timeStamp}" does not match expected pattern: ${SESSION_TIMESTAMP_PATTERN}`);
        }
        return timeStamp;
    }

    private async getLogsDirPath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        return path.join(FileUri.fsPath(configDirUri), PluginPaths.PLUGINS_LOGS_DIR);
    }

    private async getWorkspaceStorageDirPath(): Promise<string> {
        const configDirUri = await this.envServer.getConfigDirUri();
        return path.join(FileUri.fsPath(configDirUri), PluginPaths.PLUGINS_WORKSPACE_STORAGE_DIR);
    }

    private async cleanupOldLogs(parentLogsDir: string): Promise<void> {
        // @ts-ignore - fs-extra types (Even latest version) is not updated with the `withFileTypes` option.
        const dirEntries = await readdir(parentLogsDir, { withFileTypes: true });
        // `Dirent` type is defined in @types/node since 10.10.0
        // However, upgrading the @types/node in theia to 10.11 (as defined in engine field)
        // Causes other packages to break in compilation, so we are using the infamous `any` type...
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subDirEntries = dirEntries.filter((dirent: any) => dirent.isDirectory());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subDirNames = subDirEntries.map((dirent: any) => dirent.name);
        // We never clean a folder that is not a Theia logs session folder.
        // Even if it does appears under the `parentLogsDir`...
        const sessionSubDirNames = subDirNames.filter((dirName: string) => SESSION_TIMESTAMP_PATTERN.test(dirName));
        // [].sort is ascending order and we need descending order (newest first).
        const sortedSessionSubDirNames = sessionSubDirNames.sort().reverse();
        const maxSessionLogsFolders = this.cliContribution.maxSessionLogsFolders();
        // [5,4,3,2,1].slice(2) --> [2,1] --> only keep N latest session folders.
        const oldSessionSubDirNames = sortedSessionSubDirNames.slice(maxSessionLogsFolders);

        oldSessionSubDirNames.forEach((sessionDir: string) => {
            const sessionDirPath = path.resolve(parentLogsDir, sessionDir);
            // we are not waiting for the async `remove` to finish before returning
            // in order to minimize impact on Theia startup time.
            remove(sessionDirPath);
        });
    }

}
