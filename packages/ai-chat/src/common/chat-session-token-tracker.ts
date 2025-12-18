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

import { Event } from '@theia/core';

/**
 * Event fired when a session's token count is updated.
 */
export interface SessionTokenUpdateEvent {
    sessionId: string;
    /**
     * The input token count for the active branch.
     * - `number`: Known token count from the most recent LLM response
     * - `undefined`: Unknown/not yet measured (branch has never had an LLM request; do NOT coerce to 0)
     */
    inputTokens: number | undefined;
}

export const ChatSessionTokenTracker = Symbol('ChatSessionTokenTracker');

/**
 * Service that tracks token usage per chat session.
 *
 * Listens to token usage updates from the backend and correlates them with
 * chat sessions via requestId. When a session's input tokens exceed the
 * threshold (90% of 200k), it emits an event for summarization.
 */
export interface ChatSessionTokenTracker {
    /**
     * Event fired when a session's token count is updated.
     */
    readonly onSessionTokensUpdated: Event<SessionTokenUpdateEvent>;

    /**
     * Get the latest input token count for a session.
     * Returns the inputTokens from the most recent request in the session.
     */
    getSessionInputTokens(sessionId: string): number | undefined;

    /**
     * Reset the session's token count to a new baseline.
     * Called after summarization to reflect the reduced token usage.
     *
     * @param sessionId - The session ID to reset
     * @param newTokenCount - The new token count, or `undefined` to indicate unknown state.
     *   When `undefined`, deletes the stored count and emits `{ inputTokens: undefined }`.
     */
    resetSessionTokens(sessionId: string, newTokenCount: number | undefined): void;

    /**
     * Store token count for a specific branch.
     * @param sessionId - The session ID
     * @param branchId - The branch ID
     * @param tokens - The token count
     */
    setBranchTokens(sessionId: string, branchId: string, tokens: number): void;

    /**
     * Get token count for a specific branch.
     * @param sessionId - The session ID
     * @param branchId - The branch ID
     * @returns The token count, or undefined if not tracked
     */
    getBranchTokens(sessionId: string, branchId: string): number | undefined;

    /**
     * Get all branch token counts for a session.
     * @param sessionId - The session ID
     * @returns Object with branchId keys and token count values, or empty object if no data
     */
    getBranchTokensForSession(sessionId: string): { [branchId: string]: number };

    /**
     * Restore branch tokens from persisted data.
     * @param sessionId - The session ID
     * @param branchTokens - Object with branchId keys and token count values
     */
    restoreBranchTokens(sessionId: string, branchTokens: { [branchId: string]: number }): void;

    /**
     * Clear all branch token data for a session.
     * Called when a session is deleted.
     * @param sessionId - The session ID
     */
    clearSessionBranchTokens(sessionId: string): void;
}
