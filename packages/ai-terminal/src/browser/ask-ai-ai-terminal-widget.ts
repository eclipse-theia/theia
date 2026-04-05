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

import { ChatAgentLocation, ChatRequest, MutableChatModel } from '@theia/ai-chat';
import { AIChatInputConfiguration, AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from '@theia/ai-chat-ui/lib/browser/chat-view-language-contribution';
import { generateUuid, URI } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';

export const AskAITerminalInputConfiguration = Symbol('AskAITerminalInputConfiguration');
export interface AskAITerminalInputConfiguration extends AIChatInputConfiguration { }

export const AskAITerminalInputArgs = Symbol('AskAITerminalInputArgs');
export interface AskAITerminalInputArgs {
    onSubmit: (request: ChatRequest) => void;
    onCancel: () => void;
}

export const AskAITerminalInputFactory = Symbol('AskAITerminalInputFactory');
export type AskAITerminalInputFactory = (args: AskAITerminalInputArgs) => AskAITerminalInputWidget;

/**
 * React input widget for Ask AI functionality, extending the AIChatInputWidget.
 */
@injectable()
export class AskAITerminalInputWidget extends AIChatInputWidget {
    public static override ID = 'ask-ai-terminal-input-widget';

    @inject(AskAITerminalInputArgs) @optional()
    protected readonly args: AskAITerminalInputArgs | undefined;

    @inject(AskAITerminalInputConfiguration) @optional()
    protected override readonly configuration: AskAITerminalInputConfiguration | undefined;

    protected readonly resourceId = generateUuid();
    protected override heightInLines = 3;

    @postConstruct()
    protected override init(): void {
        super.init();

        this.id = AskAITerminalInputWidget.ID;

        const noOp = () => { };
        // We need to set those values here, otherwise the widget will throw an error
        this.onUnpin = noOp;
        this.onCancel = noOp;
        this.onDeleteChangeSet = noOp;
        this.onDeleteChangeSetElement = noOp;

        // Create a standalone chat model for the widget (no session needed)
        this.chatModel = new MutableChatModel(ChatAgentLocation.Panel);

        this.setEnabled(true);
        this.onQuery = this.handleSubmit.bind(this);
        this.onCancel = this.handleCancel.bind(this);
    }

    protected override getResourceUri(): URI {
        return new URI(`ask-ai:/input-${this.resourceId}.${CHAT_VIEW_LANGUAGE_EXTENSION}`);
    }

    protected handleSubmit(query: string, mode?: string): Promise<void> {
        const userInput = query.trim();
        if (userInput) {
            const request: ChatRequest = {
                text: userInput,
                variables: this._chatModel.context.getVariables(),
                modeId: mode
            };

            this.args?.onSubmit(request);
        }
        return Promise.resolve();
    }

    protected handleCancel(): void {
        this.args?.onCancel();
    }

    protected override onEscape(): void {
        this.handleCancel();
    }

    /**
     * Override to detect receiving agent without requiring a chat session.
     * This implementation bypasses the session-based pinned agent logic since
     * Ask AI dialogs are ephemeral and don't support agent pinning.
     */
    protected override async updateReceivingAgent(): Promise<void> {
        if (!this.editorRef || !this._chatModel) {
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
            return;
        }

        try {
            const inputText = this.editorRef.getControl().getValue();
            const request = { text: inputText };
            const resolvedContext = { variables: [] };
            const parsedRequest = await this.chatRequestParser.parseChatRequest(request, this._chatModel.location, resolvedContext);

            // Get the agent directly without requiring a session
            // Uses the parent's helper method with session=undefined
            const agent = this.resolveAgentFromParsedRequest(parsedRequest);
            this.updateAgentState(agent);
        } catch (error) {
            console.warn('Failed to determine receiving agent:', error);
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
        }
    }
}

export class AskAiTerminalOverlay {

    protected containerNode: HTMLDivElement;
    protected inputWidget: AskAITerminalInputWidget;
    protected terminalWidget: TerminalWidgetImpl;

    constructor(
        terminalWidget: TerminalWidgetImpl,
        inputWidgetFactory: AskAITerminalInputFactory,
        onSubmit: (chatRequest: ChatRequest) => void,
        onCancel: () => void
    ) {
        // 1. Overlay container in the terminal's DOM
        this.terminalWidget = terminalWidget;
        this.containerNode = document.createElement('div');
        this.containerNode.className = 'ai-terminal-ask-overlay';
        terminalWidget.node.appendChild(this.containerNode);

        // 2. Create input widget via factory (factory binds args via child container)
        // Wrap callbacks to self-dispose when the overlay is dismissed
        this.inputWidget = inputWidgetFactory({
            onSubmit: request => { onSubmit(request); this.dispose(); },
            onCancel: () => { onCancel(); this.dispose(); }
        });

        // 3. Drop the widget's React root node into the overlay div
        this.containerNode.appendChild(this.inputWidget.node);

        // 4. Activate and render
        this.inputWidget.activate();
        this.inputWidget.update();
    }

    dispose(): void {
        this.inputWidget.dispose();
        if (this.containerNode.parentNode) {
            this.terminalWidget.node.removeChild(this.containerNode);
        }
    }
}
