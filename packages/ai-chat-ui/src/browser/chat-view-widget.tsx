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
import { BaseWidget, codicon, Message, PanelLayout, StatefulWidget } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { ChatInputWidget } from './chat-input-widget';
import { ChatModel, ChatRequest, ChatService } from '@theia/ai-chat';
import { deepClone, Event, Emitter, MessageService } from '@theia/core';

export namespace ChatViewWidget {
    export interface State {
        locked?: boolean;
    }
}

@injectable()
export class ChatViewWidget extends BaseWidget implements StatefulWidget {

    public static ID = 'chat-view-widget';
    static LABEL = nls.localizeByDefault('Chat');

    @inject(ChatService)
    private chatService: ChatService;

    @inject(MessageService)
    private messageService: MessageService;

    // TODO: handle multiple sessions
    private chatModel: ChatModel;

    protected _state: ChatViewWidget.State = { locked: false };
    protected readonly onStateChangedEmitter = new Emitter<ChatViewWidget.State>();

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
            this.onStateChanged(newState => {
                this.treeWidget.shouldScrollToEnd = !newState.locked;
                this.update();
            })
        ]);
        const layout = this.layout = new PanelLayout();
        this.treeWidget.node.classList.add('chat-tree-view-widget');
        layout.addWidget(this.treeWidget);
        this.inputWidget.node.classList.add('chat-input-widget');
        layout.addWidget(this.inputWidget);
        this.inputWidget.onQuery = this.onQuery.bind(this);
        // TODO restore sessions if needed
        this.chatModel = this.chatService.createSession();
        this.treeWidget.trackChatModel(this.chatModel);
    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<ChatViewWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        this.state = copy;
    }

    protected get state(): ChatViewWidget.State {
        return this._state;
    }

    protected set state(state: ChatViewWidget.State) {
        this._state = state;
        this.onStateChangedEmitter.fire(this._state);
    }

    get onStateChanged(): Event<ChatViewWidget.State> {
        return this.onStateChangedEmitter.event;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
    }

    private async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }
        // send query

        const chatRequest: ChatRequest = {
            text: query
        };

        const requestProgress = await this.chatService.sendRequest(this.chatModel.id,
            chatRequest,
            e => { if (e instanceof Error) { this.messageService.error(e.message); } else { throw e; } });
        if (!requestProgress) {
            this.messageService.error(`Was not able to send request "${chatRequest.text}" to session ${this.chatModel.id}`);
        }
        // Tree Widget currently tracks the ChatModel itself. Therefore no notification necessary.
    }

    lock(): void {
        this.state = { ...deepClone(this.state), locked: true };
    }

    unlock(): void {
        this.state = { ...deepClone(this.state), locked: false };
    }

    get isLocked(): boolean {
        return !!this.state.locked;
    }
}
