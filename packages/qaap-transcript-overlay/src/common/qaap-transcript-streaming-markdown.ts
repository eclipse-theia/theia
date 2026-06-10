// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const FENCE_LINE = /^\s{0,3}(?:`{3,}|~{3,})/;
const BLOCK_CONTINUATION_LINE = /^(?:\s{2,}\S|\s*(?:[-*+]\s|\d{1,3}[.)]\s|>))/;

/**
 * Length of the markdown prefix that can be considered layout-stable while the text
 * is still streaming. The boundary is the last blank line that is outside a code
 * fence and not followed by a list/quote/indent continuation (so a streaming list
 * or blockquote is never split into two separate rendered blocks).
 *
 * Streaming renderers freeze everything before the boundary and re-render only the
 * open tail block on each delta, turning per-token render cost from O(message)
 * into O(open block).
 */
export function resolveMarkdownStreamStablePrefixLength(text: string): number {
    let inFence = false;
    let offset = 0;
    let lastSafeBoundary = 0;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineEnd = offset + line.length + 1; // include the trailing '\n'
        if (FENCE_LINE.test(line)) {
            inFence = !inFence;
            offset = lineEnd;
            continue;
        }
        if (!inFence && line.trim() === '' && offset > 0) {
            let next = i + 1;
            while (next < lines.length && lines[next].trim() === '') {
                next++;
            }
            if (next < lines.length && !BLOCK_CONTINUATION_LINE.test(lines[next])) {
                lastSafeBoundary = lineEnd;
            }
        }
        offset = lineEnd;
    }
    return Math.min(lastSafeBoundary, text.length);
}
