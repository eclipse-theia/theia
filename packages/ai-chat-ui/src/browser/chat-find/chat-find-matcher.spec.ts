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

import {
    ChatModel, ChatRequestModel, ChatResponseContent, CodeChatResponseContentImpl, ErrorChatResponseContentImpl,
    InformationalChatResponseContentImpl, MarkdownChatResponseContentImpl, TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl, ToolCallChatResponseContentImpl
} from '@theia/ai-chat/lib/common';
import { expect } from 'chai';
import { ChatFindMatcher, ChatFindOptions } from './chat-find-matcher';

const plain: ChatFindOptions = { matchCase: false, wholeWord: false, useRegex: false };

function request(id: string, text: string, content: ChatResponseContent[]): ChatRequestModel {
    return {
        id,
        message: { parts: [{ kind: 'text', text }] },
        response: { id: `${id}-response`, response: { content } }
    } as unknown as ChatRequestModel;
}

function model(...requests: ChatRequestModel[]): ChatModel {
    return { getRequests: () => requests } as unknown as ChatModel;
}

describe('ChatFindMatcher', () => {
    const matcher = new ChatFindMatcher();

    describe('createRegExp', () => {
        it('returns undefined for an empty query', () => {
            expect(matcher.createRegExp('', plain)).to.be.undefined;
        });

        it('escapes regex characters unless useRegex is set', () => {
            expect(matcher.createRegExp('a.b', plain)!.test('axb')).to.be.false;
            expect(matcher.createRegExp('a.b', { ...plain, useRegex: true })!.test('axb')).to.be.true;
        });

        it('is case-insensitive unless matchCase is set', () => {
            expect(matcher.createRegExp('abc', plain)!.test('ABC')).to.be.true;
            expect(matcher.createRegExp('abc', { ...plain, matchCase: true })!.test('ABC')).to.be.false;
        });

        it('wraps the pattern in word boundaries for wholeWord', () => {
            const regexp = matcher.createRegExp('cat', { ...plain, wholeWord: true })!;
            expect(regexp.test('a cat sat')).to.be.true;
            regexp.lastIndex = 0;
            expect(regexp.test('concatenate')).to.be.false;
        });

        it('returns undefined for an invalid regular expression', () => {
            expect(matcher.createRegExp('(', { ...plain, useRegex: true })).to.be.undefined;
        });
    });

    describe('findInText', () => {
        it('returns all occurrences in order', () => {
            const ranges = matcher.findInText('foo bar foo', matcher.createRegExp('foo', plain)!);
            expect(ranges).to.deep.equal([{ start: 0, end: 3 }, { start: 8, end: 11 }]);
        });

        it('skips zero-length matches without looping forever', () => {
            const ranges = matcher.findInText('aab', matcher.createRegExp('a*', { ...plain, useRegex: true })!);
            expect(ranges).to.deep.equal([{ start: 0, end: 2 }]);
        });
    });

    describe('findMatches', () => {
        it('searches request text and response parts in tree order', () => {
            const chat = model(
                request('r1', 'find me', [new TextChatResponseContentImpl('nothing'), new MarkdownChatResponseContentImpl('find **me** and find me')]),
                request('r2', 'other', [new CodeChatResponseContentImpl('const findMe = 1;', 'ts')])
            );
            const matches = matcher.findMatches(chat, matcher.createRegExp('find', plain)!);
            expect(matches).to.deep.equal([
                { nodeId: 'r1', contentIndex: undefined, occurrence: 0, start: 0, end: 4 },
                { nodeId: 'r1-response', contentIndex: 1, occurrence: 0, start: 0, end: 4 },
                { nodeId: 'r1-response', contentIndex: 1, occurrence: 1, start: 16, end: 20 },
                { nodeId: 'r2-response', contentIndex: 0, occurrence: 0, start: 6, end: 10 }
            ]);
        });

        it('searches informational parts and the visible error headline only', () => {
            const error = new ErrorChatResponseContentImpl(new Error('401 {"error":{"message":"needle in headline","type":"needle_type"}}'));
            const chat = model(request('r1', '', [new InformationalChatResponseContentImpl('needle info'), error]));
            const matches = matcher.findMatches(chat, matcher.createRegExp('needle', plain)!);
            expect(matches.map(m => [m.contentIndex, m.occurrence])).to.deep.equal([[0, 0], [1, 0]]);
        });

        it('ignores a mermaid block, which is rendered as a diagram rather than as its source', () => {
            const chart = new CodeChatResponseContentImpl('flowchart TD\n  A[needle] --> B[other]', 'mermaid');
            const chat = model(request('r1', '', [chart, new TextChatResponseContentImpl('needle in text')]));
            const matches = matcher.findMatches(chat, matcher.createRegExp('needle', plain)!);
            expect(matches.map(m => m.contentIndex)).to.deep.equal([1]);
        });

        it('still searches a plain code block', () => {
            const chat = model(request('r1', '', [new CodeChatResponseContentImpl('const needle = 1;', 'ts')]));
            expect(matcher.findMatches(chat, matcher.createRegExp('needle', plain)!)).to.have.length(1);
        });

        it('ignores tool calls and reasoning', () => {
            const chat = model(request('r1', '', [
                new ToolCallChatResponseContentImpl('id', 'needle_tool', '{"q":"needle"}', true),
                new ThinkingChatResponseContentImpl('thinking about needle', 'sig')
            ]));
            expect(matcher.findMatches(chat, matcher.createRegExp('needle', plain)!)).to.deep.equal([]);
        });

        it('joins request parts, e.g. agent mentions, into one text', () => {
            const req = {
                id: 'r1',
                message: { parts: [{ kind: 'agent', text: '@Coder' }, { kind: 'text', text: ' please fix' }] },
                response: { id: 'r1-response', response: { content: [] } }
            } as unknown as ChatRequestModel;
            const matches = matcher.findMatches(model(req), matcher.createRegExp('coder please', plain)!);
            expect(matches).to.deep.equal([{ nodeId: 'r1', contentIndex: undefined, occurrence: 0, start: 1, end: 13 }]);
        });
    });
});
