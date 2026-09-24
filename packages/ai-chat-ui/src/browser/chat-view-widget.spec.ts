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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { Emitter, ILogger } from '@theia/core';
import { ActiveSessionChangedEvent, ChatService, ChatSession, MutableChatModel, SessionCreatedEvent, SessionDeletedEvent, SessionRenamedEvent } from '@theia/ai-chat';
import { ChatViewWidget } from './chat-view-widget';
import { ChatViewTreeWidget } from './chat-tree-view/chat-view-tree-widget';
import { AIChatInputWidget } from './chat-input-widget';
import { ChatBannerWidget } from './chat-banner-widget';

disableJSDOM();

class MockChatViewTreeWidget {
    public scrollState: ChatViewTreeWidget.SessionScrollState = { topVisibleRowIndex: 0, atBottom: true };
    public trackedModel: unknown;
    public trackedSavedState: unknown;
    public shouldScrollToEnd = true;
    public deletedSessionId?: string;

    getScrollState(): ChatViewTreeWidget.SessionScrollState {
        return this.scrollState;
    }

    trackChatModel(model: unknown, savedState?: unknown): void {
        this.trackedModel = model;
        this.trackedSavedState = savedState;
    }

    deleteSessionScrollState(sessionId: string): void {
        this.deletedSessionId = sessionId;
    }

    restoreScrollState(state: ChatViewTreeWidget.SessionScrollState): void {
        this.scrollState = state;
    }
}

class TestChatViewWidget extends ChatViewWidget {
    override readonly treeWidget: ChatViewTreeWidget;
    override readonly logger: ILogger = {
        warn: () => {},
        info: () => {},
        error: () => {},
        debug: () => {},
        log: () => {}
    } as unknown as ILogger;

    constructor(
        mockTree: MockChatViewTreeWidget,
        mockInput: unknown,
        mockBanner: unknown,
        chatService: ChatService
    ) {
        super(mockTree as unknown as ChatViewTreeWidget, mockInput as unknown as AIChatInputWidget, mockBanner as unknown as ChatBannerWidget);
        this.chatService = chatService;
    }

    public triggerSwitchSession(session: ChatSession): void {
        this.switchSession(session);
    }

    public setMockSession(session: ChatSession): void {
        this.chatSession = session;
    }

    public getActiveSession(): ChatSession {
        return this.chatSession;
    }

    public override update(): void {
        // no-op in tests
    }
}

type TestSessionEvent = ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent | SessionRenamedEvent;

