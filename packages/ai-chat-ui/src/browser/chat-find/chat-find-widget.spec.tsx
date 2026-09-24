// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { ChatChangeEvent, ChatModel, ChatRequestModel, ChatResponseContent, TextChatResponseContentImpl } from '@theia/ai-chat/lib/common';
import { Emitter } from '@theia/core';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { expect } from 'chai';
import { ChatFindMatch, ChatFindMatcher } from './chat-find-matcher';
import { ChatFindState, ChatFindWidget } from './chat-find-widget';
disableJSDOM();

interface FakeRequest {
    request: ChatRequestModel;
    responseChanged: Emitter<void>;
    content: ChatResponseContent[];
}

function fakeRequest(id: string, text: string, ...responseTexts: string[]): FakeRequest {
    const responseChanged = new Emitter<void>();
    const content: ChatResponseContent[] = responseTexts.map(t => new TextChatResponseContentImpl(t));
    const request = {
        id,
        message: { parts: [{ kind: 'text', text }] },
        response: { id: `${id}-response`, isComplete: false, onDidChange: responseChanged.event, response: { content } }
    } as unknown as ChatRequestModel;
    return { request, responseChanged, content };
}

function fakeModel(requests: FakeRequest[]): { model: ChatModel; changed: Emitter<ChatChangeEvent> } {
    const changed = new Emitter<ChatChangeEvent>();
    const model = {
        onDidChange: changed.event,
        getRequests: () => requests.map(r => r.request),
        isEmpty: () => requests.length === 0
    } as unknown as ChatModel;
    return { model, changed };
}

class TestChatFindWidget extends ChatFindWidget {
    visible = false;
    constructor() {
        super();
        this.matcher = new ChatFindMatcher();
        this.contextKeyService = {
            createKey: () => ({
                set: (value: boolean) => { this.visible = value; },
                get: () => this.visible,
                reset: () => { this.visible = false; }
            })
        } as unknown as ContextKeyService;
        this.init();
    }
}

