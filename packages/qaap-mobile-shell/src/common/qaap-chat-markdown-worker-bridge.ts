// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    applyStreamingMarkdownHtmlPatch,
    updateStreamingPlainPreview,
    type StreamingMarkdownHtmlPatch,
} from '@theia/qaap-transcript-overlay/lib/browser/qaap-transcript-streaming-markdown-view';
import { QaapTranscriptMarkdownWorkerClient } from '../browser/qaap-transcript-markdown-worker-client';
import {
    QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS,
    renderChatMarkdownHtml,
    type QaapChatMarkdownRenderMode,
} from './qaap-chat-markdown-render';

export function applySyncChatMarkdownHost(
    host: HTMLElement,
    markdown: string,
    skipSurroundingParagraph = false,
): void {
    host.classList.remove(QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS);
    host.classList.add('theia-mod-markdown');
    delete host.dataset.qaapStreamStableLength;
    delete host.dataset.qaapStreamTotalLength;
    const htmlHost = document.createElement('div');
    htmlHost.innerHTML = renderChatMarkdownHtml(markdown, skipSurroundingParagraph);
    host.replaceChildren(htmlHost);
}

export function applyWorkerStreamPatchToHost(
    host: HTMLElement,
    patch: StreamingMarkdownHtmlPatch,
    markdown: string,
): void {
    host.classList.remove(QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS);
    host.classList.add('theia-mod-markdown');
    if (!applyStreamingMarkdownHtmlPatch(host, patch)) {
        return;
    }
    updateStreamingPlainPreview(host, markdown, patch.totalLength);
}

export function scheduleChatMarkdownWorkerRender(
    host: HTMLElement,
    markdown: string,
    previousMarkdown: string,
    previousMode: QaapChatMarkdownRenderMode | undefined,
    skipSurroundingParagraph = false,
): void {
    const client = QaapTranscriptMarkdownWorkerClient.get();
    const syncFallback = (target: HTMLElement, content: string): void => {
        applySyncChatMarkdownHost(target, content, skipSurroundingParagraph);
    };
    const isStreamingAppend = previousMode === 'worker'
        && previousMarkdown.length > 0
        && markdown.startsWith(previousMarkdown);

    if (isStreamingAppend) {
        const previousStable = Number(host.dataset.qaapStreamStableLength ?? '-1');
        const previousTotal = Number(host.dataset.qaapStreamTotalLength ?? '-1');
        client.requestStreamingPatch(
            host,
            markdown,
            previousStable,
            previousTotal,
            (target, patch) => applyWorkerStreamPatchToHost(target, patch, markdown),
            syncFallback,
        );
        return;
    }

    client.requestParse(
        host,
        markdown,
        (target, html) => {
            target.classList.remove(QAAP_CHAT_MARKDOWN_PLAIN_STREAM_CLASS);
            target.classList.add('theia-mod-markdown');
            delete target.dataset.qaapStreamStableLength;
            delete target.dataset.qaapStreamTotalLength;
            target.innerHTML = html;
        },
        syncFallback,
    );
}
