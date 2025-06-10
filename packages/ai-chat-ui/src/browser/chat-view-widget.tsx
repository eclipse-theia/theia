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
import { CommandService, deepClone, Emitter, Event, MessageService, URI } from '@theia/core';
import { ChatRequest, ChatRequestModel, ChatService, ChatSession, isActiveSessionChangedEvent, MutableChatModel } from '@theia/ai-chat';
import { BaseWidget, codicon, ExtractableWidget, Message, PanelLayout, PreferenceService, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AIChatInputWidget } from './chat-input-widget';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { ProgressBarFactory } from '@theia/core/lib/browser/progress-bar-factory';
import { FrontendVariableService } from '@theia/ai-core/lib/browser';

export namespace ChatViewWidget {
    export interface State {
        locked?: boolean;
        temporaryLocked?: boolean;
    }
}

@injectable()
export class ChatViewWidget extends BaseWidget implements ExtractableWidget, StatefulWidget {

    public static ID = 'chat-view-widget';
    static LABEL = nls.localize('theia/ai/chat/view/label', 'AI Chat');

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

    @inject(FrontendVariableService)
    protected readonly variableService: FrontendVariableService;

    @inject(ProgressBarFactory)
    protected readonly progressBarFactory: ProgressBarFactory;

    protected chatSession: ChatSession;

    protected _state: ChatViewWidget.State = { locked: false, temporaryLocked: false };
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
                const shouldScrollToEnd = !newState.locked && !newState.temporaryLocked;
                this.treeWidget.shouldScrollToEnd = shouldScrollToEnd;
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
        this.inputWidget.onUnpin = this.onUnpin.bind(this);
        this.inputWidget.onCancel = this.onCancel.bind(this);
        this.inputWidget.chatModel = this.chatSession.model;
        this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
        this.inputWidget.onDeleteChangeSet = this.onDeleteChangeSet.bind(this);
        this.inputWidget.onDeleteChangeSetElement = this.onDeleteChangeSetElement.bind(this);
        this.treeWidget.trackChatModel(this.chatSession.model);
        this.treeWidget.onScrollLockChange = this.onScrollLockChange.bind(this);

        this.initListeners();

        this.inputWidget.setEnabled(this.activationService.isActive);
        this.treeWidget.setEnabled(this.activationService.isActive);

        this.activationService.onDidChangeActiveStatus(change => {
            this.treeWidget.setEnabled(change);
            this.inputWidget.setEnabled(change);
            this.update();
        });
        this.toDispose.push(this.progressBarFactory({ container: this.node, insertMode: 'prepend', locationId: 'ai-chat' }));
    }

    protected initListeners(): void {
        this.toDispose.pushAll([
            this.chatService.onSessionEvent(event => {
                if (!isActiveSessionChangedEvent(event)) {
                    return;
                }
                const session = event.sessionId ? this.chatService.getSession(event.sessionId) : this.chatService.createSession();
                if (session) {
                    this.chatSession = session;
                    this.treeWidget.trackChatModel(this.chatSession.model);
                    this.inputWidget.chatModel = this.chatSession.model;
                    this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
                } else {
                    console.warn(`Session with ${event.sessionId} not found.`);
                }
            }),
            // The chat view needs to handle the submission of the edit request
            this.treeWidget.onDidSubmitEdit(request => {
                this.onQuery(request);
            })
        ]);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.inputWidget.activate();
    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<ChatViewWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        // Don't restore temporary lock state as it should reset on restart
        copy.temporaryLocked = false;
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

    protected async onQuery(query?: string | ChatRequest): Promise<void> {
        const chatRequest: ChatRequest = !query ? { text: '' } : typeof query === 'string' ? { text: query } : { ...query };
        if (chatRequest.text.length === 0) { return; }

        const requestProgress = await this.chatService.sendRequest(this.chatSession.id, chatRequest);
        requestProgress?.responseCompleted.then(responseModel => {
            if (responseModel.isError) {
                this.messageService.error(responseModel.errorObject?.message ??
                    nls.localize('theia/ai/chat-ui/errorChatInvocation', 'An error occurred during chat service invocation.'));
            }
        }).finally(() => {
            this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
        });
        if (!requestProgress) {
            this.messageService.error(`Was not able to send request "${chatRequest.text}" to session ${this.chatSession.id}`);
            return;
        }
        // Tree Widget currently tracks the ChatModel itself. Therefore no notification necessary.
    }

    protected onUnpin(): void {
        this.chatSession.pinnedAgent = undefined;
        this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
    }

    protected onCancel(requestModel: ChatRequestModel): void {
        this.chatService.cancelRequest(requestModel.session.id, requestModel.id);
    }

    protected onDeleteChangeSet(sessionId: string): void {
        this.chatService.deleteChangeSet(sessionId);
    }

    protected onDeleteChangeSetElement(sessionId: string, uri: URI): void {
        this.chatService.deleteChangeSetElement(sessionId, uri);
    }

    protected onScrollLockChange(temporaryLocked: boolean): void {
        this.setTemporaryLock(temporaryLocked);
    }

    lock(): void {
        this.state = { ...deepClone(this.state), locked: true, temporaryLocked: false };
    }

    unlock(): void {
        this.state = { ...deepClone(this.state), locked: false, temporaryLocked: false };
    }

    setTemporaryLock(locked: boolean): void {
        // Only set temporary lock if not permanently locked
        if (!this.state.locked) {
            this.state = { ...deepClone(this.state), temporaryLocked: locked };
        }
    }

    get isLocked(): boolean {
        return !!this.state.locked;
    }

    get isExtractable(): boolean {
        return this.secondaryWindow === undefined;
    }

    addContext(variable: AIVariableResolutionRequest): void {
        this.inputWidget.addContext(variable);
    }

    setSettings(settings: { [key: string]: unknown }): void {
        if (this.chatSession && this.chatSession.model) {
            const model = this.chatSession.model as MutableChatModel;
            model.setSettings(settings);
        }
    }

    getSettings(): { [key: string]: unknown } | undefined {
        return this.chatSession.model.settings;
    }
}
