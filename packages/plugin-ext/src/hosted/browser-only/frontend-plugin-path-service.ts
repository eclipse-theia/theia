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
// ****************************************************************************

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { generateUuid, hashValue } from '@theia/core/lib/common/uuid';
import { compare } from '@theia/core/lib/common/strings';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { UntitledWorkspaceService } from '@theia/workspace/lib/common';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { PluginPaths } from '../../main/common/paths/const';
import { getWebLocks, requestLock, WarnOnce } from './web-locks';
import { memoizeAsync, memoizeAsyncByKey } from './async-memoize';

// Session folder name, e.g. `20181205T093828-3e62e0e7-4934-41d6-8fa5-a38faaad2249`. Unlike the
// backend, where one `PluginPathsServiceImpl` singleton serves every tab, here each tab runs its
// own instance, so a timestamp alone isn't enough to tell them apart - duplicating a tab or
// restoring a session can easily open several within the same second. Hence the random suffix.
const SESSION_FOLDER_PATTERN = /^\d{8}T\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// How many session log folders to keep around. Same default as the backend's
// `--plugin-max-session-logs-folders`, reused directly since there's no CLI here to read it from.
const MAX_SESSION_LOGS_FOLDERS = PluginPaths.DEFAULT_PLUGIN_MAX_SESSION_LOGS_FOLDERS;

// Prefix for the Web Locks API lock a tab holds while it's open, named after its session folder.
// Lets cleanUpOldLogs() tell a still-open tab apart from a finished session - folder count alone
// can't, since restoring a session can open more tabs at once than MAX_SESSION_LOGS_FOLDERS.
const SESSION_LOCK_PREFIX = 'theia:plugin-log-session:';

/**
 * Resolves plugin log and storage locations for a browser-only application, under the config
 * directory, which lives on the same (browser-local) file system as the workspace.
 */
@injectable()
export class FrontendPluginPathService implements PluginPathsService {

    @inject(ILogger) @named('plugin-ext:FrontendPluginPathService')
    protected readonly logger: ILogger;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(UntitledWorkspaceService)
    protected readonly untitledWorkspaceService: UntitledWorkspaceService;

    readonly getHostLogPath = memoizeAsync((): Promise<string> => this.resolveHostLogPath());

    protected readonly getConfigDirUri = memoizeAsync((): Promise<URI> => this.envServer.getConfigDirUri().then(uri => new URI(uri)));

    protected readonly resolveCachedHostStoragePath = memoizeAsyncByKey(
        ({ workspaceUri, rootUris }: { workspaceUri: string; rootUris: string[] }) => this.resolveHostStoragePath(workspaceUri, rootUris),
        // JSON-encoded rather than joined with a separator: workspaceUri/rootUris are URIs and can
        // contain ':' or ',' themselves (e.g. a Windows drive letter), so a plain-text join risks
        // two different pairs colliding on the same cache key.
        ({ workspaceUri, rootUris }) => JSON.stringify([workspaceUri, [...rootUris].sort()])
    );

    getHostStoragePath(workspaceUri: string | undefined, rootUris: string[]): Promise<string | undefined> {
        if (!workspaceUri) {
            // no workspace, no place to store workspace state - same as the backend
            return Promise.resolve(undefined);
        }
        return this.resolveCachedHostStoragePath({ workspaceUri, rootUris });
    }

    /** Each session logs into its own folder, like on the backend, so tabs don't write over each other's logs. */
    protected async resolveHostLogPath(): Promise<string> {
        const folderName = this.generateSessionFolderName();
        // must await the lock: if the folder existed on disk before the lock is actually held,
        // another tab's cleanup could list it, query() before the grant lands, and prune it as
        // dead. Independent of the config dir lookup, so the two run concurrently.
        const [logsDirUri] = await Promise.all([
            this.getConfigDirUri().then(uri => uri.resolve(PluginPaths.PLUGINS_LOGS_DIR)),
            this.markSessionAlive(folderName)
        ]);
        const hostLogPath = await this.ensureDirectory(logsDirUri.resolve(folderName).resolve('host'));
        // as on the backend, we never wait for the cleanup
        this.cleanUpOldLogs(logsDirUri, folderName).catch(error => this.logger.error('Failed to clean up old plugin log folders:', error));
        return hostLogPath;
    }

    protected async resolveHostStoragePath(workspaceUri: string, rootUris: string[]): Promise<string> {
        const configDirUri = await this.getConfigDirUri();
        const workspaceId = await this.buildWorkspaceId(configDirUri, workspaceUri, rootUris);
        return this.ensureDirectory(configDirUri.resolve(PluginPaths.PLUGINS_WORKSPACE_STORAGE_DIR).resolve(workspaceId));
    }

