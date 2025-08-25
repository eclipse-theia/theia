// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
import { AIChatInputWidget } from './chat-input-widget';
import { ChatInputHistoryService } from './chat-input-history';

const CHAT_INPUT_PREVIOUS_PROMPT_COMMAND = Command.toDefaultLocalizedCommand({
    id: 'chat-input:previous-prompt',
    label: 'Previous Prompt'
});

const CHAT_INPUT_NEXT_PROMPT_COMMAND = Command.toDefaultLocalizedCommand({
    id: 'chat-input:next-prompt',
    label: 'Next Prompt'
});

const CHAT_INPUT_CLEAR_HISTORY_COMMAND = Command.toDefaultLocalizedCommand({
    id: 'chat-input:clear-history',
    category: 'Chat',
    label: 'Clear Input Prompt History'
});

@injectable()
export class ChatInputHistoryContribution implements CommandContribution, KeybindingContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChatInputHistoryService)
    protected readonly historyService: ChatInputHistoryService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CHAT_INPUT_PREVIOUS_PROMPT_COMMAND, {
            execute: () => this.executeNavigatePrevious(),
            isEnabled: () => this.isNavigationEnabled()
        });

        commands.registerCommand(CHAT_INPUT_NEXT_PROMPT_COMMAND, {
            execute: () => this.executeNavigateNext(),
            isEnabled: () => this.isNavigationEnabled()
        });

        commands.registerCommand(CHAT_INPUT_CLEAR_HISTORY_COMMAND, {
            execute: () => this.historyService.clearHistory(),
            isEnabled: () => this.historyService.getPrompts().length > 0
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHAT_INPUT_PREVIOUS_PROMPT_COMMAND.id,
            keybinding: 'up',
            when: 'chatInputFocus && chatInputFirstLine'
        });

        keybindings.registerKeybinding({
            command: CHAT_INPUT_NEXT_PROMPT_COMMAND.id,
            keybinding: 'down',
            when: 'chatInputFocus && chatInputLastLine'
        });
    }

    protected executeNavigatePrevious(): void {
        const chatInputWidget = this.findFocusedChatInput();
        if (!chatInputWidget || !chatInputWidget.editor) {
            return;
        }

        const currentInput = chatInputWidget.editor.getControl().getValue();
        const previousPrompt = chatInputWidget.getPreviousPrompt(currentInput);

        if (previousPrompt !== undefined) {
            chatInputWidget.editor.getControl().setValue(previousPrompt);
            this.positionCursorAtEnd(chatInputWidget);
        }
    }

    protected executeNavigateNext(): void {
        const chatInputWidget = this.findFocusedChatInput();
        if (!chatInputWidget || !chatInputWidget.editor) {
            return;
        }

        const nextPrompt = chatInputWidget.getNextPrompt();

        if (nextPrompt !== undefined) {
            chatInputWidget.editor.getControl().setValue(nextPrompt);
            this.positionCursorAtEnd(chatInputWidget);
        }
    }

    protected positionCursorAtEnd(widget: AIChatInputWidget): void {
        const editor = widget.editor?.getControl();
        const model = editor?.getModel();

        if (editor && model) {
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineContent(lastLine).length + 1;
            editor.setPosition({ lineNumber: lastLine, column: lastColumn });
            editor.focus();

            setTimeout(() => {
                // Trigger cursor position update after setting value
                if (widget.editor?.getControl().hasWidgetFocus()) {
                    widget.updateCursorPositionKeys();
                }
            }, 0);
        }
    }

    protected findFocusedChatInput(): AIChatInputWidget | undefined {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
            return;
        }
        const activeWidget = this.shell.findWidgetForElement(activeElement);
        if (!(activeWidget instanceof AIChatInputWidget)) {
            return;
        }
        if (!activeWidget.inputConfiguration?.enablePromptHistory) {
            return;
        }
        if (!activeWidget.editor?.getControl().hasWidgetFocus()) {
            return;
        }
        return activeWidget;
    }

    protected isNavigationEnabled(): boolean {
        const chatInputWidget = this.findFocusedChatInput();
        return chatInputWidget !== undefined &&
            chatInputWidget.inputConfiguration?.enablePromptHistory !== false;
    }
}