describe('ChatFindWidget', () => {
    let widget: TestChatFindWidget;
    let states: ChatFindState[];
    let reveals: ChatFindMatch[];

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        widget = new TestChatFindWidget();
        widget.fallbackFocusTarget = document.body;
        states = [];
        reveals = [];
        widget.onDidChangeState(state => states.push(state));
        widget.onDidRequestReveal(match => reveals.push(match));
    });

    afterEach(() => widget.dispose());

    it('computes matches for the query and reveals the first one', () => {
        const { model } = fakeModel([fakeRequest('r1', 'alpha', 'alpha beta alpha')]);
        widget.setChatModel(model);
        widget.open();
        widget.setQuery('alpha');
        expect(widget.state.matches).to.have.length(3);
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r1', occurrence: 0 });
        expect(reveals).to.have.length(1);
    });

    it('cycles with next and previous, wrapping around', () => {
        const { model } = fakeModel([fakeRequest('r1', 'x', 'x', 'x')]);
        widget.setChatModel(model);
        widget.open();
        widget.setQuery('x');
        widget.next();
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r1-response', contentIndex: 0 });
        widget.next();
        widget.next();
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r1' });
        widget.previous();
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r1-response', contentIndex: 1 });
        expect(reveals).to.have.length(5);
    });

    it('keeps the current match while a response streams', async () => {
        const first = fakeRequest('r1', 'needle', 'needle');
        const second = fakeRequest('r2', '', 'nee');
        const { model } = fakeModel([first, second]);
        widget.setChatModel(model);
        widget.open();
        widget.setQuery('needle');
        widget.next(); // current: r1-response
        second.content[0] = new TextChatResponseContentImpl('needle needle');
        second.responseChanged.fire();
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(widget.state.matches).to.have.length(4);
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r1-response', occurrence: 0 });
        expect(reveals).to.have.length(2); // a recompute never reveals
    });

    it('moves to the nearest following match when the current one disappears', async () => {
        const first = fakeRequest('r1', 'a', 'a');
        const second = fakeRequest('r2', 'a', 'a');
        const requests = [first, second];
        const { model, changed } = fakeModel(requests);
        widget.setChatModel(model);
        widget.open();
        widget.setQuery('a');
        widget.next(); // r1-response
        requests.splice(0, 1);
        changed.fire({ kind: 'removeRequest', requestId: 'r1' } as unknown as ChatChangeEvent);
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(widget.state.matches).to.have.length(2);
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r2' });
    });

    it('does not search while closed, and catches up on open', async () => {
        const streaming = fakeRequest('r1', '', 'nee');
        const { model } = fakeModel([streaming]);
        let searches = 0;
        const findMatches = widget['matcher'].findMatches.bind(widget['matcher']);
        widget['matcher'].findMatches = (...args) => { searches++; return findMatches(...args); };
        widget.setChatModel(model);
        widget.open();
        widget.setQuery('needle');
        widget.dismiss();
        searches = 0;
        streaming.content[0] = new TextChatResponseContentImpl('needle');
        streaming.responseChanged.fire();
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(searches).to.equal(0);
        widget.open();
        expect(widget.state.matches).to.have.length(1);
    });

    it('reports no matches for an invalid regular expression', () => {
        const { model } = fakeModel([fakeRequest('r1', '(', '(')]);
        widget.setChatModel(model);
        widget.toggleOption('useRegex');
        widget.setQuery('(');
        expect(widget.state.regexp).to.be.undefined;
        expect(widget.state.matches).to.deep.equal([]);
        expect(widget.currentMatch).to.be.undefined;
    });

    it('sets the context key and clears highlights on open and close', () => {
        const { model } = fakeModel([fakeRequest('r1', 'q', 'q')]);
        widget.setChatModel(model);
        widget.setQuery('q');
        widget.open();
        expect(widget.isOpen).to.be.true;
        expect(widget.visible).to.be.true;
        widget.dismiss();
        expect(widget.isOpen).to.be.false;
        expect(widget.visible).to.be.false;
        const last = states[states.length - 1];
        expect(last.regexp).to.be.undefined;
        expect(last.matches).to.deep.equal([]);
        widget.open();
        expect(widget.state.matches).to.have.length(2);
        expect(states[states.length - 1].matches).to.have.length(2);
    });

    it('does not open on a session without requests, where the tree shows the session list', () => {
        const { model } = fakeModel([]);
        widget.setChatModel(model);
        widget.open();
        expect(widget.isOpen).to.be.false;
        expect(widget.canFind).to.be.false;
    });

    it('closes when the tracked session is replaced by one without requests', () => {
        const { model: withRequests } = fakeModel([fakeRequest('r1', 'q', 'q')]);
        const { model: empty } = fakeModel([]);
        widget.setChatModel(withRequests);
        widget.setQuery('q');
        widget.open();
        expect(widget.isOpen).to.be.true;
        widget.setChatModel(empty);
        expect(widget.isOpen).to.be.false;
    });

    it('closes on a session switch, keeping query and options for the next open', () => {
        const { model: a } = fakeModel([fakeRequest('r1', 'k k', 'k')]);
        const { model: b } = fakeModel([fakeRequest('r9', 'K', 'k')]);
        widget.setChatModel(a);
        widget.open();
        widget.setQuery('k');
        widget.next();
        widget.next();
        widget.setChatModel(b);
        expect(widget.isOpen).to.be.false;
        expect(widget.visible).to.be.false;
        expect(states[states.length - 1].matches).to.deep.equal([]);
        widget.open();
        expect(widget.state.matches).to.have.length(2);
        expect(widget.currentMatch).to.deep.include({ nodeId: 'r9', occurrence: 0 });
    });

    it('does not move focus when it closes on a session switch', () => {
        const before = document.createElement('button');
        const picked = document.createElement('button');
        document.body.append(before, picked);
        const { model: a } = fakeModel([fakeRequest('r1', 'k', 'k')]);
        widget.setChatModel(a);
        before.focus();
        widget.open();
        picked.focus(); // e.g. the entry the user clicked in the session history
        widget.setChatModel(fakeModel([fakeRequest('r2', 'k', 'k')]).model);
        expect(document.activeElement).to.equal(picked);
        before.remove();
        picked.remove();
    });

    it('stays open when the same session is tracked again', () => {
        const { model } = fakeModel([fakeRequest('r1', 'k', 'k')]);
        widget.setChatModel(model);
        widget.open();
        widget.setChatModel(model);
        expect(widget.isOpen).to.be.true;
    });

    it('resets the context key when disposed while open', () => {
        widget.setChatModel(fakeModel([fakeRequest('r1', 'k', 'k')]).model);
        widget.open();
        widget.dispose();
        expect(widget.visible).to.be.false;
    });
});
