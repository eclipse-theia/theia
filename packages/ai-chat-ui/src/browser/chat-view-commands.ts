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
    const CHAT_CATEGORY = 'Chat';
    const CHAT_CATEGORY_KEY = nls.getDefaultKey(CHAT_CATEGORY);

    export const SCROLL_LOCK_WIDGET = Command.toLocalizedCommand({
        id: 'chat:widget:lock',
        category: CHAT_CATEGORY,
        iconClass: codicon('unlock')
    }, '', CHAT_CATEGORY_KEY);

    export const SCROLL_UNLOCK_WIDGET = Command.toLocalizedCommand({
        id: 'chat:widget:unlock',
        category: CHAT_CATEGORY,
        iconClass: codicon('lock')
    }, '', CHAT_CATEGORY_KEY);

    export const EDIT_SESSION_SETTINGS = Command.toLocalizedCommand({
        id: 'chat:widget:session-settings',
        category: CHAT_CATEGORY,
        iconClass: codicon('bracket')
    }, 'Set Session Settings', CHAT_CATEGORY_KEY);

    export const AI_CHAT_NEW_WITH_TASK_CONTEXT: Command = {
        id: 'ai-chat.new-with-task-context',
    };

    export const AI_CHAT_INITIATE_SESSION_WITH_TASK_CONTEXT = Command.toLocalizedCommand({
        id: 'ai-chat.initiate-session-with-task-context',
        label: 'Task Context: Initiate Session',
        category: CHAT_CATEGORY
    }, undefined, CHAT_CATEGORY_KEY);

    export const AI_CHAT_SUMMARIZE_CURRENT_SESSION = Command.toLocalizedCommand({
        id: 'ai-chat-summary-current-session',
        iconClass: codicon('go-to-editing-session'),
        label: 'Summarize Current Session',
        category: CHAT_CATEGORY
    }, undefined, CHAT_CATEGORY_KEY);

    export const AI_CHAT_OPEN_SUMMARY_FOR_CURRENT_SESSION = Command.toLocalizedCommand({
        id: 'ai-chat-open-current-session-summary',
        iconClass: codicon('note'),
        label: 'Open Current Session Summary',
        category: CHAT_CATEGORY
    }, undefined, CHAT_CATEGORY_KEY);
}

export const AI_CHAT_NEW_CHAT_WINDOW_COMMAND: Command = {
    id: 'ai-chat-ui.new-chat',
    iconClass: codicon('add')
};

export const AI_CHAT_SHOW_CHATS_COMMAND: Command = {
    id: 'ai-chat-ui.show-chats',
    iconClass: codicon('history')
};
