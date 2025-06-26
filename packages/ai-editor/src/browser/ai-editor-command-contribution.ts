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

import { ChatAgentLocation, ChatRequest, ChatService } from '@theia/ai-chat';
import { AICommandHandlerFactory, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';
import { isObject, isString, MenuContribution, MenuModelRegistry } from '@theia/core';
import { ApplicationShell, codicon, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorContextMenu, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from '@theia/monaco/lib/browser/monaco-command-registry';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { AskAIInputMonacoZoneWidget } from './ask-ai-input-monaco-zone-widget';
import { AskAIInputFactory } from './ask-ai-input-widget';

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

    @inject(AskAIInputFactory)
    protected readonly askAIInputFactory: AskAIInputFactory;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected askAiInputWidget: AskAIInputMonacoZoneWidget | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI);
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT);

        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id, this.wrapMonacoHandler(this.showInputWidgetHandler()));
        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_SEND_TO_CHAT.id, this.wrapMonacoHandler(this.sendToChatHandler()));
    }

    protected showInputWidgetHandler(): MonacoEditorCommandHandler {
        return {
            execute: (editor: MonacoEditor) => {
                this.showInputWidget(editor);
            },
            isEnabled: (editor: MonacoEditor) =>
                this.shell.currentWidget instanceof EditorWidget && (this.shell.currentWidget as EditorWidget).editor === editor
        };
    }

    private showInputWidget(editor: MonacoEditor): void {
        this.cleanupInputWidget();

        // Create the input widget using the factory
        this.askAiInputWidget = new AskAIInputMonacoZoneWidget(editor.getControl(), this.askAIInputFactory);

        this.askAiInputWidget.onSubmit(request => {
            this.createNewChatSession(request);
            this.cleanupInputWidget();
        });

        const line = editor.getControl().getPosition()?.lineNumber ?? 1;

        this.askAiInputWidget.showAtLine(line);

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
                    this.createNewChatSession({ text: prompt } as ChatRequest);
                }
            },
            isEnabled: (_editor: MonacoEditor, ...args: unknown[]) => containsPrompt(args)
        };
    }

    private createNewChatSession(request: ChatRequest): void {
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
        this.chatService.sendRequest(session.id, {
            ...request,
            text: `${request.text} #editorContext`,
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

function containsPrompt(args: unknown[]): boolean {
    return args.some(arg => isPromptArg(arg));
}

function isPromptArg(arg: unknown): arg is { prompt: string } {
    return isObject(arg) && 'prompt' in arg && isString(arg.prompt);
}
