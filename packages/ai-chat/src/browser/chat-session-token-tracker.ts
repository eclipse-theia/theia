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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { ChatSessionTokenTracker, SessionTokenUpdateEvent } from '../common/chat-session-token-tracker';

// Re-export from common for backwards compatibility
export { ChatSessionTokenTracker, SessionTokenUpdateEvent } from '../common/chat-session-token-tracker';

/**
 * Event fired when a session's token usage crosses the threshold.
 */
export interface SessionTokenThresholdEvent {
    sessionId: string;
    inputTokens: number;
}

/**
 * The maximum token budget for a chat session.
 * This represents the approximate context window size that chat sessions target.
 */
export const CHAT_TOKEN_BUDGET = 200000;

/**
 * The percentage of the token budget at which summarization is triggered.
 */
export const CHAT_TOKEN_THRESHOLD_PERCENT = 0.9;

/**
 * The token threshold at which summarization is triggered.
 * When input tokens reach this value (90% of budget), the system will
 * attempt to summarize the conversation to stay within context limits.
 */
export const CHAT_TOKEN_THRESHOLD = CHAT_TOKEN_BUDGET * CHAT_TOKEN_THRESHOLD_PERCENT;

@injectable()
export class ChatSessionTokenTrackerImpl implements ChatSessionTokenTracker {
    protected readonly onSessionTokensUpdatedEmitter = new Emitter<SessionTokenUpdateEvent>();
    readonly onSessionTokensUpdated = this.onSessionTokensUpdatedEmitter.event;

    /**
     * Map of sessionId -> latest inputTokens count.
     * Updated when token usage is reported for requests in that session.
     */
    protected sessionInputTokens = new Map<string, number>();

    /**
     * Map of sessionId -> latest outputTokens count.
     * Updated progressively during streaming.
     */
    protected sessionOutputTokens = new Map<string, number>();

    /**
     * Map of branch tokens. Key format: `${sessionId}:${branchId}`
     */
    protected branchTokens = new Map<string, number>();

    getSessionInputTokens(sessionId: string): number | undefined {
        return this.sessionInputTokens.get(sessionId);
    }

    getSessionOutputTokens(sessionId: string): number | undefined {
        return this.sessionOutputTokens.get(sessionId);
    }

    getSessionTotalTokens(sessionId: string): number | undefined {
        const input = this.sessionInputTokens.get(sessionId);
        const output = this.sessionOutputTokens.get(sessionId);
        if (input === undefined && output === undefined) {
            return undefined;
        }
        return (input ?? 0) + (output ?? 0);
    }

    /**
     * Reset the session's token count to a new baseline.
     * Called after summarization to reflect the reduced token usage.
     * The new count should reflect only the summary + any non-stale messages.
     *
     * @param sessionId - The session ID to reset
     * @param newTokenCount - The new token count, or `undefined` to indicate unknown state.
     *   When `undefined`, deletes the stored count and emits `{ inputTokens: undefined, outputTokens: undefined }`.
     */
    resetSessionTokens(sessionId: string, newTokenCount: number | undefined): void {
        if (newTokenCount === undefined) {
            this.sessionInputTokens.delete(sessionId);
        } else {
            this.sessionInputTokens.set(sessionId, newTokenCount);
        }
        this.sessionOutputTokens.delete(sessionId);
        this.onSessionTokensUpdatedEmitter.fire({ sessionId, inputTokens: newTokenCount, outputTokens: undefined });
    }

    updateSessionTokens(sessionId: string, inputTokens?: number, outputTokens?: number): void {
        if (inputTokens !== undefined && inputTokens > 0) {
            this.sessionInputTokens.set(sessionId, inputTokens);
            this.sessionOutputTokens.set(sessionId, 0);
        }
        if (outputTokens !== undefined) {
            this.sessionOutputTokens.set(sessionId, outputTokens);
        }
        this.onSessionTokensUpdatedEmitter.fire({
            sessionId,
            inputTokens: this.sessionInputTokens.get(sessionId),
            outputTokens: this.sessionOutputTokens.get(sessionId)
        });
    }

    setBranchTokens(sessionId: string, branchId: string, tokens: number): void {
        this.branchTokens.set(`${sessionId}:${branchId}`, tokens);
    }

    getBranchTokens(sessionId: string, branchId: string): number | undefined {
        return this.branchTokens.get(`${sessionId}:${branchId}`);
    }

    getBranchTokensForSession(sessionId: string): { [branchId: string]: number } {
        const result: { [branchId: string]: number } = {};
        const prefix = `${sessionId}:`;
        for (const [key, value] of this.branchTokens.entries()) {
            if (key.startsWith(prefix)) {
                const branchId = key.substring(prefix.length);
                result[branchId] = value;
            }
        }
        return result;
    }

    restoreBranchTokens(sessionId: string, branchTokens: { [branchId: string]: number }): void {
        for (const [branchId, tokens] of Object.entries(branchTokens)) {
            this.branchTokens.set(`${sessionId}:${branchId}`, tokens);
        }
    }

    clearSessionBranchTokens(sessionId: string): void {
        const prefix = `${sessionId}:`;
        for (const key of this.branchTokens.keys()) {
            if (key.startsWith(prefix)) {
                this.branchTokens.delete(key);
            }
        }
    }
}
