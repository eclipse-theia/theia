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
import { Disposable, DisposableCollection, generateUuid, ILogger, URI } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';

export const AskAITerminalInputConfiguration = Symbol('AskAITerminalInputConfiguration');
export interface AskAITerminalInputConfiguration extends AIChatInputConfiguration { }

export const AskAITerminalInputArgs = Symbol('AskAITerminalInputArgs');
export interface AskAITerminalInputArgs {
    onSubmit: (request: ChatRequest) => void | Promise<void>;
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

    @inject(ILogger)
    protected readonly logger: ILogger;

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
        this.onQuery = this.handleSubmit;
        this.onCancel = this.handleCancel;
    }

    protected override getResourceUri(): URI {
        return new URI(`ask-ai:/input-${this.resourceId}.${CHAT_VIEW_LANGUAGE_EXTENSION}`);
    }

    protected readonly handleSubmit = async (query: string, mode?: string): Promise<void> => {
        const userInput = query.trim();
        if (!userInput) {
            return;
        }

        const request: ChatRequest = {
            text: userInput,
            variables: this._chatModel.context.getVariables(),
            modeId: mode
        };

        try {
            await this.args?.onSubmit(request);
        } catch (error) {
            this.logger.error('Failed to submit Ask AI terminal request.', error);
        }
    };

    protected readonly handleCancel = (): void => {
        this.args?.onCancel();
    };

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
            this.logger.warn('Failed to determine Ask AI terminal receiving agent.', error);
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
        }
    }
}

export class AskAITerminalOverlay implements Disposable {
    protected readonly toDispose = new DisposableCollection();
    protected readonly containerNode: HTMLDivElement;
    protected readonly inputWidget: AskAITerminalInputWidget;
    protected disposed = false;

    constructor(
        protected readonly terminalWidget: TerminalWidgetImpl,
        inputWidgetFactory: AskAITerminalInputFactory,
        onSubmit: (chatRequest: ChatRequest) => void | Promise<void>,
        onCancel: () => void
    ) {
        this.containerNode = document.createElement('div');
        this.containerNode.className = 'ai-terminal-ask-overlay';
        terminalWidget.node.appendChild(this.containerNode);
        this.toDispose.push(Disposable.create(() => {
            if (this.containerNode.parentNode) {
                this.terminalWidget.node.removeChild(this.containerNode);
            }
        }));

        this.inputWidget = inputWidgetFactory({
            onSubmit: async request => {
                await onSubmit(request);
                this.dispose();
            },
            onCancel: () => {
                onCancel();
                this.dispose();
            }
        });
        this.toDispose.push(this.inputWidget);

        this.containerNode.appendChild(this.inputWidget.node);
        this.inputWidget.activate();
        this.inputWidget.update();
    }

    addDisposable(disposable: Disposable): void {
        this.toDispose.push(disposable);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.toDispose.dispose();
    }
}
