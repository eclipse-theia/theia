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
import { AICommandHandlerFactory, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { isObject, MenuContribution, MenuModelRegistry } from '@theia/core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { Coordinate } from '@theia/core/lib/browser/context-menu-renderer';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorContextMenu, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from '@theia/monaco/lib/browser/monaco-command-registry';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { AskAIInputWidget } from './ask-ai-input-widget';

export namespace AI_EDITOR_COMMANDS {
    export const AI_EDITOR_ASK_AI: Command = Command.toLocalizedCommand({
        id: 'ai-editor.contextAction',
        label: 'Ask AI',
        iconClass: codicon('sparkle')
    }, 'theia/ai-editor/contextMenu');
    export const AI_EDITOR_SEND_TO_CHAT: Command = Command.toLocalizedCommand({
        id: 'ai-editor.sendToChat',
        label: 'Send to AI Chat'
    }, 'theia/ai-editor/sendToChat');
};

@injectable()
export class AiEditorCommandContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(MonacoCommandRegistry)
    protected readonly monacoCommandRegistry: MonacoCommandRegistry;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    private askAiInputWidget: AskAIInputWidget | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI);
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT);

        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id, this.wrapMonacoHandler(this.showInputWidgetHandler()));
        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT.id, this.wrapMonacoHandler(this.sendToChatHandler()));
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
            },
            isEnabled: (editor: MonacoEditor, ...args: unknown[]) =>
                this.shell.currentWidget instanceof EditorWidget && (this.shell.currentWidget as EditorWidget).editor === editor
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
            execute: (_editor: MonacoEditor, ...args: unknown[]) => {
                if (containsPrompt(args)) {
                    const prompt = args
                        .filter(isPromptArg)
                        .map(arg => arg.prompt)
                        .join();
                    this.createNewChatSession(prompt);
                }
            },
            isEnabled: (...args: unknown[]) => containsPrompt(args)
        };
    }

    private createNewChatSession(prompt: string): void {
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
        this.chatService.sendRequest(session.id, {
            text: `${prompt} #editorContext`
        });
    }

    protected wrapMonacoHandler(handler: MonacoEditorCommandHandler): MonacoEditorCommandHandler {
        const wrappedHandler = this.commandHandlerFactory(handler);
        return {
            execute: wrappedHandler.execute,
            isEnabled: wrappedHandler.isEnabled
        };
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id,
            label: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.label,
            icon: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.iconClass,
            when: ENABLE_AI_CONTEXT_KEY
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

function containsPrompt(args: unknown[]): args is (unknown | { prompt: string })[] {
    return args.filter(arg => isPromptArg(arg)).length > 0;
}

function isPromptArg(arg: unknown): arg is { prompt: string } {
    return isObject(arg) && 'prompt' in arg;
}
