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
import { BaseWidget, codicon, Message, PanelLayout } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { ChatInputWidget } from './chat-input-widget';
import { AgentDispatcher } from '@theia/ai-agent';
import { ChatMessage, TextChatResponsePart } from '@theia/ai-model-provider/src/common';

@injectable()
export class ChatViewWidget extends BaseWidget {

    public static ID = 'chat-view-widget';
    static LABEL = nls.localizeByDefault('Chat');

    @inject(AgentDispatcher) private agentDispatcher: AgentDispatcher;

    constructor(
        @inject(ChatViewTreeWidget)
        readonly treeWidget: ChatViewTreeWidget,
        @inject(ChatInputWidget)
        readonly inputWidget: ChatInputWidget
    ) {
        super();
        this.id = ChatViewWidget.ID;
        this.title.label = ChatViewWidget.LABEL;
        this.title.caption = ChatViewWidget.LABEL;
        this.title.iconClass = codicon('comment-discussion');
        this.title.closable = true;
        this.node.classList.add('chat-view-widget');
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.treeWidget,
            this.inputWidget,
        ]);
        const layout = this.layout = new PanelLayout();
        this.treeWidget.node.classList.add('chat-tree-view-widget');
        layout.addWidget(this.treeWidget);
        this.inputWidget.node.classList.add('chat-input-widget');
        layout.addWidget(this.inputWidget);
        this.inputWidget.onQuery = this.onQuery.bind(this);
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
    }

    private async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }
        // send query
        const queryMessages: ChatMessage[] = [{ actor: 'user', message: query }];
        const queryPart: TextChatResponsePart = { type: 'text', message: query };
        const response = await this.agentDispatcher.sendRequest(queryMessages);
        this.treeWidget.response = [queryPart, ...response];
    }

}