    /**
     * Generates a folder name like `20181205T093828-3e62e0e7-4934-41d6-8fa5-a38faaad2249`. The
     * timestamp keeps folders roughly sorted by recency for {@link cleanUpOldLogs}; the suffix is
     * what actually guarantees uniqueness between two tabs created in the same second.
     */
    protected generateSessionFolderName(): string {
        const timeStamp = new Date().toISOString().replace(/[-:]|(\..*)/g, '');
        const folderName = `${timeStamp}-${generateUuid()}`;
        if (!SESSION_FOLDER_PATTERN.test(folderName)) {
            this.logger.error(`Generated log folder name: "${folderName}" does not match expected pattern: ${SESSION_FOLDER_PATTERN}`);
        }
        return folderName;
    }

    /**
     * Holds the Web Locks API lock named after `folderName` for as long as this tab's document is
     * around - the browser releases it automatically on close or navigation, which is exactly the
     * "is this session still open" signal {@link cleanUpOldLogs} needs.
     *
     * Resolves only once the lock is actually granted, not just requested. `request()` grants
     * asynchronously across tabs, so a caller that didn't wait here could create the session
     * folder before the lock protecting it exists - and another tab's {@link cleanUpOldLogs}
     * could catch it in that window and prune it as dead.
     *
     * Also resolves (rather than hanging forever) if `request()` rejects without ever granting,
     * e.g. because the document isn't fully active yet. Failing to start a plugin host over this
     * would be worse than the risk we already accept when the Web Locks API is unavailable at
     * all - a live session's folder getting pruned by another tab - so we fall back the same way.
     */
    protected async markSessionAlive(folderName: string): Promise<void> {
        const locks = getWebLocks();
        if (!locks) {
            return;
        }
        const granted = new Deferred<void>();
        // resolves `granted` once the lock is actually held, then never settles itself, so the
        // lock stays held until this document goes away
        const holdUntilTabCloses = (): Promise<void> => {
            granted.resolve();
            return new Promise<void>(() => { /* never settles */ });
        };
        requestLock(locks, `${SESSION_LOCK_PREFIX}${folderName}`, holdUntilTabCloses)
            .catch(error => {
                this.logger.warn(`Failed to acquire the liveness lock for plugin log folder '${folderName}':`, error);
                granted.resolve();
            });
        await granted.promise;
    }

    /**
     * Keeps the {@link MAX_SESSION_LOGS_FOLDERS} most recent session folders around, so reloading
     * doesn't fill up browser storage - except `ownFolderName`, which is never touched, and any
     * folder {@link queryOpenSessions} still reports as open. Count alone can't tell a finished
     * session apart from an open tab, and restoring a browser session can open more tabs at once
     * than {@link MAX_SESSION_LOGS_FOLDERS}.
     */
    protected async cleanUpOldLogs(logsDirUri: URI, ownFolderName: string): Promise<void> {
        const logsDir = await this.fileService.resolve(logsDirUri);
        const candidates = (logsDir.children ?? [])
            // skip anything that isn't one of our session folders, or the one just created above
            .filter(child => child.isDirectory && child.resource.path.base !== ownFolderName && SESSION_FOLDER_PATTERN.test(child.resource.path.base))
            .map(child => child.resource)
            // newest first, so the oldest ones get cut off; ties within the same second (e.g. several
            // tabs opened together) are broken arbitrarily by the random suffix, which is fine here.
            // Ordinal comparison, not localeCompare - the format is fixed ASCII, and locale-aware
            // sorting could order it differently depending on the user's locale
            .sort((one, other) => compare(other.path.base, one.path.base));
        // ownFolderName takes up one of the retained slots without being a candidate above
        const prunable = candidates.slice(MAX_SESSION_LOGS_FOLDERS - 1);
        if (prunable.length === 0) {
            return;
        }
        const stillOpen = await this.queryOpenSessions();
        if (!stillOpen) {
            FrontendPluginPathService.missingLocksWarning.warn(this.logger, 'Web Locks API unavailable: cannot tell a still-open tab\'s log folder from a '
                + 'completed session; pruning old plugin log folders by count alone.');
        }
        await Promise.all(prunable
            .filter(uri => !stillOpen?.has(uri.path.base))
            .map(uri => this.fileService.delete(uri, { fromUserGesture: false, recursive: true })));
    }

    /**
     * Session folder names of every tab currently holding its {@link markSessionAlive} lock, or
     * `undefined` if the Web Locks API isn't available - in which case there's no way to tell.
     */
    protected async queryOpenSessions(): Promise<Set<string> | undefined> {
        const locks = getWebLocks();
        if (!locks) {
            return undefined;
        }
        const { held } = await locks.query();
        const openSessions = new Set<string>();
        for (const lock of held ?? []) {
            if (lock.name?.startsWith(SESSION_LOCK_PREFIX)) {
                openSessions.add(lock.name.slice(SESSION_LOCK_PREFIX.length));
            }
        }
        return openSessions;
    }

    protected static readonly missingLocksWarning = new WarnOnce();

    protected async buildWorkspaceId(configDirUri: URI, workspaceUri: string, rootUris: string[]): Promise<string> {
        if (this.untitledWorkspaceService.isUntitledWorkspace(new URI(workspaceUri), configDirUri)) {
            // an untitled workspace is named anew in every session, so key its storage on the roots instead
            return hashValue([...rootUris].sort().join(','));
        }
        return hashValue(workspaceUri);
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
