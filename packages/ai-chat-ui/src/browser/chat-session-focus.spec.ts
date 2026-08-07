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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { ApplicationShell } from '@theia/core/lib/browser';
import { ChatService, ChatSession } from '@theia/ai-chat';
import { isChatSessionFocused } from './chat-session-focus';

disableJSDOM();

const CHAT_VIEW_WIDGET_ID = 'chat-view-widget';

interface FakeWidget {
    id: string;
    isVisible: boolean;
}

function createShell(currentWidget?: FakeWidget): ApplicationShell {
    return { currentWidget } as unknown as ApplicationShell;
}

function createChatService(activeSessionId?: string): ChatService {
    return {
        getActiveSession(): ChatSession | undefined {
            return activeSessionId ? ({ id: activeSessionId } as ChatSession) : undefined;
        }
    } as unknown as ChatService;
}

describe('isChatSessionFocused', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let originalHasFocus: typeof document.hasFocus;

    beforeEach(() => {
        originalHasFocus = document.hasFocus.bind(document);
    });

    afterEach(() => {
        // Restore the original implementation so other tests are unaffected.
        Object.defineProperty(document, 'hasFocus', { value: originalHasFocus, configurable: true });
    });

    function mockDocumentFocus(focused: boolean): void {
        Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
    }

    it('returns false when the window does not have focus', () => {
        mockDocumentFocus(false);
        const shell = createShell({ id: CHAT_VIEW_WIDGET_ID, isVisible: true });
        const chatService = createChatService('session-1');

        // Even with the chat view visible and the matching session active, switching to a
        // different application should still let notifications through.
        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(false);
    });

    it('returns false when the active session does not match', () => {
        mockDocumentFocus(true);
        const shell = createShell({ id: CHAT_VIEW_WIDGET_ID, isVisible: true });
        const chatService = createChatService('session-other');

        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(false);
    });

    it('returns false when no widget is current', () => {
        mockDocumentFocus(true);
        const shell = createShell(undefined);
        const chatService = createChatService('session-1');

        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(false);
    });

    it('returns false when the current widget is not the chat view', () => {
        mockDocumentFocus(true);
        const shell = createShell({ id: 'some-other-widget', isVisible: true });
        const chatService = createChatService('session-1');

        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(false);
    });

    it('returns false when the chat view is the current widget but not visible', () => {
        mockDocumentFocus(true);
        const shell = createShell({ id: CHAT_VIEW_WIDGET_ID, isVisible: false });
        const chatService = createChatService('session-1');

        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(false);
    });

    it('returns true when window is focused, chat view is current and visible, and session matches', () => {
        mockDocumentFocus(true);
        const shell = createShell({ id: CHAT_VIEW_WIDGET_ID, isVisible: true });
        const chatService = createChatService('session-1');

        // This is the suppression case: the user is already looking at the waiting session, so
        // any agent notification for it should be suppressed.
        expect(isChatSessionFocused(shell, chatService, 'session-1')).to.equal(true);
    });
});
