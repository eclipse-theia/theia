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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TokenUsageServiceClient, TokenUsage } from '@theia/ai-core/lib/common';
import { Emitter } from '@theia/core';
import { ChatSessionTokenTracker, SessionTokenThresholdEvent, SessionTokenUpdateEvent } from '../common/chat-session-token-tracker';

// Re-export from common for backwards compatibility
export { ChatSessionTokenTracker, SessionTokenUpdateEvent, SessionTokenThresholdEvent } from '../common/chat-session-token-tracker';

/**
 * Hardcoded token budget and threshold for chat sessions.
 */
export const CHAT_TOKEN_BUDGET = 200000;
export const CHAT_TOKEN_THRESHOLD_PERCENT = 0.9;
export const CHAT_TOKEN_THRESHOLD = CHAT_TOKEN_BUDGET * CHAT_TOKEN_THRESHOLD_PERCENT;

@injectable()
export class ChatSessionTokenTrackerImpl implements ChatSessionTokenTracker {
    @inject(TokenUsageServiceClient)
    protected readonly tokenUsageClient: TokenUsageServiceClient;

    protected readonly onThresholdExceededEmitter = new Emitter<SessionTokenThresholdEvent>();
    readonly onThresholdExceeded = this.onThresholdExceededEmitter.event;

    protected readonly onSessionTokensUpdatedEmitter = new Emitter<SessionTokenUpdateEvent>();
    readonly onSessionTokensUpdated = this.onSessionTokensUpdatedEmitter.event;

    /**
     * Map of sessionId -> latest inputTokens count.
     * Updated when token usage is reported for requests in that session.
     */
    protected sessionTokens = new Map<string, number>();

    /**
     * Set of sessionIds that have already triggered the threshold event.
     * Prevents multiple triggers for the same session.
     */
    protected triggeredSessions = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.tokenUsageClient.onTokenUsageUpdated(usage => this.handleTokenUsage(usage));
    }

    protected handleTokenUsage(usage: TokenUsage): void {
        const { sessionId, inputTokens } = usage;

        if (!sessionId) {
            return; // Can't track without sessionId
        }

        // Update the session's token count
        this.sessionTokens.set(sessionId, inputTokens);

        // Fire the token update event
        this.onSessionTokensUpdatedEmitter.fire({ sessionId, inputTokens });

        // Check if threshold is exceeded and we haven't already triggered
        if (inputTokens >= CHAT_TOKEN_THRESHOLD && !this.triggeredSessions.has(sessionId)) {
            this.triggeredSessions.add(sessionId);
            this.onThresholdExceededEmitter.fire({
                sessionId,
                inputTokens
            });
        }
    }

    getSessionInputTokens(sessionId: string): number | undefined {
        return this.sessionTokens.get(sessionId);
    }

    /**
     * Reset the triggered state for a session.
     * Called after summarization is complete to allow future triggers
     * if the session continues to grow.
     */
    resetThresholdTrigger(sessionId: string): void {
        this.triggeredSessions.delete(sessionId);
    }

    /**
     * Reset the session's token count to a new baseline.
     * Called after summarization to reflect the reduced token usage.
     * The new count should reflect only the summary + any non-stale messages.
     */
    resetSessionTokens(sessionId: string, newTokenCount: number): void {
        this.sessionTokens.set(sessionId, newTokenCount);
        this.onSessionTokensUpdatedEmitter.fire({ sessionId, inputTokens: newTokenCount });
    }
}
