// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PreferenceService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser';
import { URI } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { ILogger } from '@theia/core/lib/common/logger';
import { ChatModel } from '../common/chat-model';
import { ChatSessionIndex, ChatSessionStore, ChatModelWithMetadata, ChatSessionMetadata } from '../common/chat-session-store';
import {
    PERSISTED_SESSION_LIMIT_PREF,
    SESSION_STORAGE_PREF,
    SessionStorageValue
} from '../common/ai-chat-preferences';
import { SerializedChatData, CHAT_DATA_VERSION } from '../common/chat-model-serialization';

const INDEX_FILE = 'index.json';

@injectable()
export class ChatSessionStoreImpl implements ChatSessionStore {
    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(ILogger) @named('ChatSessionStore')
    protected readonly logger: ILogger;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected storageRoot?: URI;
    protected storageInitialized = false;
    protected indexCache?: ChatSessionIndex;
    protected storePromise: Promise<void> = Promise.resolve();

    @postConstruct()
    protected init(): void {
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === SESSION_STORAGE_PREF) {
                this.logger.debug('Session storage preference changed: invalidating cache.', { preference: event.preferenceName });
                this.invalidateStorageCache();
            }
        });

        this.workspaceService.onWorkspaceLocationChanged(() => {
            this.logger.debug('Workspace location changed: invalidating storage cache.');
            this.invalidateStorageCache();
        });
    }

    protected invalidateStorageCache(): void {
        this.storageRoot = undefined;
        this.storageInitialized = false;
        this.indexCache = undefined;
    }

    async storeSessions(...sessions: Array<ChatModel | ChatModelWithMetadata>): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const root = await this.ensureStorageReady();
            if (!root) {
                this.logger.debug('Session persistence is disabled: skipping store.');
                return;
            }
            this.logger.debug('Starting to store sessions', { totalSessions: sessions.length, storageRoot: root.toString() });

            // Normalize to SessionWithTitle and filter empty sessions
            const nonEmptySessions = sessions
                .map(s => this.isChatModelWithMetadata(s) ? { ...s, saveDate: Date.now() } : { model: s, saveDate: Date.now() })
                .filter(s => !s.model.isEmpty());
            this.logger.debug('Filtered empty sessions', { nonEmptySessions: nonEmptySessions.length });

            // Write each session as JSON file
            for (const session of nonEmptySessions) {
                const sessionFile = root.resolve(`${session.model.id}.json`);
                const modelData = session.model.toSerializable();
                // Wrap model data with persistence metadata
                const data: SerializedChatData = {
                    version: CHAT_DATA_VERSION,
                    title: session.title,
                    pinnedAgentId: session.pinnedAgentId,
                    saveDate: session.saveDate,
                    model: modelData
                };
                this.logger.debug('Writing session to file', {
                    sessionId: session.model.id,
                    title: data.title,
                    filePath: sessionFile.toString(),
                    requestCount: modelData.requests.length,
                    responseCount: modelData.responses.length,
                    pinnedAgentId: data.pinnedAgentId,
                    version: data.version
                });
                await this.fileService.writeFile(
                    sessionFile,
                    BinaryBuffer.fromString(JSON.stringify(data, undefined, 2))
                );
            }

            // Update index with metadata
            await this.updateIndex(nonEmptySessions);

            // Trim to max sessions
            await this.trimSessions();
            this.logger.debug('Finished storing sessions');
        });
        return this.storePromise;
    }

    private isChatModelWithMetadata(session: ChatModel | ChatModelWithMetadata): session is ChatModelWithMetadata {
        return 'model' in session;
    }

    async readSession(sessionId: string): Promise<SerializedChatData | undefined> {
        const root = await this.ensureStorageReady();
        if (!root) {
            this.logger.debug('Session persistence is disabled: cannot read session.', { sessionId });
            return undefined;
        }
        const sessionFile = root.resolve(`${sessionId}.json`);
        this.logger.debug('Reading session from file', { sessionId, filePath: sessionFile.toString() });

        try {
            const content = await this.fileService.readFile(sessionFile);
            const parsedData = JSON.parse(content.value.toString());
            const data = this.migrateData(parsedData);
            this.logger.debug('Successfully read session', {
                sessionId,
                requestCount: data.model.requests.length,
                responseCount: data.model.responses.length,
                version: data.version
            });
            return data;
        } catch (e) {
            this.logger.debug('Failed to read session', { sessionId, error: e });
            return undefined;
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const root = await this.ensureStorageReady();
            if (!root) {
                this.logger.debug('Session persistence is disabled: skipping delete.', { sessionId });
                return;
            }
            const sessionFile = root.resolve(`${sessionId}.json`);
            this.logger.debug('Deleting session', { sessionId, filePath: sessionFile.toString() });

            try {
                await this.fileService.delete(sessionFile);
                this.logger.debug('Session file deleted', { sessionId });
            } catch (e) {
                this.logger.debug('Failed to delete session file (may not exist)', { sessionId, error: e });
            }

            // Update index
            const index = await this.loadIndex();
            delete index[sessionId];
            await this.saveIndex(index);
            this.logger.debug('Session removed from index', { sessionId });
        });
        return this.storePromise;
    }

    async clearAllSessions(): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const root = await this.ensureStorageReady();
            if (!root) {
                this.logger.debug('Session persistence is disabled: skipping clear.');
                return;
            }

            try {
                await this.fileService.delete(root, { recursive: true });
                await this.fileService.createFolder(root);
            } catch (e) {
                // Ignore errors
            }

            this.indexCache = {};
            await this.saveIndex({});
        });
        return this.storePromise;
    }

    async getSessionIndex(): Promise<ChatSessionIndex> {
        const index = await this.loadIndex();
        this.logger.debug('Retrieved session index', { sessionCount: Object.keys(index).length });
        return index;
    }

    async setSessionTitle(sessionId: string, title: string): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const index = await this.loadIndex();
            if (index[sessionId]) {
                index[sessionId].title = title;
                await this.saveIndex(index);
            }
        });
        return this.storePromise;
    }

    /**
     * Gets the storage root URI.
     * Use {@link ensureStorageReady} when you need actually to access the storage.
     */
    protected async getStorageRoot(): Promise<URI | undefined> {
        if (this.storageRoot !== undefined) {
            return this.storageRoot;
        }

        const resolved = await this.resolveStorageRoot();
        if (!resolved) {
            // Persistence is disabled
            return undefined;
        }

        this.storageRoot = resolved;
        return this.storageRoot;
    }

    /**
     * Ensures the storage directory exists and is initialized on disk.
     * This should be called before any disk I/O operations.
     */
    protected async ensureStorageReady(): Promise<URI | undefined> {
        const root = await this.getStorageRoot();
        if (!root) {
            return undefined;
        }

        if (!this.storageInitialized) {
            await this.initializeStorage(root);
            this.storageInitialized = true;
        }

        return root;
    }

    /**
     * Initializes the storage directory on disk, creating it if necessary
     * and seeding it from global storage for new workspace storage locations.
     */
    protected async initializeStorage(root: URI): Promise<void> {
        const storageConfig = await this.getStorageConfig();
        const workspaceRoot = await this.getWorkspaceRoot();
        // Only consider it workspace storage if both the preference is workspace AND we have a workspace open.
        // When no workspace is open, we fall back to global storage even if scope preference is 'workspace'.
        const isActuallyWorkspaceStorage = storageConfig.scope === 'workspace' && workspaceRoot !== undefined;
        const indexExists = await this.fileService.exists(root.resolve(INDEX_FILE));

        try {
            await this.fileService.createFolder(root);
        } catch (e) {
            // Folder may already exist
        }

        // Seed new workspace storage from global storage
        if (isActuallyWorkspaceStorage && !indexExists) {
            await this.seedFromGlobalStorage(root);
        }
    }

    protected async getStorageConfig(): Promise<SessionStorageValue> {
        // Wait for preferences to be ready before reading storage configuration
        await this.preferenceService.ready;

        const storagePref = this.preferenceService.get<Partial<SessionStorageValue>>(SESSION_STORAGE_PREF);
        return SessionStorageValue.create(storagePref);
    }

    protected async getGlobalStorageRoot(): Promise<URI | undefined> {
        const storageConfig = await this.getStorageConfig();

        if (storageConfig.globalPath.trim()) {
            return new URI(storageConfig.globalPath).withScheme('file');
        }

        const configDir = await this.envServer.getConfigDirUri();
        return new URI(configDir).resolve('chatSessions');
    }

    protected async seedFromGlobalStorage(workspaceRoot: URI): Promise<void> {
        const globalRoot = await this.getGlobalStorageRoot();
        if (!globalRoot) {
            return;
        }

        try {
            // Check if global storage has content
            const globalContents = await this.fileService.resolve(globalRoot);
            if (!globalContents.children || globalContents.children.length === 0) {
                return;
            }
            const globalIndexExists = await this.fileService.exists(globalRoot.resolve(INDEX_FILE));
            if (!globalIndexExists) {
                return;
            }

            // Copy each JSON file to workspace storage
            let copiedCount = 0;
            for (const child of globalContents.children) {
                if (child.name.endsWith('.json')) {
                    const sourceUri = child.resource;
                    const targetUri = workspaceRoot.resolve(child.name);
                    try {
                        await this.fileService.copy(sourceUri, targetUri, { overwrite: false });
                        copiedCount++;
                    } catch (copyError) {
                        // File may already exist, skip it
                        this.logger.debug('Could not copy file during seeding', { file: child.name, error: copyError });
                    }
                }
            }

            if (copiedCount > 0) {
                this.logger.info(`Seeded workspace chat storage from global storage (${copiedCount} files)`);
            }
        } catch (e) {
            this.logger.warn('Failed to seed workspace storage from global storage', e);
        }
    }

    protected async resolveStorageRoot(): Promise<URI | undefined> {
        const storageConfig = await this.getStorageConfig();

        if (storageConfig.scope === 'workspace') {
            const workspaceRoot = await this.getWorkspaceRoot();
            if (workspaceRoot) {
                // Empty workspace path means persistence is disabled
                if (!storageConfig.workspacePath.trim()) {
                    this.logger.debug('Workspace storage path is empty: session persistence disabled.');
                    return undefined;
                }
                const resolvedPath = workspaceRoot.resolve(storageConfig.workspacePath);
                this.logger.debug('Using workspace storage', { workspaceRoot: workspaceRoot.toString(), path: resolvedPath.toString() });
                return resolvedPath;
            }

            this.logger.debug('No workspace open: falling back to global storage.');
        }

        // Global storage mode (or fallback)
        if (storageConfig.globalPath.trim()) {
            // Custom absolute path specified
            const resolvedPath = new URI(storageConfig.globalPath).withScheme('file');
            this.logger.debug('Using custom global storage path', { path: resolvedPath.toString() });
            return resolvedPath;
        }

        // Default global storage: $HOME/.theia/chatSessions
        const configDir = await this.envServer.getConfigDirUri();
        const defaultPath = new URI(configDir).resolve('chatSessions');
        this.logger.debug('Using default global storage path', { path: defaultPath.toString() });
        return defaultPath;
    }

    protected async getWorkspaceRoot(): Promise<URI | undefined> {
        const roots = await this.workspaceService.roots;
        if (roots.length > 0) {
            return roots[0].resource;
        }
        return undefined;
    }

    protected async updateIndex(sessions: ((ChatModelWithMetadata & { saveDate: number })[])): Promise<void> {
        const index = await this.loadIndex();

        for (const session of sessions) {
            const data = session.model.toSerializable();
            const { model, ...metadata } = session;
            const previousData = index[model.id];
            index[model.id] = {
                ...previousData,
                sessionId: model.id,
                location: data.location,
                ...metadata
            };
        }

        await this.saveIndex(index);
    }

    protected getPersistedSessionLimit(): number {
        return this.preferenceService.get<number>(PERSISTED_SESSION_LIMIT_PREF, 25);
    }

    protected async trimSessions(): Promise<void> {
        const root = await this.ensureStorageReady();
        if (!root) {
            return;
        }

        const maxSessions = this.getPersistedSessionLimit();

        // -1 means unlimited, skip trimming
        if (maxSessions === -1) {
            return;
        }

        const index = await this.loadIndex();
        const sessions = Object.values(index);

        // 0 means no persistence - delete all sessions
        if (maxSessions === 0) {
            this.logger.debug('Session persistence disabled, deleting all sessions', { sessionCount: sessions.length });
            for (const session of sessions) {
                const sessionFile = root.resolve(`${session.sessionId}.json`);
                try {
                    await this.fileService.delete(sessionFile);
                } catch (e) {
                    this.logger.debug('Failed to delete session file', { sessionId: session.sessionId, error: e });
                }
                delete index[session.sessionId];
            }
            await this.saveIndex(index);
            return;
        }

        if (sessions.length <= maxSessions) {
            return;
        }

        this.logger.debug('Trimming sessions', { currentCount: sessions.length, maxSessions });

        // Sort by save date (oldest first)
        sessions.sort((a, b) => a.saveDate - b.saveDate);

        // Delete oldest sessions beyond the limit
        const sessionsToDelete = sessions.slice(0, sessions.length - maxSessions);
        this.logger.debug('Deleting oldest sessions', { deleteCount: sessionsToDelete.length, sessionIds: sessionsToDelete.map(s => s.sessionId) });

        for (const session of sessionsToDelete) {
            const sessionFile = root.resolve(`${session.sessionId}.json`);
            try {
                await this.fileService.delete(sessionFile);
            } catch (e) {
                this.logger.debug('Failed to delete session file', { sessionId: session.sessionId, error: e });
            }
            delete index[session.sessionId];
        }

        await this.saveIndex(index);
    }

    protected async loadIndex(): Promise<ChatSessionIndex> {
        if (this.indexCache) {
            return this.indexCache;
        }

        const root = await this.ensureStorageReady();
        if (!root) {
            this.indexCache = {};
            return this.indexCache;
        }
        const indexFile = root.resolve(INDEX_FILE);

        try {
            const content = await this.fileService.readFile(indexFile);
            const rawIndex = JSON.parse(content.value.toString());

            // Validate and clean up index entries
            const validatedIndex: ChatSessionIndex = {};
            let hasInvalidEntries = false;

            for (const [sessionId, metadata] of Object.entries(rawIndex)) {
                // Check if entry has required fields and valid values
                if (this.isValidMetadata(metadata)) {
                    validatedIndex[sessionId] = metadata as ChatSessionMetadata;
                } else {
                    hasInvalidEntries = true;
                    this.logger.warn('Removing invalid session metadata from index', {
                        sessionId,
                        metadata
                    });
                }
            }

            // If we removed any entries, persist the cleaned index
            if (hasInvalidEntries) {
                this.logger.info('Index cleaned up, removing invalid entries');
                await this.fileService.writeFile(
                    indexFile,
                    BinaryBuffer.fromString(JSON.stringify(validatedIndex, undefined, 2))
                );
            }

            this.indexCache = validatedIndex;
            return this.indexCache;
        } catch (e) {
            this.indexCache = {};
            return this.indexCache;
        }
    }

    protected isValidMetadata(metadata: unknown): metadata is ChatSessionMetadata {
        if (!metadata || typeof metadata !== 'object') {
            return false;
        }

        const m = metadata as Record<string, unknown>;

        // Check required fields exist and have correct types
        return typeof m.sessionId === 'string' &&
            typeof m.title === 'string' &&
            typeof m.saveDate === 'number' &&
            typeof m.location === 'string' &&
            // Ensure saveDate is a valid timestamp
            !isNaN(m.saveDate) &&
            m.saveDate > 0;
    }

    protected async saveIndex(index: ChatSessionIndex): Promise<void> {
        this.indexCache = index;
        const root = await this.ensureStorageReady();
        if (!root) {
            return;
        }
        const indexFile = root.resolve(INDEX_FILE);

        await this.fileService.writeFile(
            indexFile,
            BinaryBuffer.fromString(JSON.stringify(index, undefined, 2))
        );
    }

    protected migrateData(data: unknown): SerializedChatData {
        const parsed = data as SerializedChatData;

        // Defensive check for unexpected future versions
        if (parsed.version && parsed.version > CHAT_DATA_VERSION) {
            this.logger.warn(
                `Session data version ${parsed.version} is newer than supported ${CHAT_DATA_VERSION}. ` +
                'Data may not load correctly.'
            );
        }

        return parsed;
    }

    async hasPersistedSessions(): Promise<boolean> {
        // If we already have cached sessions, return true immediately
        if (this.indexCache && Object.keys(this.indexCache).length > 0) {
            return true;
        }

        // Check global storage for sessions without triggering workspace initialization.
        // If global storage has sessions, workspace storage will be seeded from it,
        // so we know sessions will be available.
        if (await this.hasGlobalSessions()) {
            return true;
        }

        // If workspace storage is already initialized, check its index
        if (this.storageInitialized && this.storageRoot) {
            const indexFile = this.storageRoot.resolve(INDEX_FILE);
            try {
                const exists = await this.fileService.exists(indexFile);
                if (exists) {
                    const content = await this.fileService.readFile(indexFile);
                    const index = JSON.parse(content.value.toString());
                    return Object.keys(index).length > 0;
                }
            } catch (e) {
                // Index doesn't exist or is unreadable
            }
        }

        return false;
    }

    protected async hasGlobalSessions(): Promise<boolean> {
        const globalRoot = await this.getGlobalStorageRoot();
        if (!globalRoot) {
            return false;
        }

        try {
            const indexFile = globalRoot.resolve(INDEX_FILE);
            const exists = await this.fileService.exists(indexFile);
            if (!exists) {
                return false;
            }

            const content = await this.fileService.readFile(indexFile);
            const index = JSON.parse(content.value.toString());
            return Object.keys(index).length > 0;
        } catch (e) {
            return false;
        }
    }
}
