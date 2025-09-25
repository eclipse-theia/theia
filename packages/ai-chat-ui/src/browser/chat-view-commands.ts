// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { Command, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';

export namespace ChatCommands {
    export const CHAT_CATEGORY = 'Chat';
    export const CHAT_CATEGORY_KEY = nls.getDefaultKey(CHAT_CATEGORY);

    export const SCROLL_LOCK_WIDGET = Command.toLocalizedCommand({
        id: 'chat:widget:lock',
        category: CHAT_CATEGORY,
        iconClass: codicon('unlock'),
        label: 'Lock Scroll'
    }, 'theia/ai-chat-ui/scroll-lock', CHAT_CATEGORY_KEY);

    export const SCROLL_UNLOCK_WIDGET = Command.toLocalizedCommand({
        id: 'chat:widget:unlock',
        category: CHAT_CATEGORY,
        iconClass: codicon('lock'),
        label: 'Unlock Scroll'
    }, 'theia/ai-chat-ui/scroll-unlock', CHAT_CATEGORY_KEY);

    export const EDIT_SESSION_SETTINGS = Command.toLocalizedCommand({
        id: 'chat:widget:session-settings',
        category: CHAT_CATEGORY,
        iconClass: codicon('bracket'),
        label: 'Set Session Settings'
    }, 'theia/ai-chat-ui/session-settings', CHAT_CATEGORY_KEY);

    export const AI_CHAT_NEW_WITH_TASK_CONTEXT: Command = {
        id: 'ai-chat.new-with-task-context',
    };

    export const AI_CHAT_INITIATE_SESSION_WITH_TASK_CONTEXT = Command.toLocalizedCommand({
        id: 'ai-chat.initiate-session-with-task-context',
        label: 'Task Context: Initiate Session',
        category: CHAT_CATEGORY
    }, 'theia/ai-chat-ui/initiate-session-task-context', CHAT_CATEGORY_KEY);

    export const AI_CHAT_SUMMARIZE_CURRENT_SESSION = Command.toLocalizedCommand({
        id: 'ai-chat-summary-current-session',
        iconClass: codicon('go-to-editing-session'),
        label: 'Summarize Current Session',
        category: CHAT_CATEGORY
    }, 'theia/ai-chat-ui/summarize-current-session', CHAT_CATEGORY_KEY);

    export const AI_CHAT_OPEN_SUMMARY_FOR_CURRENT_SESSION = Command.toLocalizedCommand({
        id: 'ai-chat-open-current-session-summary',
        iconClass: codicon('note'),
        label: 'Open Current Session Summary',
        category: CHAT_CATEGORY
    }, 'theia/ai-chat-ui/open-current-session-summary', CHAT_CATEGORY_KEY);
}

export const AI_CHAT_NEW_CHAT_WINDOW_COMMAND = Command.toDefaultLocalizedCommand({
    id: 'ai-chat-ui.new-chat',
    iconClass: codicon('add'),
    category: ChatCommands.CHAT_CATEGORY,
    label: 'New Chat'
});

export const AI_CHAT_SHOW_CHATS_COMMAND = Command.toDefaultLocalizedCommand({
    id: 'ai-chat-ui.show-chats',
    iconClass: codicon('history'),
    category: ChatCommands.CHAT_CATEGORY,
    label: 'Show Chats...'
});
