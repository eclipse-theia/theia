// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';
import { parseHTML } from 'linkedom';
import { computeTranscriptStreamingMarkdownPatch } from './qaap-transcript-markdown-worker-stream';
import type {
    TranscriptMarkdownWorkerRequest,
    TranscriptMarkdownWorkerResponse,
} from './qaap-transcript-markdown-worker-protocol';

const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createDOMPurify = require('dompurify') as (window: Window) => ReturnType<typeof require>;
const DOMPurify = createDOMPurify(window as unknown as Window);
const markdownIt = markdownit({ linkify: false }).use(markdownitemoji.full);

function renderSanitizedMarkdown(markdown: string): string {
    const html = markdownIt.render(markdown);
    return DOMPurify.sanitize(html, {
        ALLOW_UNKNOWN_PROTOCOLS: true,
    }) as string;
}

self.onmessage = (event: MessageEvent<TranscriptMarkdownWorkerRequest>): void => {
    const message = event.data;
    if (!message) {
        return;
    }
    if (message.type === 'parse') {
        const html = renderSanitizedMarkdown(message.content);
        const response: TranscriptMarkdownWorkerResponse = {
            type: 'result',
            requestId: message.requestId,
            generation: message.generation,
            html,
            cleanLength: message.content.length,
        };
        self.postMessage(response);
        return;
    }
    if (message.type === 'parse_stream') {
        const patch = computeTranscriptStreamingMarkdownPatch(
            message.content,
            message.previousStableLength,
            message.previousTotalLength,
            renderSanitizedMarkdown,
        );
        if (!patch) {
            const response: TranscriptMarkdownWorkerResponse = {
                type: 'stream_result',
                requestId: message.requestId,
                generation: message.generation,
                cleanLength: message.content.length,
                stableLength: message.previousStableLength,
                totalLength: message.previousTotalLength,
                noop: true,
            };
            self.postMessage(response);
            return;
        }
        const response: TranscriptMarkdownWorkerResponse = {
            type: 'stream_result',
            requestId: message.requestId,
            generation: message.generation,
            cleanLength: message.content.length,
            stableLength: patch.stableLength,
            totalLength: patch.totalLength,
            ...(patch.frozenHtml !== undefined ? { frozenHtml: patch.frozenHtml } : {}),
            tailHtml: patch.tailHtml,
        };
        self.postMessage(response);
    }
};
