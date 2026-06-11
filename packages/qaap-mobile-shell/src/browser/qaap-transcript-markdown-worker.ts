// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';
import { parseHTML } from 'linkedom';
import type { TranscriptMarkdownWorkerRequest, TranscriptMarkdownWorkerResponse } from './qaap-transcript-markdown-worker-protocol';

const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createDOMPurify = require('dompurify') as (window: Window) => ReturnType<typeof require>;
const DOMPurify = createDOMPurify(window as unknown as Window);
const markdownIt = markdownit({ linkify: false }).use(markdownitemoji.full);

self.onmessage = (event: MessageEvent<TranscriptMarkdownWorkerRequest>): void => {
    const message = event.data;
    if (message?.type !== 'parse') {
        return;
    }
    const html = markdownIt.render(message.content);
    const sanitized = DOMPurify.sanitize(html, {
        ALLOW_UNKNOWN_PROTOCOLS: true,
    }) as string;
    const response: TranscriptMarkdownWorkerResponse = {
        type: 'result',
        requestId: message.requestId,
        generation: message.generation,
        html: sanitized,
        cleanLength: message.content.length,
    };
    self.postMessage(response);
};
