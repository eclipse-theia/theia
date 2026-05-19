// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import {
    ActiveSessionChangedEvent,
    ChatAgentLocation,
    ChatRequest,
    ChatRequestInvocation,
    ChatService,
    ChatSession,
    MutableChatModel,
    SessionCreatedEvent,
    SessionDeletedEvent,
    SessionRenamedEvent
} from '@theia/ai-chat';
import { Emitter, Event } from '@theia/core';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { ChatSessionInputDrafts } from './chat-session-input-drafts';

let disableJSDOM: () => void = () => { };

function enableChatWidgetJSDOM(): void {
    disableJSDOM = enableJSDOM();
    const testNavigator = globalThis.navigator ?? {};
    Object.defineProperty(testNavigator, 'userAgent', {
        value: globalThis.navigator?.userAgent ?? 'node',
        configurable: true
    });
    Object.defineProperty(testNavigator, 'platform', {
        value: globalThis.navigator?.platform ?? process.platform,
        configurable: true
    });
    Object.defineProperty(globalThis, 'navigator', {
        value: testNavigator,
        configurable: true
    });
    if (globalThis.window) {
        Object.defineProperty(globalThis.window, 'navigator', {
            value: testNavigator,
            configurable: true
        });
    }
    Object.defineProperty(globalThis, 'Element', {
        value: globalThis.window?.Element ?? class Element { },
        configurable: true
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
        value: globalThis.window?.HTMLElement ?? class HTMLElement { },
        configurable: true
    });
}

type ChatViewWidgetConstructor = typeof import('./chat-view-widget').ChatViewWidget;
type TestableChatViewWidget = InstanceType<ChatViewWidgetConstructor> & {
    setCurrentSession(session: ChatSession): void;
    openTab(session: ChatSession): void;
    renderTabs(): void;
    listen(): void;
    showChatSession(session: ChatSession): void;
    query(text: string): Promise<void>;
    getDraft(sessionId: string): string;
    getTabLabels(): string[];
    getTabButtons(): HTMLButtonElement[];
    getCloseButtons(): HTMLElement[];
};
let ChatViewWidget: ChatViewWidgetConstructor;

type ChatSessionEvent = ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent;

class TestChatService implements Partial<ChatService> {
    protected readonly onSessionEventEmitter = new Emitter<ChatSessionEvent>();
    readonly onSessionEvent = this.onSessionEventEmitter.event;
    readonly sentRequests: Array<{ sessionId: string; request: ChatRequest }> = [];
    activeSessionId: string | undefined;
    activeSessionOptions: { focus?: boolean; skipNavigation?: boolean } | undefined;

    constructor(protected readonly sessions: ChatSession[]) { }

    getSessions(): ChatSession[] {
        return [...this.sessions];
    }

    getSession(id: string): ChatSession | undefined {
        return this.sessions.find(session => session.id === id);
    }

    setActiveSession(sessionId: string, options?: { focus?: boolean; skipNavigation?: boolean }): void {
        this.activeSessionId = sessionId;
        this.activeSessionOptions = options;
        this.onSessionEventEmitter.fire({ type: 'activeChange', sessionId, ...options });
    }

    createSession(): ChatSession {
        const session = createSession('created-session');
        this.sessions.push(session);
        return session;
    }

    async sendRequest(sessionId: string, request: ChatRequest): Promise<ChatRequestInvocation> {
        this.sentRequests.push({ sessionId, request });
        return {
            requestCompleted: Promise.resolve(undefined as never),
            responseCreated: Promise.resolve(undefined as never),
            responseCompleted: Promise.resolve({ isError: false } as never)
        };
    }
}

class TestTreeWidget {
    readonly node = document.createElement('div');
    readonly onDidSubmitEdit: Event<ChatRequest> = Event.None;
    trackedModel: MutableChatModel | undefined;

    trackChatModel(model: MutableChatModel): void {
        this.trackedModel = model;
    }
}

class TestInputWidget {
    readonly node = document.createElement('div');
    value = '';
    trackedModel: MutableChatModel | undefined;
    pinnedAgent: ChatSession['pinnedAgent'];
    clearPendingImageAttachmentsCalls = 0;

    set chatModel(model: MutableChatModel) {
        this.trackedModel = model;
    }

    getInputValue(): string {
        return this.value;
    }

    setInputValue(value: string): void {
        this.value = value;
    }

    getAllVariablesForRequest(): [] {
        return [];
    }

    clearPendingImageAttachments(): void {
        this.clearPendingImageAttachmentsCalls++;
    }
}

function createSession(id: string, isUserVisible = true): ChatSession {
    const model = new MutableChatModel(ChatAgentLocation.Panel);
    return {
        id,
        model,
        isActive: false,
        isUserVisible
    };
}

function createWidget(chatService: TestChatService, treeWidget = new TestTreeWidget(), inputWidget = new TestInputWidget()): TestableChatViewWidget {
    class TestChatViewWidget extends ChatViewWidget {
        constructor() {
            super(treeWidget as never, inputWidget as never);
            this.chatService = chatService as unknown as ChatService;
            this.messageService = { error: () => undefined } as never;
            Object.defineProperty(this, 'navigationService', {
                value: { notifyQueryFromWelcomeScreen: () => undefined }
            });
        }

        setCurrentSession(session: ChatSession): void {
            this.chatSession = session;
            this.openTabSessionIds.add(session.id);
        }

        openTab(session: ChatSession): void {
            this.openTabSessionIds.add(session.id);
        }

        renderTabs(): void {
            this.renderSessionTabs();
        }

        listen(): void {
            this.initListeners();
        }

        showChatSession(session: ChatSession): void {
            this.showSession(session);
        }

        async query(text: string): Promise<void> {
            await this.onQuery(text);
        }

        getDraft(sessionId: string): string {
            return this.sessionInputDrafts.get(sessionId);
        }

        getTabLabels(): string[] {
            return Array.from(this.tabBarNode.querySelectorAll('.theia-AIChatTabLabel'))
                .map(tab => tab.textContent ?? '');
        }

        getTabButtons(): HTMLButtonElement[] {
            return Array.from(this.tabBarNode.querySelectorAll<HTMLButtonElement>('.theia-AIChatTab'));
        }

        getCloseButtons(): HTMLElement[] {
            return Array.from(this.tabBarNode.querySelectorAll<HTMLElement>('.theia-AIChatTabClose'));
        }
    }
    return new TestChatViewWidget();
}

