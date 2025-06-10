// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgentLocation, ChatService } from '@theia/ai-chat';
import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { MenuContribution, MenuModelRegistry } from '@theia/core';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { Coordinate } from '@theia/core/lib/browser/context-menu-renderer';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorContextMenu } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from '@theia/monaco/lib/browser/monaco-command-registry';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { AskAIInputWidget } from './ask-ai-input-widget';

export namespace AI_EDITOR_COMMANDS {
    export const AI_EDITOR_ASK_AI: Command = {
        id: 'ai-editor.contextAction',
        label: nls.localize('theia/ai-editor/contextMenu', 'Ask AI [Experimental]')
    };
    export const AI_EDITOR_SEND_TO_CHAT: Command = {
        id: 'ai-editor.sendToChat',
        label: nls.localize('theia/ai-editor/sendToChat', 'Send to AI Chat [Experimental]')
    };
};

@injectable()
export class AiEditorCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(MonacoCommandRegistry)
    protected readonly monacoCommandRegistry: MonacoCommandRegistry;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    private askAiInputWidget: AskAIInputWidget | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI);
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT);

        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id, this.showInputWidgetHandler());
        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT.id, this.sendToChatHandler());
    }

    protected showInputWidgetHandler(): MonacoEditorCommandHandler {
        return {
            execute: (editor: MonacoEditor, position?: Coordinate) => {
                let coordinates: Coordinate;

                if (position) {
                    // Called from context menu - use provided position
                    coordinates = { x: position.x, y: position.y + 10 };
                } else {
                    // Called from keybinding - calculate position from cursor in editor
                    const cursorPosition = editor.getControl().getPosition();
                    if (cursorPosition) {
                        const editorNode = editor.getControl().getDomNode();
                        if (editorNode) {
                            const editorRect = editorNode.getBoundingClientRect();
                            const coordinatesInEditor = editor.getControl().getScrolledVisiblePosition(cursorPosition);

                            if (coordinatesInEditor) {
                                // Calculate screen coordinates from editor-relative coordinates
                                coordinates = {
                                    x: editorRect.left + coordinatesInEditor.left,
                                    y: editorRect.top + coordinatesInEditor.top + coordinatesInEditor.height + 5
                                };
                            } else {
                                // Fallback: center of editor viewport
                                coordinates = {
                                    x: editorRect.left + editorRect.width / 2,
                                    y: editorRect.top + editorRect.height / 2
                                };
                            }
                        } else {
                            // Ultimate fallback: center of screen
                            coordinates = {
                                x: window.innerWidth / 2,
                                y: window.innerHeight / 2
                            };
                        }
                    } else {
                        // Fallback if no cursor position available
                        coordinates = {
                            x: window.innerWidth / 2,
                            y: window.innerHeight / 2
                        };
                    }
                }

                this.showInputWidget(coordinates);
            }
        };
    }

    private showInputWidget(coordinates: Coordinate): void {
        this.cleanupInputWidget();

        this.askAiInputWidget = new AskAIInputWidget();

        this.askAiInputWidget.onSubmit(event => {
            this.createNewChatSession(event.userInput);
        });

        this.askAiInputWidget.show(coordinates);

        this.askAiInputWidget.onCancel(() => {
            this.cleanupInputWidget();
        });
    }

    private cleanupInputWidget(): void {
        if (this.askAiInputWidget) {
            this.askAiInputWidget.dispose();
            this.askAiInputWidget = undefined;
        }
    }

    protected sendToChatHandler(): MonacoEditorCommandHandler {
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            execute: (_editor: MonacoEditor, ...args: any[]) => {
                const prompt = args[0].prompt;
                this.createNewChatSession(prompt);
            }
        };
    }

    private createNewChatSession(prompt: string): void {
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
        this.chatService.sendRequest(session.id, {
            text: `${prompt} #editorContext`
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id,
            label: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.label
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({
            command: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id,
            keybinding: 'ctrlcmd+i',
            when: `${ENABLE_AI_CONTEXT_KEY} && editorFocus && !editorReadonly`
        });
    }
}
