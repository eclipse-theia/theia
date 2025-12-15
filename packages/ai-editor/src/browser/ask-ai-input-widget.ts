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

import { ChatRequest, MutableChatModel } from '@theia/ai-chat';
import { AIChatInputConfiguration, AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { CHAT_VIEW_LANGUAGE_EXTENSION } from '@theia/ai-chat-ui/lib/browser/chat-view-language-contribution';
import { generateUuid, URI } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';

export const AskAIInputConfiguration = Symbol('AskAIInputConfiguration');
export interface AskAIInputConfiguration extends AIChatInputConfiguration { }

export const AskAIInputArgs = Symbol('AskAIInputArgs');
export interface AskAIInputArgs {
    onSubmit: (request: ChatRequest) => void;
    onCancel: () => void;
}

export const AskAIInputFactory = Symbol('AskAIInputFactory');
export type AskAIInputFactory = (args: AskAIInputArgs) => AskAIInputWidget;

/**
 * React input widget for Ask AI functionality, extending the AIChatInputWidget.
 */
@injectable()
export class AskAIInputWidget extends AIChatInputWidget {
    public static override ID = 'ask-ai-input-widget';

    @inject(AskAIInputArgs) @optional()
    protected readonly args: AskAIInputArgs | undefined;

    @inject(AskAIInputConfiguration) @optional()
    protected override readonly configuration: AskAIInputConfiguration | undefined;

    protected readonly resourceId = generateUuid();
    protected override heightInLines = 3;

    @postConstruct()
    protected override init(): void {
        super.init();

        this.id = AskAIInputWidget.ID;

        const noOp = () => { };
        // We need to set those values here, otherwise the widget will throw an error
        this.onUnpin = noOp;
        this.onCancel = noOp;
        this.onDeleteChangeSet = noOp;
        this.onDeleteChangeSetElement = noOp;

        // Create a temporary chat model for the widget
        this.chatModel = new MutableChatModel();

        this.setEnabled(true);
        this.onQuery = this.handleSubmit.bind(this);
        this.onCancel = this.handleCancel.bind(this);
    }

    protected override getResourceUri(): URI {
        return new URI(`ask-ai:/input-${this.resourceId}.${CHAT_VIEW_LANGUAGE_EXTENSION}`);
    }

    protected handleSubmit(query: string): Promise<void> {
        const userInput = query.trim();
        if (userInput) {
            const request: ChatRequest = { text: userInput, variables: this._chatModel.context.getVariables() };

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
}
