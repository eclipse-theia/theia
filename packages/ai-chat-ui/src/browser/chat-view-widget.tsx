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
import { CommandService, ContributionProvider, deepClone, Emitter, Event, MessageService, URI, ILogger } from '@theia/core';
import {
    ChatRequest, ChatRequestModel, ChatService, ChatSession, ChatSessionSettings,
    formatProviderError, formattedProviderErrorToShortString, isActiveSessionChangedEvent, MutableChatModel
} from '@theia/ai-chat';
import { GenericCapabilitySelections, AIVariableResolutionRequest } from '@theia/ai-core';
import { ApplicationShell, BaseWidget, codicon, ExtractableWidget, Message, PanelLayout, StatefulWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { AIChatInputWidget } from './chat-input-widget';
import { ChatBannerWidget } from './chat-banner-widget';
import { ChatViewTreeWidget, ChatWelcomeMessageProvider } from './chat-tree-view/chat-view-tree-widget';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';
import { ProgressBarFactory } from '@theia/core/lib/browser/progress-bar-factory';
import { FrontendVariableService } from '@theia/ai-core/lib/browser';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';

export namespace ChatViewWidget {
    export type SessionScrollState = ChatViewTreeWidget.SessionScrollState;
    export interface State {
        locked?: boolean;
        temporaryLocked?: boolean;
        sessionStates?: Record<string, SessionScrollState>;
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

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(FrontendVariableService)
    protected readonly variableService: FrontendVariableService;

    @inject(ProgressBarFactory)
    protected readonly progressBarFactory: ProgressBarFactory;

    @inject(FrontendLanguageModelRegistry)
    protected readonly languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(ContributionProvider) @named(ChatWelcomeMessageProvider)
    protected readonly welcomeMessageProviders: ContributionProvider<ChatWelcomeMessageProvider>;

    @inject(ILogger) @named('ai-chat-ui:ChatViewWidget')
    protected readonly logger: ILogger;

    protected chatSession: ChatSession;

    protected readonly sessionStates = new Map<string, ChatViewWidget.SessionScrollState>();

    protected _state: ChatViewWidget.State = { locked: false, temporaryLocked: false };
    protected readonly onStateChangedEmitter = new Emitter<ChatViewWidget.State>();

    isExtractable = true;
    secondaryWindow: Window | undefined;

    constructor(
        @inject(ChatViewTreeWidget)
        readonly treeWidget: ChatViewTreeWidget,
        @inject(AIChatInputWidget)
        readonly inputWidget: AIChatInputWidget,
        @inject(ChatBannerWidget)
        readonly bannerWidget: ChatBannerWidget
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
            this.bannerWidget,
            this.onStateChanged(newState => {
                const shouldScrollToEnd = !newState.locked && !newState.temporaryLocked;
                this.treeWidget.shouldScrollToEnd = shouldScrollToEnd;
                this.update();
            })
        ]);
        const layout = this.layout = new PanelLayout();

        layout.addWidget(this.bannerWidget);
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

        this.updateInputEnabledState();

        this.activationService.onDidChangeCanRun(change => {
            this.treeWidget.setEnabled(change);
            this.updateInputEnabledState();
            this.update();
        });

        this.toDispose.push(
            this.languageModelRegistry.onChange(() => {
                this.updateInputEnabledState();
            })
        );

        for (const provider of this.welcomeMessageProviders.getContributions()) {
            if (provider.onStateChanged) {
                this.toDispose.push(provider.onStateChanged(() => {
                    this.updateInputEnabledState();
                    this.update();
                }));
            }
        }

        this.toDispose.push(this.progressBarFactory({ container: this.node, insertMode: 'prepend', locationId: 'ai-chat' }));
    }

    protected async updateInputEnabledState(): Promise<void> {
        const shouldEnable = this.activationService.canRun && await this.shouldEnableInput();
        this.inputWidget.setEnabled(shouldEnable);
        this.treeWidget.setEnabled(this.activationService.canRun);
    }

    /**
     * Returns the highest-priority welcome message provider for backward-compatible property access.
     */
    protected get welcomeProvider(): ChatWelcomeMessageProvider | undefined {
        return this.welcomeMessageProviders.getContributions()
            .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
    }

    protected async shouldEnableInput(): Promise<boolean> {
        const provider = this.welcomeProvider;
        if (!provider) {
            return true;
        }
        const hasReadyModels = await this.hasReadyLanguageModels();
        const modelRequirementBypassed = provider.modelRequirementBypassed ?? false;
        return hasReadyModels || modelRequirementBypassed;
    }

    protected async hasReadyLanguageModels(): Promise<boolean> {
        const models = await this.languageModelRegistry.getLanguageModels();
        return models.some(model => model.status.status === 'ready');
    }

    protected initListeners(): void {
        this.toDispose.pushAll([
            this.chatService.onSessionEvent(event => {
                if (event.type === 'deleted') {
                    this.deleteSessionState(event.sessionId);
                    return;
                }
                if (!isActiveSessionChangedEvent(event)) {
                    return;
                }
                const session = event.sessionId ? this.chatService.getSession(event.sessionId) : this.chatService.createSession();
                if (session) {
                    this.switchSession(session);
                } else {
                    this.logger.warn(`Session with ${event.sessionId} not found.`);
                }
            }),
            // The chat view needs to handle the submission of the edit request
            this.treeWidget.onDidSubmitEdit(request => {
                this.onQuery(request);
            })
        ]);
    }

    protected switchSession(session: ChatSession): void {
        if (this.chatSession && this.chatSession.id === session.id) {
            return;
        }
        if (this.chatSession) {
            const currentScrollState = this.treeWidget.getScrollState();
            this.saveSessionState(this.chatSession.id, {
                locked: this.state.locked,
                temporaryLocked: this.state.temporaryLocked,
                topVisibleRowIndex: currentScrollState.topVisibleRowIndex,
                scrollTop: currentScrollState.scrollTop,
                atBottom: currentScrollState.atBottom
            });
        }

        this.chatSession = session;

        const savedState = this.getSessionState(session.id);
        const locked = savedState?.locked ?? false;
        const temporaryLocked = savedState?.temporaryLocked ?? false;

        this.state = {
            ...this.state,
            locked,
            temporaryLocked
        };

        this.treeWidget.trackChatModel(this.chatSession.model, savedState);
        this.inputWidget.chatModel = this.chatSession.model;
        this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
    }

    saveSessionState(sessionId: string, state: ChatViewWidget.SessionScrollState): void {
        this.sessionStates.set(sessionId, state);
    }

    getSessionState(sessionId: string): ChatViewWidget.SessionScrollState | undefined {
        return this.sessionStates.get(sessionId);
    }

    deleteSessionState(sessionId: string): void {
        this.sessionStates.delete(sessionId);
        this.treeWidget.deleteSessionScrollState(sessionId);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.inputWidget.activate();
    }

    storeState(): object {
        if (this.chatSession) {
            const currentScrollState = this.treeWidget.getScrollState();
            this.saveSessionState(this.chatSession.id, {
                locked: this.state.locked,
                temporaryLocked: this.state.temporaryLocked,
                topVisibleRowIndex: currentScrollState.topVisibleRowIndex,
                scrollTop: currentScrollState.scrollTop,
                atBottom: currentScrollState.atBottom
            });
        }
        const sessionStatesObj: Record<string, ChatViewWidget.SessionScrollState> = {};
        this.sessionStates.forEach((val, key) => {
            sessionStatesObj[key] = val;
        });
        return {
            ...this.state,
            sessionStates: sessionStatesObj
        };
    }

    restoreState(oldState: object & Partial<ChatViewWidget.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        copy.temporaryLocked = false;
        if (oldState.sessionStates) {
            this.sessionStates.clear();
            for (const [key, val] of Object.entries(oldState.sessionStates)) {
                this.sessionStates.set(key, val);
            }
            if (this.chatSession) {
                const currentSavedState = this.sessionStates.get(this.chatSession.id);
                if (currentSavedState) {
                    copy.locked = currentSavedState.locked ?? false;
                    copy.temporaryLocked = currentSavedState.temporaryLocked ?? false;
                    this.treeWidget.restoreScrollState(currentSavedState);
                }
            }
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

    protected async onQuery(
        query?: string | ChatRequest,
        modeId?: string,
        capabilityOverrides?: Record<string, boolean>,
        genericCapabilitySelections?: GenericCapabilitySelections,
        serverToolSelections?: Record<string, string[]>
    ): Promise<void> {
        const chatRequest: ChatRequest = !query
            ? { text: '' }
            : typeof query === 'string'
                ? { text: query, modeId, capabilityOverrides, genericCapabilitySelections, serverToolSelections }
                // For an already-built request (e.g. an edited+resent message), keep its own selections
                // instead of overwriting them with the (undefined) explicit arguments.
                : {
                    ...query,
                    capabilityOverrides: capabilityOverrides ?? query.capabilityOverrides,
                    genericCapabilitySelections: genericCapabilitySelections ?? query.genericCapabilitySelections,
                    serverToolSelections: serverToolSelections ?? query.serverToolSelections
                };
        if (chatRequest.text.length === 0) { return; }

        // Include all variables (context + pending image attachments) in the request
        const allVariables = this.inputWidget.getAllVariablesForRequest();
        const requestWithVariables: ChatRequest = allVariables.length > 0
            ? { ...chatRequest, variables: allVariables }
            : chatRequest;

        let requestProgress;
        try {
            requestProgress = await this.chatService.sendRequest(this.chatSession.id, requestWithVariables);
        } finally {
            // Clear pending image attachments now that they're included in the request
            this.inputWidget.clearPendingImageAttachments();
        }
        requestProgress?.responseCompleted.then(responseModel => {
            if (responseModel.isError) {
                const rawError = responseModel.errorObject?.message;
                const message = rawError
                    ? nls.localize('theia/ai/chat-ui/chatRequestFailedWithDetail',
                        'Chat request failed: {0}',
                        formattedProviderErrorToShortString(formatProviderError(rawError)))
                    : nls.localize('theia/ai/chat-ui/errorChatInvocation',
                        'An error occurred during chat service invocation.');
                this.messageService.error(message);
            }
        }).finally(() => {
            this.inputWidget.pinnedAgent = this.chatSession.pinnedAgent;
        });
        if (!requestProgress) {
            this.messageService.error(nls.localize('theia/ai/chat-ui/couldNotSendRequestToSession',
                'Was not able to send request "{0}" to session {1}', chatRequest.text, this.chatSession.id));
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
        if (this.chatSession) {
            const currentScrollState = this.treeWidget.getScrollState();
            this.saveSessionState(this.chatSession.id, {
                locked: true,
                temporaryLocked: false,
                topVisibleRowIndex: currentScrollState.topVisibleRowIndex,
                scrollTop: currentScrollState.scrollTop,
                atBottom: currentScrollState.atBottom
            });
        }
    }

    unlock(): void {
        this.state = { ...deepClone(this.state), locked: false, temporaryLocked: false };
        if (this.chatSession) {
            const currentScrollState = this.treeWidget.getScrollState();
            this.saveSessionState(this.chatSession.id, {
                locked: false,
                temporaryLocked: false,
                topVisibleRowIndex: currentScrollState.topVisibleRowIndex,
                scrollTop: currentScrollState.scrollTop,
                atBottom: currentScrollState.atBottom
            });
        }
    }

    setTemporaryLock(locked: boolean): void {
        // Only set temporary lock if not permanently locked
        if (!this.state.locked) {
            this.state = { ...deepClone(this.state), temporaryLocked: locked };
            if (this.chatSession) {
                const currentScrollState = this.treeWidget.getScrollState();
                this.saveSessionState(this.chatSession.id, {
                    locked: false,
                    temporaryLocked: locked,
                    topVisibleRowIndex: currentScrollState.topVisibleRowIndex,
                    scrollTop: currentScrollState.scrollTop,
                    atBottom: !locked
                });
            }
        }
    }

    get isLocked(): boolean {
        return !!this.state.locked;
    }

    addContext(variable: AIVariableResolutionRequest): void {
        this.inputWidget.addContext(variable);
    }

    setSettings(settings: ChatSessionSettings): void {
        if (this.chatSession && this.chatSession.model) {
            const model = this.chatSession.model as MutableChatModel;
            model.setSettings(settings);
        }
    }

    getSettings(): ChatSessionSettings | undefined {
        return this.chatSession.model.settings;
    }

    get sessionId(): string {
        return this.chatSession.id;
    }
}

export namespace ChatViewWidget {
    /**
     * Returns the active `ChatViewWidget` if the shell's active widget is one,
     * or if focus is inside one of its child widgets (e.g. the input or tree).
     */
    export function findActive(shell: ApplicationShell): ChatViewWidget | undefined {
        const activeWidget = shell.activeWidget;
        if (activeWidget instanceof ChatViewWidget) {
            return activeWidget;
        }
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
            const widget = shell.findWidgetForElement(activeElement);
            if (widget instanceof ChatViewWidget) {
                return widget;
            }
            let parent = widget?.parent;
            while (parent) {
                if (parent instanceof ChatViewWidget) {
                    return parent;
                }
                parent = parent.parent;
            }
        }
        return undefined;
    }
}