describe('ChatSessionInputDrafts', () => {

    it('keeps draft input local to each chat session', () => {
        const drafts = new ChatSessionInputDrafts();

        drafts.set('session-1', 'first draft');
        drafts.set('session-2', 'second draft');

        expect(drafts.get('session-1')).to.equal('first draft');
        expect(drafts.get('session-2')).to.equal('second draft');
    });

    it('returns an empty draft for sessions without local input', () => {
        const drafts = new ChatSessionInputDrafts();

        expect(drafts.get('unknown-session')).to.equal('');
    });

    it('removes a session draft when the session is deleted', () => {
        const drafts = new ChatSessionInputDrafts();

        drafts.set('session-1', 'draft');
        drafts.delete('session-1');

        expect(drafts.get('session-1')).to.equal('');
    });
});

describe('ChatViewWidget tabs', () => {

    before(async () => {
        try {
            enableChatWidgetJSDOM();
            ({ ChatViewWidget } = await import('./chat-view-widget'));
        } catch (error) {
            console.error('Failed to import ChatViewWidget in tests:', error);
            throw error;
        }
    });

    it('renders tabs for multiple user-visible panel sessions', () => {
        const first = createSession('session-1');
        const second = createSession('session-2');
        first.title = 'First';
        second.title = 'Second';
        const widget = createWidget(new TestChatService([first, second]));
        widget.setCurrentSession(first);
        widget.openTab(second);

        widget.renderTabs();

        expect(widget.getTabLabels()).to.deep.equal(['First', 'Second']);
    });

    it('selecting a tab switches the tracked chat model', () => {
        const first = createSession('session-1');
        const second = createSession('session-2');
        const chatService = new TestChatService([first, second]);
        const treeWidget = new TestTreeWidget();
        const widget = createWidget(chatService, treeWidget);
        widget.setCurrentSession(first);
        widget.openTab(second);
        widget.listen();
        widget.renderTabs();

        widget.getTabButtons()[1].click();

        expect(chatService.activeSessionId).to.equal(second.id);
        expect(chatService.activeSessionOptions?.skipNavigation).to.equal(true);
        expect(treeWidget.trackedModel).to.equal(second.model);
    });

    it('stores and restores draft input per session', () => {
        const first = createSession('session-1');
        const second = createSession('session-2');
        const inputWidget = new TestInputWidget();
        const widget = createWidget(new TestChatService([first, second]), new TestTreeWidget(), inputWidget);
        widget.setCurrentSession(first);

        inputWidget.value = 'first draft';
        widget.showChatSession(second);
        inputWidget.value = 'second draft';
        widget.showChatSession(first);

        expect(inputWidget.value).to.equal('first draft');
        widget.showChatSession(second);
        expect(inputWidget.value).to.equal('second draft');
    });

    it('submitting clears only the active session draft', async () => {
        const first = createSession('session-1');
        const second = createSession('session-2');
        const inputWidget = new TestInputWidget();
        const chatService = new TestChatService([first, second]);
        const widget = createWidget(chatService, new TestTreeWidget(), inputWidget);
        widget.setCurrentSession(first);

        inputWidget.value = 'first draft';
        widget.showChatSession(second);
        inputWidget.value = 'second draft';

        await widget.query('submitted prompt');

        expect(widget.getDraft(second.id)).to.equal('');
        widget.showChatSession(first);
        expect(inputWidget.value).to.equal('first draft');
        expect(chatService.sentRequests).to.have.lengthOf(1);
        expect(chatService.sentRequests[0].sessionId).to.equal(second.id);
    });

    it('does not render tabs for internal delegated sessions', () => {
        const visible = createSession('session-1');
        const delegated = createSession('delegated-session', false);
        visible.title = 'Visible';
        delegated.title = 'Delegated';
        const widget = createWidget(new TestChatService([visible, delegated]));
        widget.setCurrentSession(visible);
        widget.openTab(delegated);

        widget.renderTabs();

        expect(widget.getTabLabels()).to.deep.equal(['Visible']);
    });

    it('does not render tabs for sessions that were loaded but not opened as tabs', () => {
        const current = createSession('current-session');
        const previous = createSession('previous-session');
        current.title = 'Current';
        previous.title = 'Previous';
        const widget = createWidget(new TestChatService([current, previous]));
        widget.setCurrentSession(current);

        widget.renderTabs();

        expect(widget.getTabLabels()).to.deep.equal(['Current']);
    });

    it('closes a tab without deleting the chat session', () => {
        const first = createSession('session-1');
        const second = createSession('session-2');
        first.title = 'First';
        second.title = 'Second';
        const chatService = new TestChatService([first, second]);
        const widget = createWidget(chatService);
        widget.setCurrentSession(first);
        widget.openTab(second);
        widget.renderTabs();

        widget.getCloseButtons()[1].click();

        expect(widget.getTabLabels()).to.deep.equal(['First']);
        expect(chatService.getSession(second.id)).to.equal(second);
    });
});

after(() => {
    disableJSDOM();
});
