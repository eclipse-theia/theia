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
}

export const AI_CHAT_NEW_CHAT_WINDOW_COMMAND: Command = {
    id: 'ai-chat-ui.new-chat',
    iconClass: codicon('add')
};

export const AI_CHAT_SHOW_CHATS_COMMAND: Command = {
    id: 'ai-chat-ui.show-chats',
    iconClass: codicon('history')
};
