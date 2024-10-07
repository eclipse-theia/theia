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
import { CommandService, deepClone, Emitter, Event, MessageService } from '@theia/core';
import { ChatRequest, ChatRequestModel, ChatRequestModelImpl, ChatService, ChatSession } from '@theia/ai-chat';
import { BaseWidget, codicon, ExtractableWidget, PanelLayout, PreferenceService, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIChatInputWidget } from './chat-input-widget';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';

export namespace ChatViewWidget {
    export interface State {
        locked?: boolean;
    }
}

@injectable()
export class ChatViewWidget extends BaseWidget implements ExtractableWidget, StatefulWidget {

    public static ID = 'chat-view-widget';
    static LABEL = `✨ ${nls.localizeByDefault('Chat')} [Experimental]`;

    @inject(ChatService)
    protected chatService: ChatService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    protected chatSession: ChatSession;

    protected _state: ChatViewWidget.State = { locked: false };
    protected readonly onStateChangedEmitter = new Emitter<ChatViewWidget.State>();

    secondaryWindow: Window | undefined;

    constructor(
        @inject(ChatViewTreeWidget)
        readonly treeWidget: ChatViewTreeWidget,
        @inject(AIChatInputWidget)
        readonly inputWidget: AIChatInputWidget
    ) {
        super();
        this.id = ChatViewWidget.ID;
        this.title.label = ChatViewWidget.LABEL;
        this.title.caption = ChatViewWidget.LABEL;
        this.title.iconClass = codicon('comment-discussion');
        this.title.closable = true;
        this.node.classList.add('chat-view-widget');
        this.update();
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
        this.chatSession = this.chatService.createSession();

        this.inputWidget.onQuery = this.onQuery.bind(this);
        this.inputWidget.onCancel = this.onCancel.bind(this);
        this.inputWidget.chatModel = this.chatSession.model;
        this.treeWidget.trackChatModel(this.chatSession.model);

        this.initListeners();

        this.inputWidget.setEnabled(this.activationService.isActive);
        this.treeWidget.setEnabled(this.activationService.isActive);

        this.activationService.onDidChangeActiveStatus(change => {
            this.treeWidget.setEnabled(change);
            this.inputWidget.setEnabled(change);
            this.update();
        });
    }

    protected initListeners(): void {
        this.toDispose.push(
            this.chatService.onActiveSessionChanged(event => {
                const session = event.sessionId ? this.chatService.getSession(event.sessionId) : this.chatService.createSession();
                if (session) {
                    this.chatSession = session;
                    this.treeWidget.trackChatModel(this.chatSession.model);
                    this.inputWidget.chatModel = this.chatSession.model;
                    if (event.focus) {
                        this.show();
                    }
                } else {
                    console.warn(`Session with ${event.sessionId} not found.`);
                }
            })
        );
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

    protected async onQuery(query: string): Promise<void> {
        if (query.length === 0) { return; }

        const chatRequest: ChatRequest = {
            text: query
        };

        const requestProgress = await this.chatService.sendRequest(this.chatSession.id, chatRequest);
        requestProgress?.responseCompleted.then(responseModel => {
            if (responseModel.isError) {
                this.messageService.error(responseModel.errorObject?.message ?? 'An error occurred druring chat service invocation.');
            }
        });
        if (!requestProgress) {
            this.messageService.error(`Was not able to send request "${chatRequest.text}" to session ${this.chatSession.id}`);
            return;
        }
        // Tree Widget currently tracks the ChatModel itself. Therefore no notification necessary.
    }

    protected onCancel(requestModel: ChatRequestModel): void {
        // TODO we should pass a cancellation token with the request (or retrieve one from the request invocation) so we can cleanly cancel here
        // For now we cancel manually via casting
        (requestModel as ChatRequestModelImpl).response.cancel();
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

    get isExtractable(): boolean {
        return this.secondaryWindow === undefined;
    }
}
