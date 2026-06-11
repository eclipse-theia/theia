// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { parseHTML } from 'linkedom';
import {
    applyStreamingMarkdownHtmlPatch,
    TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS,
    updateStreamingPlainPreview,
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

    it('applyStreamingMarkdownHtmlPatch applies worker HTML without renderHtml', () => {
        const host = document.createElement('div');
        const prefix = `${'Stable block.\n\n'.repeat(25)}Tail `;
        const first = applyStreamingMarkdownHtmlPatch(host, {
            stableLength: prefix.length - 5,
            totalLength: prefix.length + 3,
            frozenHtml: '<p>frozen</p>',
            tailHtml: '<p>tail-one</p>',
        });
        expect(first).to.equal(true);
        expect(host.querySelector(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)?.innerHTML).to.contain('frozen');
        const frozenHtml = host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)?.innerHTML;
        const second = applyStreamingMarkdownHtmlPatch(host, {
            stableLength: prefix.length - 5,
            totalLength: prefix.length + 7,
            tailHtml: '<p>tail-one-two</p>',
        });
        expect(second).to.equal(true);
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)?.innerHTML).to.equal(frozenHtml);
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_TAIL_CLASS}`)?.innerHTML).to.contain('tail-one-two');
    });

    it('updateStreamingPlainPreview shows full text before worker paint then only the suffix', () => {
        const host = document.createElement('div');
        const formatted = '## Done\n\n';
        const full = `${formatted}Open tail live`;
        updateStreamingPlainPreview(host, full, 0);
        const preview = host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`);
        expect(preview?.textContent).to.equal(full);
        applyStreamingMarkdownHtmlPatch(host, {
            stableLength: formatted.length,
            totalLength: formatted.length,
            frozenHtml: '<h2>Done</h2>',
            tailHtml: '',
        });
        updateStreamingPlainPreview(host, full, formatted.length);
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`)?.textContent).to.equal('Open tail live');
        updateStreamingPlainPreview(host, full, full.length);
        expect(host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`)?.hidden).to.equal(true);
    });
});
