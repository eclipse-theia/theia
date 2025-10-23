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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { StorageService } from '@theia/core/lib/browser';
import { URI } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { ILogger } from '@theia/core/lib/common/logger';
import { ChatModel } from '../common/chat-model';
import { ChatSessionIndex, ChatSessionStore, ChatModelWithMetadata, ChatSessionMetadata } from '../common/chat-session-store';
import { SerializedChatData, CHAT_DATA_VERSION } from '../common/chat-model-serialization';

const MAX_SESSIONS = 25;
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

    private storageRoot?: URI;
    private indexCache?: ChatSessionIndex;
    private storePromise: Promise<void> = Promise.resolve();

    async storeSessions(...sessions: Array<ChatModel | ChatModelWithMetadata>): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const root = await this.getStorageRoot();
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
        const root = await this.getStorageRoot();
        const sessionFile = root.resolve(`${sessionId}.json`);
        this.logger.debug('Reading session from file', { sessionId, filePath: sessionFile.toString() });

        try {
            const content = await this.fileService.readFile(sessionFile);
            const data = JSON.parse(content.value.toString());
            const revived = this.reviveData(data);
            this.logger.debug('Successfully read session', {
                sessionId,
                requestCount: revived.model.requests.length,
                responseCount: revived.model.responses.length,
                version: revived.version
            });
            return revived;
        } catch (e) {
            this.logger.debug('Failed to read session', { sessionId, error: e });
            return undefined;
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        this.storePromise = this.storePromise.then(async () => {
            const root = await this.getStorageRoot();
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
            const root = await this.getStorageRoot();

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

    private async getStorageRoot(): Promise<URI> {
        if (this.storageRoot) {
            return this.storageRoot;
        }

        const configDir = await this.envServer.getConfigDirUri();
        this.storageRoot = new URI(configDir).resolve('chatSessions');

        try {
            await this.fileService.createFolder(this.storageRoot);
        } catch (e) {
            // Folder may already exist
        }

        return this.storageRoot;
    }

    private async updateIndex(sessions: ((ChatModelWithMetadata & { saveDate: number })[])): Promise<void> {
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

    private async trimSessions(): Promise<void> {
        const index = await this.loadIndex();
        const sessions = Object.values(index);

        if (sessions.length <= MAX_SESSIONS) {
            return;
        }

        this.logger.debug('Trimming sessions', { currentCount: sessions.length, maxSessions: MAX_SESSIONS });

        // Sort by save date
        sessions.sort((a, b) => a.saveDate - b.saveDate);

        // Delete oldest sessions
        const sessionsToDelete = sessions.slice(0, sessions.length - MAX_SESSIONS);
        this.logger.debug('Deleting oldest sessions', { deleteCount: sessionsToDelete.length, sessionIds: sessionsToDelete.map(s => s.sessionId) });
        for (const session of sessionsToDelete) {
            await this.deleteSession(session.sessionId);
        }
    }

    private async loadIndex(): Promise<ChatSessionIndex> {
        if (this.indexCache) {
            return this.indexCache;
        }

        const root = await this.getStorageRoot();
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

    private isValidMetadata(metadata: unknown): metadata is ChatSessionMetadata {
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

    private async saveIndex(index: ChatSessionIndex): Promise<void> {
        this.indexCache = index;
        const root = await this.getStorageRoot();
        const indexFile = root.resolve(INDEX_FILE);

        await this.fileService.writeFile(
            indexFile,
            BinaryBuffer.fromString(JSON.stringify(index, undefined, 2))
        );
    }

    private reviveData(data: unknown): SerializedChatData {
        // At the moment we only have a single version of the data, so just cast
        return data as SerializedChatData;
    }
}
