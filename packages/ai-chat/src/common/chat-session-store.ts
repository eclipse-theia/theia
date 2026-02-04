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

import { ChatModel } from './chat-model';
import { SerializedChatData } from './chat-model-serialization';
import { ChatAgentLocation } from './chat-agents';

export const ChatSessionStore = Symbol('ChatSessionStore');

export interface ChatModelWithMetadata {
    model: ChatModel;
    title?: string;
    pinnedAgentId?: string;
    lastInputTokens?: number;
    branchTokens?: { [branchId: string]: number };
}

export interface ChatSessionStore {
    /**
     * Stores the handed over sessions.
     *
     * Might overwrite existing sessions when maximum storage capacity is exceeded.
     */
    storeSessions(...sessions: Array<ChatModel | ChatModelWithMetadata>): Promise<void>;
    /**
     * Read specified session
     */
    readSession(sessionId: string): Promise<SerializedChatData | undefined>;
    /**
     * Delete specified session
     */
    deleteSession(sessionId: string): Promise<void>;
    /**
     * Deletes all sessions
     */
    clearAllSessions(): Promise<void>;
    /**
     * Get index of all stored sessions.
     * Note: This may trigger storage initialization if not already initialized.
     */
    getSessionIndex(): Promise<ChatSessionIndex>;
    /**
     * Check if there are persisted sessions available
     * This has the benefit of not initializing the storage on disk if it does not
     * already exist.
     */
    hasPersistedSessions(): Promise<boolean>;
}

export interface ChatSessionIndex {
    [sessionId: string]: ChatSessionMetadata;
}

export interface ChatSessionMetadata {
    sessionId: string;
    title: string;
    saveDate: number;
    location: ChatAgentLocation;
}
