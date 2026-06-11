// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { resolveMarkdownStreamStablePrefixLength } from '@theia/qaap-transcript-overlay/lib/common/qaap-transcript-streaming-markdown';

export interface TranscriptStreamingMarkdownPatch {
    readonly stableLength: number;
    readonly totalLength: number;
    /** Present when the stable boundary advanced since the previous patch. */
    readonly frozenHtml?: string;
    readonly tailHtml: string;
}

/**
 * Frozen/tail split for worker-side streaming markdown. Returns `undefined` when
 * {@link content} length and stable boundary are unchanged (noop for the DOM).
 */
export function computeTranscriptStreamingMarkdownPatch(
    content: string,
    previousStableLength: number,
    previousTotalLength: number,
    renderHtml: (markdown: string) => string,
): TranscriptStreamingMarkdownPatch | undefined {
    const stableLength = resolveMarkdownStreamStablePrefixLength(content);
    const totalLength = content.length;
    if (totalLength === previousTotalLength && stableLength === previousStableLength) {
        return undefined;
    }
    return {
        stableLength,
        totalLength,
        ...(stableLength !== previousStableLength
            ? { frozenHtml: renderHtml(content.slice(0, stableLength)) }
            : {}),
        tailHtml: renderHtml(content.slice(stableLength)),
    };
}
