// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as markdownit from '@theia/core/shared/markdown-it';
import { parseHTML } from 'linkedom';
import {
    MobileProjectsTranscriptMessagesContentUi,
    TRANSCRIPT_STREAMING_INCREMENTAL_MARKDOWN_CLASS,
    TRANSCRIPT_STREAMING_PLAIN_TEXT_CLASS,
} from './mobile-projects-transcript-messages-content-ui';

describe('MobileProjectsTranscriptMessagesContentUi', () => {

    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');

    before(() => {
        (globalThis as typeof globalThis & { document: Document }).document = document as unknown as Document;
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
});
