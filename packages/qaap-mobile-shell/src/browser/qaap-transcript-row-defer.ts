// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import type { QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';
import {
    shouldDeferTranscriptRowHeavyContent,
    type TranscriptRowDeferContext,
} from '../common/qaap-transcript-row-defer-math';

export { shouldDeferTranscriptRowHeavyContent, type TranscriptRowDeferContext };

export const TRANSCRIPT_ROW_DEFER_ATTR = 'data-transcript-row-deferred';
export const TRANSCRIPT_DEFER_PENDING_ATTR = 'data-transcript-defer-pending';

export interface TranscriptDeferredMarkdownHydrate {
    readonly host: HTMLElement;
    readonly content: string;
    readonly streaming?: boolean;
}

export interface TranscriptDeferredToolBodyHydrate {
    readonly body: HTMLElement;
    readonly segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>;
    readonly kind: string;
    readonly streaming?: boolean;
}

const deferredMarkdown = new WeakMap<HTMLElement, TranscriptDeferredMarkdownHydrate>();
const deferredToolBodies = new WeakMap<HTMLElement, TranscriptDeferredToolBodyHydrate>();

export function markTranscriptRowDeferred(row: HTMLElement): void {
    row.setAttribute(TRANSCRIPT_ROW_DEFER_ATTR, '1');
}

export function isTranscriptRowDeferred(row: HTMLElement): boolean {
    return row.hasAttribute(TRANSCRIPT_ROW_DEFER_ATTR);
}

export function registerDeferredTranscriptMarkdown(hydrate: TranscriptDeferredMarkdownHydrate): void {
    hydrate.host.setAttribute(TRANSCRIPT_DEFER_PENDING_ATTR, 'markdown');
    deferredMarkdown.set(hydrate.host, hydrate);
}

export function registerDeferredTranscriptToolBody(hydrate: TranscriptDeferredToolBodyHydrate): void {
    hydrate.body.setAttribute(TRANSCRIPT_DEFER_PENDING_ATTR, 'tool-body');
    deferredToolBodies.set(hydrate.body, hydrate);
}

export function hydrateDeferredTranscriptMarkdown(
    host: HTMLElement,
    render: (target: HTMLElement, content: string, streaming?: boolean) => void,
): boolean {
    const pending = deferredMarkdown.get(host);
    if (!pending) {
        return false;
    }
    deferredMarkdown.delete(host);
    host.removeAttribute(TRANSCRIPT_DEFER_PENDING_ATTR);
    host.classList.remove('theia-mod-deferred-markdown');
    host.replaceChildren();
    render(pending.host, pending.content, pending.streaming);
    return true;
}

export function hydrateDeferredTranscriptToolBody(
    body: HTMLElement,
    render: (target: HTMLElement, segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>, kind: string, streaming?: boolean) => void,
): boolean {
    const pending = deferredToolBodies.get(body);
    if (!pending) {
        return false;
    }
    deferredToolBodies.delete(body);
    body.removeAttribute(TRANSCRIPT_DEFER_PENDING_ATTR);
    body.classList.remove('theia-mod-deferred-tool-body');
    body.replaceChildren();
    render(pending.body, pending.segment, pending.kind, pending.streaming);
    return true;
}

export function hydrateDeferredTranscriptRow(
    row: HTMLElement,
    renderMarkdown: (target: HTMLElement, content: string, streaming?: boolean) => void,
    renderToolBody: (target: HTMLElement, segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>, kind: string, streaming?: boolean) => void,
): void {
    let hydrated = false;
    for (const host of row.querySelectorAll<HTMLElement>(`[${TRANSCRIPT_DEFER_PENDING_ATTR}="markdown"]`)) {
        if (hydrateDeferredTranscriptMarkdown(host, renderMarkdown)) {
            hydrated = true;
        }
    }
    for (const body of row.querySelectorAll<HTMLElement>(`[${TRANSCRIPT_DEFER_PENDING_ATTR}="tool-body"]`)) {
        if (hydrateDeferredTranscriptToolBody(body, renderToolBody)) {
            hydrated = true;
        }
    }
    if (hydrated && !row.querySelector(`[${TRANSCRIPT_DEFER_PENDING_ATTR}]`)) {
        row.removeAttribute(TRANSCRIPT_ROW_DEFER_ATTR);
    }
}

export interface TranscriptRowDeferHydrateHandlers {
    readonly renderMarkdown: (target: HTMLElement, content: string, streaming?: boolean) => void;
    readonly renderToolBody: (
        target: HTMLElement,
        segment: Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }>,
        kind: string,
        streaming?: boolean,
    ) => void;
}

/**
 * Observes historical transcript rows and hydrates closed tool bodies + markdown when
 * they scroll near the viewport, or immediately when the user expands a tool pill.
 */
export function attachTranscriptRowDeferObserver(
    scrollHost: HTMLElement,
    handlers: TranscriptRowDeferHydrateHandlers,
): Disposable {
    if (typeof IntersectionObserver === 'undefined') {
        return Disposable.NULL;
    }
    const toDispose = new DisposableCollection();
    const observedRows = new Set<HTMLElement>();

    const hydrateRow = (row: HTMLElement): void => {
        if (!row.isConnected) {
            observedRows.delete(row);
            return;
        }
        hydrateDeferredTranscriptRow(row, handlers.renderMarkdown, handlers.renderToolBody);
        if (!row.hasAttribute(TRANSCRIPT_ROW_DEFER_ATTR)) {
            observer.unobserve(row);
            observedRows.delete(row);
        }
    };

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting && entry.target instanceof HTMLElement) {
                hydrateRow(entry.target);
            }
        }
    }, {
        root: scrollHost,
        rootMargin: '120px 0px',
        threshold: 0,
    });
    toDispose.push(Disposable.create(() => observer.disconnect()));

    const onToolToggle = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLDetailsElement) || !target.open) {
            return;
        }
        const body = target.querySelector<HTMLElement>(`.theia-mobile-agent-tool-body[${TRANSCRIPT_DEFER_PENDING_ATTR}="tool-body"]`);
        if (!body) {
            return;
        }
        const row = target.closest<HTMLElement>(`[${TRANSCRIPT_ROW_DEFER_ATTR}]`);
        if (row) {
            hydrateRow(row);
        } else {
            hydrateDeferredTranscriptToolBody(body, handlers.renderToolBody);
        }
    };
    scrollHost.addEventListener('toggle', onToolToggle, true);
    toDispose.push(Disposable.create(() => scrollHost.removeEventListener('toggle', onToolToggle, true)));

    const scanRows = (): void => {
        const selector = `[${TRANSCRIPT_ROW_DEFER_ATTR}]`;
        for (const row of scrollHost.querySelectorAll<HTMLElement>(selector)) {
            if (observedRows.has(row)) {
                continue;
            }
            observedRows.add(row);
            observer.observe(row);
        }
    };

    scanRows();
    const mutationObserver = new MutationObserver(() => scanRows());
    mutationObserver.observe(scrollHost, { childList: true, subtree: true });
    toDispose.push(Disposable.create(() => mutationObserver.disconnect()));

    return toDispose;
}
