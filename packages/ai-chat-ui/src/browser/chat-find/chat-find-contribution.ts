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
import { ApplicationShell, CommonCommands, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatInputFocusService } from '../chat-input-focus-service';
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

/** Monaco's find action, bound to Ctrl+F while any editor is open and run on the focused or last active editor. */
const MONACO_FIND_ACTION_ID = 'actions.find';

/**
 * Ctrl+F in the chat view opens the find bar over the response tree (or refocuses it) while the session has content
 * to search; in a chat input it does nothing.
 *
 * Besides its own binding, the contribution registers handlers for core's `CommonCommands.FIND` and Monaco's
 * `actions.find` that are enabled while the focus is in a chat view or a chat input, so that Ctrl+F never falls
 * through to Monaco's find there: that would open the find widget inside the chat input or in the editor of the main
 * area. Handlers are used rather than keybindings because the latter lose to Monaco's binding in the chat input
 * (`KeybindingRegistry.selectBindingByLocalContext`), whereas the most recently registered enabled handler runs.
 */
@injectable()
export class ChatFindContribution implements CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChatInputFocusService)
    protected readonly chatInputFocusService: ChatInputFocusService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_FIND_COMMAND, {
            isEnabled: () => this.findActiveChatViewWidget()?.treeWidget.canFind === true,
            execute: () => this.findActiveChatViewWidget()?.treeWidget.showFind()
        });
        commands.registerCommand(CHAT_FIND_HIDE_COMMAND, {
            isEnabled: () => this.findActiveChatViewWidget()?.treeWidget.isFindVisible === true,
            execute: () => this.findActiveChatViewWidget()?.treeWidget.hideFind()
        });
        const findHandler = {
            isEnabled: () => this.isChatInputFocused() || this.findActiveChatViewWidget() !== undefined,
            execute: () => this.find()
        };
        commands.registerHandler(CommonCommands.FIND.id, findHandler);
        commands.registerHandler(MONACO_FIND_ACTION_ID, findHandler);
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_FIND_COMMAND.id,
            keybinding: 'ctrlcmd+f',
            // A request's edit box is a chat input inside the response tree.
            when: 'chatResponseFocus && !chatInputFocus'
        });
        keybindings.registerKeybinding({
            command: CHAT_FIND_HIDE_COMMAND.id,
            keybinding: 'esc',
            when: 'chatFindVisible && chatResponseFocus'
        });
    }

    /** Opens or refocuses the find bar of the focused chat view; does nothing in a chat input or without content to search. */
    protected find(): void {
        if (this.isChatInputFocused()) {
            return;
        }
        const treeWidget = this.findActiveChatViewWidget()?.treeWidget;
        if (treeWidget?.canFind) {
            treeWidget.showFind();
        }
    }

    protected isChatInputFocused(): boolean {
        return this.chatInputFocusService.getFocused() !== undefined;
    }

    protected findActiveChatViewWidget(): ChatViewWidget | undefined {
        return ChatViewWidget.findActive(this.shell);
    }
}
