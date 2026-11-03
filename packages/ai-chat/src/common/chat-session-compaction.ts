// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { ChatAgent } from './chat-agents';
import { MutableChatRequestModel } from './chat-model';

export const ChatSessionCompactionService = Symbol('ChatSessionCompactionService');
/**
 * Handles the `/compact` command. The chat service calls it in place of the agent that received the request.
 * See `ChatSessionCompaction` for how the chat model represents a compacted session.
 */
export interface ChatSessionCompactionService {
    /**
     * Returns `true` if the request is the `/compact` command and the compaction applies to the agent. If it returns
     * `false`, the agent must get the request. That is the case for an agent that keeps its own history, which
     * a compaction in the chat model cannot change.
     */
    isCompactionCommand(request: MutableChatRequestModel, agent: ChatAgent): boolean;
    /**
     * Summarizes the session of the request and completes the response of the request.
     * If the summary fails or the user cancels it, the history of the session does not change.
     */
    compact(request: MutableChatRequestModel): Promise<void>;
}
