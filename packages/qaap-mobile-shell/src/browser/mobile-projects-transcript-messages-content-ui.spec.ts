// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as markdownit from '@theia/core/shared/markdown-it';
import { parseHTML } from 'linkedom';
import {
    TRANSCRIPT_STREAM_FROZEN_CLASS,
    TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS,
    TRANSCRIPT_STREAM_TAIL_CLASS,
    applyStreamingMarkdownHtmlPatch,
} from '@theia/qaap-transcript-overlay/lib/browser/qaap-transcript-streaming-markdown-view';
import {
    MobileProjectsTranscriptMessagesContentUi,
    TRANSCRIPT_STREAMING_HYBRID_CLASS,
    TRANSCRIPT_STREAMING_INCREMENTAL_MARKDOWN_CLASS,
    TRANSCRIPT_STREAMING_INCREMENTAL_MIN_CHARS,
    TRANSCRIPT_STREAMING_PLAIN_TEXT_CLASS,
} from './mobile-projects-transcript-messages-content-ui';
import { QaapTranscriptMarkdownWorkerClient } from './qaap-transcript-markdown-worker-client';

describe('MobileProjectsTranscriptMessagesContentUi', () => {

    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');

    before(() => {
        (globalThis as typeof globalThis & { document: Document }).document = document as unknown as Document;
    });

    beforeEach(() => {
        QaapTranscriptMarkdownWorkerClient.resetForTests();
        const client = QaapTranscriptMarkdownWorkerClient.get();
        (client as unknown as { requestStreamingPatch: () => void }).requestStreamingPatch = () => { /* tested via direct HTML patch */ };
    });

    it('renderTranscriptStreamingMarkdown keeps short streams as plain text', () => {
        const host = document.createElement('div');
        host.className = 'theia-mobile-agent-transcript-content';
        const ui = new MobileProjectsTranscriptMessagesContentUi({
            transcriptMarkdownIt: markdownit(),
        } as never);
        ui.renderTranscriptStreamingMarkdown(host, '**Hello** `world`');
        expect(host.classList.contains(TRANSCRIPT_STREAMING_PLAIN_TEXT_CLASS)).to.equal(true);
        expect(host.classList.contains(TRANSCRIPT_STREAMING_INCREMENTAL_MARKDOWN_CLASS)).to.equal(false);
        expect(host.textContent).to.equal('**Hello** `world`');
        expect(host.querySelector('strong')).to.equal(null);
    });

    it('renderTranscriptStreamingMarkdown mounts hybrid plain preview for long streams', () => {
        const host = document.createElement('div');
        host.className = 'theia-mobile-agent-transcript-content';
        const ui = new MobileProjectsTranscriptMessagesContentUi({
            transcriptMarkdownIt: markdownit(),
        } as never);
        const long = '# Title\n\n' + 'word '.repeat(TRANSCRIPT_STREAMING_INCREMENTAL_MIN_CHARS);
        ui.renderTranscriptStreamingMarkdown(host, long);
        expect(host.classList.contains(TRANSCRIPT_STREAMING_HYBRID_CLASS)).to.equal(true);
        expect(host.classList.contains(TRANSCRIPT_STREAMING_PLAIN_TEXT_CLASS)).to.equal(false);
        const preview = host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`);
        expect(preview?.textContent).to.contain('# Title');
    });

    it('renderTranscriptStreamingMarkdown updates plain preview suffix while worker HTML is partial', () => {
        const host = document.createElement('div');
        const ui = new MobileProjectsTranscriptMessagesContentUi({
            transcriptMarkdownIt: markdownit(),
        } as never);
        const prefix = '# Title\n\n' + 'word '.repeat(TRANSCRIPT_STREAMING_INCREMENTAL_MIN_CHARS);
        ui.renderTranscriptStreamingMarkdown(host, prefix);
        host.dataset.qaapStreamTotalLength = String(prefix.length);
        applyStreamingMarkdownHtmlPatch(host, {
            stableLength: 0,
            totalLength: prefix.length,
            tailHtml: '<h1>Title</h1>',
        });
        host.classList.add('theia-mod-markdown', TRANSCRIPT_STREAMING_INCREMENTAL_MARKDOWN_CLASS, TRANSCRIPT_STREAMING_HYBRID_CLASS);
        ui.renderTranscriptStreamingMarkdown(host, prefix + 'live');
        const preview = host.querySelector<HTMLElement>(`.${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`);
        expect(preview?.textContent).to.equal('live');
        expect(host.querySelector('h1')?.textContent).to.equal('Title');
    });

    it('applyTranscriptStreamingMarkdownHtml mounts worker frozen/tail without markdown-it on host', () => {
        const host = document.createElement('div');
        const ui = new MobileProjectsTranscriptMessagesContentUi({
            transcriptMarkdownIt: markdownit(),
        } as never);
        const long = '# Title\n\n' + 'word '.repeat(TRANSCRIPT_STREAMING_INCREMENTAL_MIN_CHARS);
        ui.renderTranscriptStreamingMarkdown(host, long);
        applyStreamingMarkdownHtmlPatch(host, {
            stableLength: 0,
            totalLength: long.length,
            tailHtml: '<h1>Title</h1><p>Rendered</p>',
        });
        host.classList.remove(TRANSCRIPT_STREAMING_PLAIN_TEXT_CLASS);
        host.classList.add('theia-mod-markdown', TRANSCRIPT_STREAMING_INCREMENTAL_MARKDOWN_CLASS);
        expect(host.querySelector(`.${TRANSCRIPT_STREAM_FROZEN_CLASS}`)).to.not.equal(null);
        expect(host.querySelector(`.${TRANSCRIPT_STREAM_TAIL_CLASS}`)).to.not.equal(null);
        expect(host.querySelector('h1')?.textContent).to.equal('Title');
    });

    it('renderTranscriptStreamingMarkdown stays fast across many SSE-sized updates', () => {
        const host = document.createElement('div');
        const ui = new MobileProjectsTranscriptMessagesContentUi({
            transcriptMarkdownIt: markdownit(),
        } as never);
        const prefix = '## Streaming\n\n' + 'line of prose. '.repeat(400);
        const start = performance.now();
        for (let i = 0; i < 600; i++) {
            ui.renderTranscriptStreamingMarkdown(host, prefix + ' token-' + i);
        }
        const elapsedMs = performance.now() - start;
        expect(elapsedMs).to.be.below(120);
        expect(host.classList.contains(TRANSCRIPT_STREAMING_HYBRID_CLASS)).to.equal(true);
    });
});