describe('ChatViewWidget session scroll state', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let treeWidget: MockChatViewTreeWidget;
    let widget: TestChatViewWidget;
    let sessionEventEmitter: Emitter<TestSessionEvent>;
    let sessions: Map<string, ChatSession>;

    const createSession = (id: string): ChatSession => {
        const model = new MutableChatModel();
        Object.defineProperty(model, 'id', { value: id, configurable: true });
        const session: ChatSession = {
            id,
            model,
            title: `Session ${id}`,
            lastInteraction: new Date(),
            isActive: false
        };
        sessions.set(id, session);
        return session;
    };

    beforeEach(() => {
        sessions = new Map();
        sessionEventEmitter = new Emitter<TestSessionEvent>();
        const chatService = {
            onSessionEvent: sessionEventEmitter.event,
            getSession: (id: string) => sessions.get(id),
            createSession: () => createSession('default-session')
        } as unknown as ChatService;

        treeWidget = new MockChatViewTreeWidget();
        widget = new TestChatViewWidget(
            treeWidget,
            { setEnabled: () => {}, chatModel: undefined, pinnedAgent: undefined },
            {},
            chatService
        );
    });

    it('saves scroll position and lock state when switching sessions and restores them on return', () => {
        const sessionA = createSession('session-a');
        const sessionB = createSession('session-b');

        widget.setMockSession(sessionA);

        // User scrolls session A to row 8 / scrollTop 250 and auto-scroll temporarily locks
        treeWidget.scrollState = { topVisibleRowIndex: 8, scrollTop: 250, atBottom: false };
        widget.setTemporaryLock(true);

        expect(widget.isLocked).to.be.false;
        expect(widget.getSessionState('session-a')).to.deep.equal({
            locked: false,
            temporaryLocked: true,
            topVisibleRowIndex: 8,
            scrollTop: 250,
            atBottom: false
        });

        // Switch to session B
        widget.triggerSwitchSession(sessionB);
        expect(widget.getActiveSession().id).to.equal('session-b');
        // Session B should have default unlocked state
        expect(widget.isLocked).to.be.false;
        expect(treeWidget.trackedSavedState).to.be.undefined;

        // In session B, user permanently locks scrolling at row 2 / scrollTop 50
        treeWidget.scrollState = { topVisibleRowIndex: 2, scrollTop: 50, atBottom: true };
        widget.lock();
        expect(widget.isLocked).to.be.true;

        // Switch back to session A
        widget.triggerSwitchSession(sessionA);
        expect(widget.getActiveSession().id).to.equal('session-a');
        // Session A's temporary lock and scroll position (row 8, scrollTop 250) must be restored
        expect(widget.isLocked).to.be.false;
        expect(treeWidget.trackedSavedState).to.deep.equal({
            locked: false,
            temporaryLocked: true,
            topVisibleRowIndex: 8,
            scrollTop: 250,
            atBottom: false
        });

        // Switch back to session B
        widget.triggerSwitchSession(sessionB);
        expect(widget.getActiveSession().id).to.equal('session-b');
        // Session B's permanent lock must be restored
        expect(widget.isLocked).to.be.true;
    });

    it('cleans up session state when a session is deleted', () => {
        const sessionA = createSession('session-a');
        widget.setMockSession(sessionA);
        treeWidget.scrollState = { topVisibleRowIndex: 12, scrollTop: 400, atBottom: false };
        widget.setTemporaryLock(true);

        expect(widget.getSessionState('session-a')).to.exist;

        widget.deleteSessionState('session-a');
        expect(widget.getSessionState('session-a')).to.be.undefined;
        expect(treeWidget.deletedSessionId).to.equal('session-a');
    });

    it('persists and restores per-session scroll states via storeState and restoreState', () => {
        const sessionA = createSession('session-a');
        const sessionB = createSession('session-b');

        widget.setMockSession(sessionA);
        treeWidget.scrollState = { topVisibleRowIndex: 15, scrollTop: 500, atBottom: false };
        widget.setTemporaryLock(true);

        widget.saveSessionState(sessionB.id, {
            locked: true,
            temporaryLocked: false,
            topVisibleRowIndex: 4,
            scrollTop: 100,
            atBottom: true
        });

        const storedState = widget.storeState() as ChatViewWidget.State;
        expect(storedState.sessionStates).to.exist;
        expect(storedState.sessionStates!['session-a']).to.deep.equal({
            locked: false,
            temporaryLocked: true,
            topVisibleRowIndex: 15,
            scrollTop: 500,
            atBottom: false
        });
        expect(storedState.sessionStates!['session-b']).to.deep.equal({
            locked: true,
            temporaryLocked: false,
            topVisibleRowIndex: 4,
            scrollTop: 100,
            atBottom: true
        });

        // Create a new widget and restore state
        const restoredWidget = new TestChatViewWidget(
            new MockChatViewTreeWidget(),
            { setEnabled: () => {}, chatModel: undefined, pinnedAgent: undefined },
            {},
            {
                onSessionEvent: new Emitter().event,
                getSession: (id: string) => sessions.get(id),
                createSession: () => sessionA
            } as unknown as ChatService
        );
        restoredWidget.setMockSession(sessionA);
        restoredWidget.restoreState(storedState);

        expect(restoredWidget.getSessionState('session-a')).to.deep.equal({
            locked: false,
            temporaryLocked: true,
            topVisibleRowIndex: 15,
            scrollTop: 500,
            atBottom: false
        });
        expect(restoredWidget.getSessionState('session-b')).to.deep.equal({
            locked: true,
            temporaryLocked: false,
            topVisibleRowIndex: 4,
            scrollTop: 100,
            atBottom: true
        });
    });
});
