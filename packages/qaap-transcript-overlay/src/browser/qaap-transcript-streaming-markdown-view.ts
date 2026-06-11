// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { resolveMarkdownStreamStablePrefixLength } from '../common/qaap-transcript-streaming-markdown';

export const TRANSCRIPT_STREAM_FROZEN_CLASS = 'theia-transcript-stream-frozen';
export const TRANSCRIPT_STREAM_TAIL_CLASS = 'theia-transcript-stream-tail';
/** Live monospace suffix appended after worker HTML while the stream is ahead of the worker. */
export const TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS = 'theia-transcript-stream-plain-preview';

const STREAM_STABLE_LENGTH_DATA = 'qaapStreamStableLength';
const STREAM_TOTAL_LENGTH_DATA = 'qaapStreamTotalLength';

export interface StreamingMarkdownPatchOptions {
    /** Markdown source → sanitized HTML. */
    readonly renderHtml: (markdown: string) => string;
    /** Optional post-render decoration (e.g. copy buttons on code blocks). */
    readonly decorate?: (container: HTMLElement) => void;
}

/**
 * Append-only streaming markdown: the content element holds a frozen container with
 * all closed blocks and a tail container with the single open block. Per delta, only
 * the tail re-renders; the frozen part re-renders only when the stable boundary
 * advances (roughly once per paragraph), so per-token cost stays O(open block).
 *
 * Both containers use `display: contents` so the rendered blocks lay out exactly as
 * if they were direct children of the content element.
 */
export function patchStreamingMarkdownContent(
    contentEl: HTMLElement,
    markdown: string,
    options: StreamingMarkdownPatchOptions,
): void {
    let frozen = contentEl.querySelector<HTMLElement>(`:scope > .${TRANSCRIPT_STREAM_FROZEN_CLASS}`);
    let tail = contentEl.querySelector<HTMLElement>(`:scope > .${TRANSCRIPT_STREAM_TAIL_CLASS}`);
    if (!frozen || !tail) {
        frozen = document.createElement('div');
        frozen.className = TRANSCRIPT_STREAM_FROZEN_CLASS;
        tail = document.createElement('div');
        tail.className = TRANSCRIPT_STREAM_TAIL_CLASS;
        contentEl.replaceChildren(frozen, tail);
        delete contentEl.dataset[STREAM_STABLE_LENGTH_DATA];
        delete contentEl.dataset[STREAM_TOTAL_LENGTH_DATA];
    }

    const stableLength = resolveMarkdownStreamStablePrefixLength(markdown);
    const previousStable = Number(contentEl.dataset[STREAM_STABLE_LENGTH_DATA] ?? '-1');
    const previousTotal = Number(contentEl.dataset[STREAM_TOTAL_LENGTH_DATA] ?? '-1');
    if (markdown.length === previousTotal && stableLength === previousStable) {
        return;
    }

    if (stableLength !== previousStable) {
        frozen.innerHTML = options.renderHtml(markdown.slice(0, stableLength));
        options.decorate?.(frozen);
        contentEl.dataset[STREAM_STABLE_LENGTH_DATA] = String(stableLength);
    }
    tail.innerHTML = options.renderHtml(markdown.slice(stableLength));
    options.decorate?.(tail);
    contentEl.dataset[STREAM_TOTAL_LENGTH_DATA] = String(markdown.length);
}

export interface StreamingMarkdownHtmlPatch {
    readonly stableLength: number;
    readonly totalLength: number;
    /** When the stable boundary moved since the last applied patch. */
    readonly frozenHtml?: string;
    readonly tailHtml: string;
}

/**
 * Apply pre-sanitized frozen/tail HTML from the markdown worker. Main thread only
 * touches DOM — no markdown-it on the SSE hot path.
 *
 * @returns `false` when the patch is a noop (same lengths as already applied).
 */
export function applyStreamingMarkdownHtmlPatch(
    contentEl: HTMLElement,
    patch: StreamingMarkdownHtmlPatch,
): boolean {
    const previousStable = Number(contentEl.dataset[STREAM_STABLE_LENGTH_DATA] ?? '-1');
    const previousTotal = Number(contentEl.dataset[STREAM_TOTAL_LENGTH_DATA] ?? '-1');
    if (patch.totalLength === previousTotal && patch.stableLength === previousStable) {
        return false;
    }

    let frozen = contentEl.querySelector<HTMLElement>(`:scope > .${TRANSCRIPT_STREAM_FROZEN_CLASS}`);
    let tail = contentEl.querySelector<HTMLElement>(`:scope > .${TRANSCRIPT_STREAM_TAIL_CLASS}`);
    if (!frozen || !tail) {
        frozen = document.createElement('div');
        frozen.className = TRANSCRIPT_STREAM_FROZEN_CLASS;
        tail = document.createElement('div');
        tail.className = TRANSCRIPT_STREAM_TAIL_CLASS;
        contentEl.replaceChildren(frozen, tail);
        ensureStreamingPlainPreview(contentEl);
        delete contentEl.dataset[STREAM_STABLE_LENGTH_DATA];
        delete contentEl.dataset[STREAM_TOTAL_LENGTH_DATA];
    }

    if (patch.stableLength !== previousStable && patch.frozenHtml !== undefined) {
        frozen.innerHTML = patch.frozenHtml;
        contentEl.dataset[STREAM_STABLE_LENGTH_DATA] = String(patch.stableLength);
    }
    tail.innerHTML = patch.tailHtml;
    contentEl.dataset[STREAM_TOTAL_LENGTH_DATA] = String(patch.totalLength);
    return true;
}

export function ensureStreamingPlainPreview(contentEl: HTMLElement): HTMLElement {
    let preview = contentEl.querySelector<HTMLElement>(`:scope > .${TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS}`);
    if (!preview) {
        preview = document.createElement('div');
        preview.className = TRANSCRIPT_STREAM_PLAIN_PREVIEW_CLASS;
        contentEl.append(preview);
    }
    return preview;
}

/**
 * Monospace live edge: full source until the worker paints, then only the suffix
 * after {@link formattedTotalLength} so tokens appear instantly while markdown-it
 * runs off-thread.
 */
export function updateStreamingPlainPreview(
    contentEl: HTMLElement,
    fullText: string,
    formattedTotalLength: number,
): void {
    const preview = ensureStreamingPlainPreview(contentEl);
    const suffix = formattedTotalLength > 0 ? fullText.slice(formattedTotalLength) : fullText;
    if (!suffix) {
        preview.textContent = '';
        preview.hidden = true;
        return;
    }
    preview.hidden = false;
    preview.textContent = suffix;
}
