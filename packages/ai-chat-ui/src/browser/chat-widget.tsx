// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { Message, ReactWidget, codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { AIChat } from './ai-chat';
import { ChatModel, ChatRequest, ChatService, getMessages } from '@theia/ai-agent';
import { ILogger } from '@theia/core';

@injectable()
export class ChatWidget extends ReactWidget {
    public static ID = 'ai-chat-main';
    static LABEL = nls.localizeByDefault('Chat');

    @inject(ChatService)
    private chatService: ChatService;

    @inject(ILogger)
    private logger: ILogger;

    // TODO: handle multiple sessions
    private chatModel: ChatModel;

    @postConstruct()
    protected init(): void {
        this.id = ChatWidget.ID;
        this.title.label = ChatWidget.LABEL;
        this.title.caption = ChatWidget.LABEL;
        this.title.closable = false;
        this.title.iconClass = codicon('comment-discussion'); // example widget icon.
        this.update();
        // TODO restore sessions if needed
        this.chatModel = this.chatService.createSession();
    }
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus({ preventScroll: true });
    }
    protected render(): React.ReactNode {
        return <AIChat chatMessages={getMessages(this.chatModel)} onQuery={this.onQuery.bind(this)}></AIChat>;
    }

    private async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }

        const chatRequest: ChatRequest = {
            text: query
        };
        const requestProgress = await this.chatService.sendRequest(this.chatModel.id, chatRequest);
        if (!requestProgress) {
            this.logger.error(`Was not able to send request "${chatRequest.text}" to session ${this.chatModel.id}`);
            return;
        }
        // TODO instead of directly handling the responseModel we could go trough an intermediate view model which
        // manages all UI logic
        const responseModel = await requestProgress.responseCreated;
        responseModel.onDidChange(() => this.update());
    }
}
