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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { ApplicationShell, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatCommands } from '../chat-view-commands';
import { ChatViewWidget } from '../chat-view-widget';

export const CHAT_FIND_COMMAND = Command.toLocalizedCommand({
    id: 'ai-chat.find',
    category: ChatCommands.CHAT_CATEGORY,
    label: 'Find in Chat'
}, 'theia/ai/chat-ui/find', ChatCommands.CHAT_CATEGORY_KEY);

export const CHAT_FIND_HIDE_COMMAND = Command.toLocalizedCommand({
    id: 'ai-chat.find.hide',
    category: ChatCommands.CHAT_CATEGORY,
    label: 'Hide Find in Chat'
}, 'theia/ai/chat-ui/findHide', ChatCommands.CHAT_CATEGORY_KEY);

/**
 * Ctrl+F in the chat view opens the find bar over the response tree. The binding takes precedence over core's
 * `CommonCommands.FIND` and Monaco's `actions.find` because it is registered later within the default scope,
 * the same mechanism `ChatInputPasteContribution` relies on for Ctrl+V.
 */
@injectable()
export class ChatFindContribution implements CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_FIND_COMMAND, {
            isEnabled: () => this.findActiveChatViewWidget() !== undefined,
            execute: () => this.findActiveChatViewWidget()?.treeWidget.showFind()
        });
        commands.registerCommand(CHAT_FIND_HIDE_COMMAND, {
            isEnabled: () => this.findActiveChatViewWidget()?.treeWidget.isFindVisible === true,
            execute: () => this.findActiveChatViewWidget()?.treeWidget.hideFind()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_FIND_COMMAND.id,
            keybinding: 'ctrlcmd+f',
            when: 'chatInputFocus || chatResponseFocus'
        });
        keybindings.registerKeybinding({
            command: CHAT_FIND_HIDE_COMMAND.id,
            keybinding: 'esc',
            when: 'chatFindVisible && chatResponseFocus'
        });
    }

    protected findActiveChatViewWidget(): ChatViewWidget | undefined {
        return ChatViewWidget.findActive(this.shell);
    }
}
