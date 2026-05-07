// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { ChatViewWidget } from './chat-view-widget';
import { ChatCommands } from './chat-view-commands';

export const CHAT_FOCUS_INPUT_COMMAND = Command.toLocalizedCommand({
    id: 'ai-chat.focus-input',
    category: ChatCommands.CHAT_CATEGORY,
    label: 'Focus Chat Input'
}, 'theia/ai/chat-ui/focusInput', ChatCommands.CHAT_CATEGORY_KEY);

export const CHAT_FOCUS_RESPONSE_COMMAND = Command.toLocalizedCommand({
    id: 'ai-chat.focus-response',
    category: ChatCommands.CHAT_CATEGORY,
    label: 'Focus Chat Response'
}, 'theia/ai/chat-ui/focusResponse', ChatCommands.CHAT_CATEGORY_KEY);

@injectable()
export class ChatFocusContribution implements CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_FOCUS_INPUT_COMMAND, {
            execute: () => this.focusInput(),
            isEnabled: () => this.findActiveChatViewWidget() !== undefined
        });
        commands.registerCommand(CHAT_FOCUS_RESPONSE_COMMAND, {
            execute: () => this.focusResponse(),
            isEnabled: () => this.findActiveChatViewWidget() !== undefined
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_FOCUS_RESPONSE_COMMAND.id,
            keybinding: 'ctrlcmd+up',
            when: 'chatInputFocus && !suggestWidgetVisible'
        });
        keybindings.registerKeybinding({
            command: CHAT_FOCUS_INPUT_COMMAND.id,
            keybinding: 'ctrlcmd+down',
            when: 'chatResponseFocus'
        });
    }

    protected focusInput(): void {
        const chatViewWidget = this.findActiveChatViewWidget();
        if (chatViewWidget) {
            chatViewWidget.inputWidget.activate();
        }
    }

    protected focusResponse(): void {
        const chatViewWidget = this.findActiveChatViewWidget();
        if (chatViewWidget) {
            chatViewWidget.treeWidget.node.focus();
        }
    }

    protected findActiveChatViewWidget(): ChatViewWidget | undefined {
        const activeWidget = this.shell.activeWidget;
        if (activeWidget instanceof ChatViewWidget) {
            return activeWidget;
        }
        // Also check if any part of the chat view has focus
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
            const widget = this.shell.findWidgetForElement(activeElement);
            if (widget instanceof ChatViewWidget) {
                return widget;
            }
            // Check parent widgets (e.g., when input widget has focus)
            let parent = widget?.parent;
            while (parent) {
                if (parent instanceof ChatViewWidget) {
                    return parent;
                }
                parent = parent.parent;
            }
        }
        return undefined;
    }
}
