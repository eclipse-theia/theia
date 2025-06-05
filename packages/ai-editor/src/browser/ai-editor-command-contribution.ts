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
import { MenuContribution, MenuModelRegistry } from '@theia/core';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorContextMenu } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from '@theia/monaco/lib/browser/monaco-command-registry';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { AskAIInputMonacoZoneWidget } from './ask-ai-input-monaco-zone-widget';
import { AskAIInputFactory } from './ask-ai-input-widget';

export namespace AI_EDITOR_COMMANDS {
    export const AI_EDITOR_ASK_AI: Command = {
        id: 'ai-editor.contextAction',
        label: nls.localize('theia/ai-editor/contextMenu', 'Ask AI [Experimental]')
    };
};

@injectable()
export class AiEditorCommandContribution implements CommandContribution, MenuContribution {

    @inject(MonacoCommandRegistry)
    protected readonly monacoCommandRegistry: MonacoCommandRegistry;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AskAIInputFactory)
    protected readonly askAIInputFactory: AskAIInputFactory;

    protected askAiInputWidget: AskAIInputMonacoZoneWidget | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI);
        this.monacoCommandRegistry.registerHandler(AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id, this.showInputWidgetHandler());
    }

    protected showInputWidgetHandler(): MonacoEditorCommandHandler {
        return {
            execute: (editor: MonacoEditor) => {
                this.showInputWidget(editor);
            }
        };
    }

    private showInputWidget(editor: MonacoEditor): void {
        this.cleanupInputWidget();

        // Create the input widget using the factory
        this.askAiInputWidget = new AskAIInputMonacoZoneWidget(editor.getControl(), this.askAIInputFactory);

        this.askAiInputWidget.onSubmit(request => {
            const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true });
            this.chatService.sendRequest(session.id, {
                ...request,
                text: `${request.text} #editorContext`,
            });
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

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.id,
            label: AI_EDITOR_COMMANDS.AI_EDITOR_ASK_AI.label
        });
    }
}
