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
    inputTokens: number;
}

/**
 * Event fired when a session's token usage crosses the threshold.
 */
export interface SessionTokenThresholdEvent {
    sessionId: string;
    inputTokens: number;
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
     * Event fired when a session's token usage crosses the threshold.
     */
    readonly onThresholdExceeded: Event<SessionTokenThresholdEvent>;

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
     */
    resetSessionTokens(sessionId: string, newTokenCount: number): void;

    /**
     * Reset the triggered state for a session.
     * Called after summarization is complete to allow future triggers
     * if the session continues to grow.
     */
    resetThresholdTrigger(sessionId: string): void;
}
