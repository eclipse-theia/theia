// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as DOMPurify from '@theia/core/shared/dompurify';
import * as markdownit from '@theia/core/shared/markdown-it';
import * as markdownitemoji from '@theia/core/shared/markdown-it-emoji';

/** Plain-text streaming is enough below this size when no fences/formatting are present. */
export const QAAP_CHAT_MARKDOWN_PLAIN_MAX_CHARS = 480;

const FENCE_PATTERN = /(^|\n)\s{0,3}(?:`{3,}|~{3,})/m;
const INLINE_MARKDOWN_PATTERN = /[#*`_[\]|]/;

let sharedMarkdownIt: ReturnType<typeof markdownit> | undefined;

export type QaapChatMarkdownRenderMode = 'plain' | 'full';

export function getSharedChatMarkdownIt(): ReturnType<typeof markdownit> {
    if (!sharedMarkdownIt) {
        sharedMarkdownIt = markdownit().use(markdownitemoji.full);
    }
    return sharedMarkdownIt;
}

/** Visible for unit tests. */
export function resetSharedChatMarkdownItForTests(): void {
    sharedMarkdownIt = undefined;
}

export function chatMarkdownNeedsFenceParse(text: string): boolean {
    return FENCE_PATTERN.test(text);
}

export function chatMarkdownNeedsInlineFormatting(text: string): boolean {
    return INLINE_MARKDOWN_PATTERN.test(text);
}

export function resolveChatMarkdownRenderMode(
    markdown: string,
    previousMarkdown: string,
    previousMode: QaapChatMarkdownRenderMode | undefined,
): QaapChatMarkdownRenderMode {
    if (chatMarkdownNeedsFenceParse(markdown)) {
        return 'full';
    }
    if (markdown.length <= QAAP_CHAT_MARKDOWN_PLAIN_MAX_CHARS && !chatMarkdownNeedsInlineFormatting(markdown)) {
        return 'plain';
    }
    if (
        previousMode === 'plain'
        && markdown.startsWith(previousMarkdown)
        && !chatMarkdownNeedsInlineFormatting(markdown)
    ) {
        return 'plain';
    }
    return 'full';
}

export function sanitizeChatMarkdownHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOW_UNKNOWN_PROTOCOLS: true,
    });
}

export function renderChatMarkdownHtml(markdown: string, skipSurroundingParagraph = false): string {
    const rendered = getSharedChatMarkdownIt().render(markdown);
    const html = skipSurroundingParagraph
        ? rendered.replace(/^<p>|<\/p>|<p><\/p>$/g, '')
        : rendered;
    return sanitizeChatMarkdownHtml(html);
}
