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
import { LanguageModelBackendService, LanguageModelChatMessage, LanguageModelClient } from '../common';

@injectable()
export class ChatWidget extends ReactWidget {
    public static ID = 'ai-chat-main';
    static LABEL = nls.localizeByDefault('Chat');

    @inject(LanguageModelBackendService)
    private languageModelBackendService: LanguageModelBackendService;

    @inject(LanguageModelClient)
    private languageModelClient: LanguageModelClient;

    private chatMessages: LanguageModelChatMessage[] = [];
    private queryResult: LanguageModelChatMessage|undefined;

    @postConstruct()
    protected init(): void {
        this.id = ChatWidget.ID;
        this.title.label = ChatWidget.LABEL;
        this.title.caption = ChatWidget.LABEL;
        this.title.closable = false;
        this.title.iconClass = codicon('comment-discussion'); // example widget icon.
        this.update();
        this.languageModelClient.onNextQueryResultToken(token => {
            if (this.queryResult === undefined) {
                this.queryResult = {actor: 'ai', message: ''};
            }
            this.queryResult.message += token;
            this.update();
        });
        this.languageModelClient.onQueryResultFinished(() => {
            if (this.queryResult) {
                this.chatMessages.push(this.queryResult);
            }
            this.queryResult = undefined;
            this.update();
        });
    }
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus({ preventScroll: true });
    }
    protected render(): React.ReactNode {
        return <AIChat chatMessages={this.chatMessages} queryResult={this.queryResult} onQuery={this.onQuery.bind(this)}></AIChat>;
    }

    private async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }
        this.chatMessages.push({ actor: 'user', message: query });
        this.languageModelBackendService.sendRequest(this.chatMessages);
    }

}
