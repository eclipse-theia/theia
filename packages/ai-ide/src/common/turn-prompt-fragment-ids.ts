// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

/**
 * Id of the per-turn fragment listing the files the user attached to the chat. Agents send it inside the user turn
 * (see `AbstractChatAgent.turnPromptId`) so that attaching or removing a file does not rewrite the system prompt.
 */
export const CONTEXT_FILES_HINT_FRAGMENT_ID = 'context-files-hint';
/** Id of Coder's turn prompt: open editors, attached files and the change set summary. */
export const CODER_TURN_PROMPT_ID = 'coder-turn-prompt';
/** Id of Architect's turn prompt: open editors and attached files. */
export const ARCHITECT_TURN_PROMPT_ID = 'architect-turn-prompt';
