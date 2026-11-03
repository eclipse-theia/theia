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
 * Handles the `/compact` command. An agent that builds its prompts from the chat model delegates to it from
 * `ChatAgent.handleCommand`, as `AbstractChatAgent` does. See `ChatSessionCompaction` for how the chat model
 * represents a compacted session.
 */
export interface ChatSessionCompactionService {
    /**
     * Returns `true` if the request is the `/compact` command of this service for the agent. If another command
     * with this name applies to the agent, for example a custom command of the user, it returns `false`.
     */
    isCompactionCommand(request: MutableChatRequestModel, agent: ChatAgent): boolean;
    /**
     * Summarizes the session of the request and completes the response of the request.
     * If the summary fails or the user cancels it, the history of the session does not change.
     */
    compact(request: MutableChatRequestModel): Promise<void>;
}
