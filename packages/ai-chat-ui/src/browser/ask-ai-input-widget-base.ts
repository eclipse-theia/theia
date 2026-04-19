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

import { ChatAgentLocation, ChatRequest, MutableChatModel } from '@theia/ai-chat';
import { generateUuid, ILogger, URI } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIChatInputConfiguration, AIChatInputWidget } from './chat-input-widget';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from './chat-view-language-contribution';

export interface AskAIInputBaseArgs {
    onSubmit: (request: ChatRequest) => void | Promise<void>;
    onCancel: () => void;
}

export interface AskAIInputBaseConfiguration extends AIChatInputConfiguration { }

@injectable()
export abstract class AskAIInputWidgetBase extends AIChatInputWidget {
    protected readonly resourceId = generateUuid();
    protected override heightInLines = 3;
    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly args: AskAIInputBaseArgs | undefined;

    protected abstract readonly chatAgentLocation: ChatAgentLocation;
    protected abstract get widgetId(): string;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = this.widgetId;

        const noOp = () => { };
        this.onUnpin = noOp;
        this.onCancel = noOp;
        this.onDeleteChangeSet = noOp;
        this.onDeleteChangeSetElement = noOp;

        this.chatModel = new MutableChatModel(this.chatAgentLocation);
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
            this.logger.error('Failed to submit Ask AI request.', error);
        }
    };

    protected readonly handleCancel = (): void => {
        this.args?.onCancel();
    };

    protected override onEscape(): void {
        this.handleCancel();
    }

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
            const agent = this.resolveAgentFromParsedRequest(parsedRequest);
            this.updateAgentState(agent);
        } catch (error) {
            this.logger.warn('Failed to determine receiving agent.', error);
            if (this.receivingAgent !== undefined) {
                this.chatInputReceivingAgentKey.set('');
                this.chatInputHasModesKey.set(false);
                this.receivingAgent = undefined;
                this.update();
            }
        }
    }
}
