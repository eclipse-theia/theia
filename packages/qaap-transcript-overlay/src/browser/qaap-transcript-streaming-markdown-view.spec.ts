// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { parseHTML } from 'linkedom';
import {
    patchStreamingMarkdownContent,
    TRANSCRIPT_STREAM_FROZEN_CLASS,
    TRANSCRIPT_STREAM_TAIL_CLASS,
} from './qaap-transcript-streaming-markdown-view';

describe('qaap-transcript-streaming-markdown-view', () => {

    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');

    before(() => {
        (globalThis as typeof globalThis & { document: Document }).document = document as unknown as Document;
    });

    it('patchStreamingMarkdownContent mounts frozen and tail containers', () => {
        const host = document.createElement('div');
        const text = `${'Closed paragraph.\n\n'.repeat(30)}Open tail`;
        patchStreamingMarkdownContent(host, text, {
            renderHtml: markdown => `<p data-md="${markdown.length}">${markdown}</p>`,
        });
        expect(host.querySelector(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)).to.not.equal(null);
        expect(host.querySelector(`.${TRANSCRIPT_STREAM_TAIL_CLASS}`)).to.not.equal(null);
    });

    it('patchStreamingMarkdownContent re-renders only the tail on incremental growth', () => {
        const host = document.createElement('div');
        const prefix = `${'Stable block.\n\n'.repeat(25)}Tail `;
        patchStreamingMarkdownContent(host, `${prefix}one`, {
            renderHtml: markdown => `<span>${markdown}</span>`,
        });
        const frozenHtml = host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)?.innerHTML;
        patchStreamingMarkdownContent(host, `${prefix}one-two`, {
            renderHtml: markdown => `<span>${markdown}</span>`,
        });
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)?.innerHTML).to.equal(frozenHtml);
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_TAIL_CLASS}`)?.textContent).to.contain('one-two');
    });
});
