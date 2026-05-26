// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { ILogger } from '@theia/core/lib/common/logger';
import { ChatService } from '@theia/ai-chat/lib/common/chat-service';

const LAST_SESSION_KEY = 'qaap.chat.lastActiveSession';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface PersistedLastSession {
    sessionId: string;
    timestamp: number;
}

/**
 * Restores the last active chat session after a reload. The `ChatSessionStore`
 * already persists every conversation to disk, but on reload `ChatService` boots
 * with `_sessions: []` and the user has to manually re-pick their conversation.
 * On mobile, where the backend's `frontendConnectionTimeout` can trip a full
 * reload after a long backgrounding, that effectively erases context.
 *
 * Strategy: track `activeChange` events from `ChatService` and store the active
 * session id (with timestamp) in `StorageService`. On startup, if the stored id
 * is fresh (< 24h), restore the session from disk via `getOrRestoreSession` and
 * mark it active. We do not auto-reveal the chat view — that would be intrusive
 * if the user reloaded for an unrelated reason. The view opens normally and the
 * conversation is already there.
 */
@injectable()
export class MobileChatSessionRestoreContribution implements FrontendApplicationContribution {

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(ChatService) @optional()
    protected readonly chatService?: ChatService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    onStart(): void {
        if (!this.chatService) {
            return;
        }
        const chatService = this.chatService;
        chatService.onSessionEvent(event => {
            if (event.type === 'activeChange' && event.sessionId) {
                this.persistActive(event.sessionId);
            } else if (event.type === 'deleted') {
                this.clearIfMatches(event.sessionId);
            }
        });
        this.restorePrevious(chatService);
    }

    protected async persistActive(sessionId: string): Promise<void> {
        const payload: PersistedLastSession = { sessionId, timestamp: Date.now() };
        await this.storage.setData(LAST_SESSION_KEY, payload);
    }

    protected async clearIfMatches(sessionId: string): Promise<void> {
        const stored = await this.storage.getData<PersistedLastSession>(LAST_SESSION_KEY);
        if (stored?.sessionId === sessionId) {
            await this.storage.setData(LAST_SESSION_KEY, undefined);
        }
    }

    protected async restorePrevious(chatService: ChatService): Promise<void> {
        const stored = await this.storage.getData<PersistedLastSession>(LAST_SESSION_KEY);
        if (!stored?.sessionId) {
            return;
        }
        if (Date.now() - stored.timestamp > STALE_AFTER_MS) {
            await this.storage.setData(LAST_SESSION_KEY, undefined);
            return;
        }
        if (chatService.getActiveSession()) {
            return;
        }
        try {
            const restored = await chatService.getOrRestoreSession(stored.sessionId);
            if (restored) {
                chatService.setActiveSession(restored.id);
            } else {
                await this.storage.setData(LAST_SESSION_KEY, undefined);
            }
        } catch (error) {
            this.logger.warn('Failed to restore previous chat session', { sessionId: stored.sessionId, error });
        }
    }
}
