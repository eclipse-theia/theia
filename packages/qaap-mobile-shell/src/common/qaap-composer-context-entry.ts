// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { generateUuid } from '@theia/core/lib/common/uuid';

export const PENDING_COMPOSER_CONTEXT_ARG_PREFIX = '__qaap_pending__:';

export interface StickyComposerContextEntry {
    readonly id: string;
    request: AIVariableResolutionRequest;
    /** Blob URL for instant preview before upload/encoding finishes. */
    localPreviewSrc?: string;
    pending?: boolean;
    displayName?: string;
}

export function buildPendingComposerContextArg(id: string): string {
    return `${PENDING_COMPOSER_CONTEXT_ARG_PREFIX}${id}`;
}

export function isPendingComposerContextArg(arg: string | undefined): boolean {
    return !!arg?.startsWith(PENDING_COMPOSER_CONTEXT_ARG_PREFIX);
}

export function createComposerContextEntry(request: AIVariableResolutionRequest): StickyComposerContextEntry {
    return { id: generateUuid(), request };
}

export function revokeComposerContextPreview(entry: StickyComposerContextEntry | undefined): void {
    const src = entry?.localPreviewSrc;
    if (src?.startsWith('blob:')) {
        URL.revokeObjectURL(src);
    }
}

export function disposeComposerContextEntries(entries: readonly StickyComposerContextEntry[]): void {
    for (const entry of entries) {
        revokeComposerContextPreview(entry);
    }
}

export function composerContextRequests(
    entries: readonly StickyComposerContextEntry[],
): AIVariableResolutionRequest[] {
    return entries
        .filter(entry => !entry.pending && !isPendingComposerContextArg(entry.request.arg))
        .map(entry => entry.request);
}

export function hasPendingComposerContextEntries(entries: readonly StickyComposerContextEntry[]): boolean {
    return entries.some(entry => entry.pending || isPendingComposerContextArg(entry.request.arg));
}
