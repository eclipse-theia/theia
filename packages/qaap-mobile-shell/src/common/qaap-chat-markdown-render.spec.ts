// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { parseHTML } from 'linkedom';
import {
    chatMarkdownNeedsFenceParse,
    chatMarkdownNeedsInlineFormatting,
    getSharedChatMarkdownIt,
    QAAP_CHAT_MARKDOWN_PLAIN_MAX_CHARS,
    resetSharedChatMarkdownItForTests,
    resolveChatMarkdownRenderMode,
} from './qaap-chat-markdown-render';

describe('qaap-chat-markdown-render', () => {

    before(() => {
        const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
        (globalThis as typeof globalThis & { document: Document }).document = document as unknown as Document;
    });

    afterEach(() => {
        resetSharedChatMarkdownItForTests();
    });

    it('getSharedChatMarkdownIt returns one shared instance', () => {
        const first = getSharedChatMarkdownIt();
        const second = getSharedChatMarkdownIt();
        expect(first).to.equal(second);
    });

    it('resolveChatMarkdownRenderMode uses plain text for short unformatted streams', () => {
        expect(resolveChatMarkdownRenderMode('hello there', '', undefined)).to.equal('plain');
        expect(resolveChatMarkdownRenderMode('hello world', 'hello ', 'plain')).to.equal('plain');
    });

    it('resolveChatMarkdownRenderMode switches to full render for fences or inline markdown', () => {
        expect(chatMarkdownNeedsFenceParse('```ts\nconst x = 1')).to.equal(true);
        expect(chatMarkdownNeedsInlineFormatting('**bold**')).to.equal(true);
        expect(resolveChatMarkdownRenderMode('**bold**', '', undefined)).to.equal('full');
        expect(resolveChatMarkdownRenderMode('text\n```\ncode', 'text\n', 'plain')).to.equal('full');
    });

    it('getSharedChatMarkdownIt renders markdown syntax', () => {
        const html = getSharedChatMarkdownIt().render('**Hello**');
        expect(html).to.include('<strong>Hello</strong>');
    });

    it('keeps plain mode for long append-only prose without markdown syntax', () => {
        const prefix = 'word '.repeat(QAAP_CHAT_MARKDOWN_PLAIN_MAX_CHARS / 5);
        expect(resolveChatMarkdownRenderMode(prefix + ' tail', prefix, 'plain')).to.equal('plain');
    });
});
