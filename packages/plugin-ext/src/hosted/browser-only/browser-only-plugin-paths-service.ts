// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { hashValue } from '@theia/core/lib/common/uuid';
import { compare } from '@theia/core/lib/common/strings';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { UntitledWorkspaceService } from '@theia/workspace/lib/common';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { PluginPaths } from '../../main/common/paths/const';

/** Session folder name, e.g. `20181205T093828`, same format as the backend uses. */
const SESSION_TIMESTAMP_PATTERN = /^\d{8}T\d{6}$/;

/**
 * Resolves plugin log and storage locations for a browser-only application, under the config
 * directory, which lives on the same (browser-local) file system as the workspace.
 */
@injectable()
export class BrowserOnlyPluginPathsService implements PluginPathsService {

    @inject(ILogger) @named('plugin-ext:BrowserOnlyPluginPathsService')
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(UntitledWorkspaceService)
    protected readonly untitledWorkspaceService: UntitledWorkspaceService;

    protected hostLogPath: Promise<string> | undefined;

    getHostLogPath(): Promise<string> {
        // cached: unlike the backend, where each call creates a new session folder, here one tab
        // runs one session, and the plugin host may ask again on a later load cycle
        return this.hostLogPath ??= this.resolveHostLogPath();
    }

    protected async resolveHostLogPath(): Promise<string> {
        const configDirUri = new URI(await this.envServer.getConfigDirUri());
        const logsDirUri = configDirUri.resolve(PluginPaths.PLUGINS_LOGS_DIR);
        const hostLogPath = await this.ensureDirectory(logsDirUri.resolve(this.generateTimeFolderName()).resolve('host'));
        // as on the backend, we never wait for the cleanup
        this.cleanUpOldLogs(logsDirUri).catch(error => this.logger.error('Failed to clean up old plugin log folders:', error));
        return hostLogPath;
    }

    async getHostStoragePath(workspaceUri: string | undefined, rootUris: string[]): Promise<string | undefined> {
        if (!workspaceUri) {
            // no workspace, no place to store workspace state - same as the backend
            return undefined;
        }
        const configDirUri = new URI(await this.envServer.getConfigDirUri());
        const workspaceId = await this.buildWorkspaceId(configDirUri, workspaceUri, rootUris);
        return this.ensureDirectory(configDirUri.resolve(PluginPaths.PLUGINS_WORKSPACE_STORAGE_DIR).resolve(workspaceId));
    }

    protected async buildWorkspaceId(configDirUri: URI, workspaceUri: string, rootUris: string[]): Promise<string> {
        if (this.untitledWorkspaceService.isUntitledWorkspace(new URI(workspaceUri), configDirUri)) {
            // an untitled workspace is named anew in every session, so key its storage on the roots instead
            return hashValue([...rootUris].sort().join(','));
        }
        return hashValue(workspaceUri);
    }

    /**
     * Generate time folder name in format: YYYYMMDDTHHMMSS, for example: 20181205T093828
     */
    protected generateTimeFolderName(): string {
        const timeStamp = new Date().toISOString().replace(/[-:]|(\..*)/g, '');
        // Helps ensure our timestamp generation logic is "valid".
        // Changes to the timestamp structure may break old logs deletion logic.
        if (!SESSION_TIMESTAMP_PATTERN.test(timeStamp)) {
            this.logger.error(`Generated log folder name: "${timeStamp}" does not match expected pattern: ${SESSION_TIMESTAMP_PATTERN}`);
        }
        return timeStamp;
    }

    /**
     * Keeps only the most recent {@link PluginPaths.DEFAULT_PLUGIN_MAX_SESSION_LOGS_FOLDERS}
     * session folders under `logsDirUri`, so reloading doesn't fill up browser storage.
     */
    protected async cleanUpOldLogs(logsDirUri: URI): Promise<void> {
        const logsDir = await this.fileService.resolve(logsDirUri);
        const sessionDirs = (logsDir.children ?? [])
            // we never clean a folder that is not a Theia logs session folder, even if it
            // does appear under `logsDirUri`
            .filter(child => child.isDirectory && SESSION_TIMESTAMP_PATTERN.test(child.resource.path.base))
            .map(child => child.resource)
            // newest first, so the oldest ones get cut off. Ordinal comparison, not
            // localeCompare - the format is fixed ASCII, and locale-aware sorting could order
            // it differently depending on the user's locale
            .sort((one, other) => compare(other.path.base, one.path.base));
        const oldSessionDirs = sessionDirs.slice(PluginPaths.DEFAULT_PLUGIN_MAX_SESSION_LOGS_FOLDERS);
        await Promise.all(oldSessionDirs.map(uri => this.fileService.delete(uri, { fromUserGesture: false, recursive: true })));
    }

    /**
     * Creates `uri` as a directory (fine if it already exists) and returns its path. Plugins get
     * the path rather than the URI, e.g. as `ExtensionContext.storagePath`.
     */
    protected async ensureDirectory(uri: URI): Promise<string> {
        await this.fileService.createFolder(uri, { fromUserGesture: false });
        return this.fileService.fsPath(uri);
    }
}
