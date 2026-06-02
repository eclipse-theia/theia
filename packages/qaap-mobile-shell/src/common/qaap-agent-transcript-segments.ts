// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Minimal segment shape for transcript activity / inline-render decisions. */
export interface QaapTranscriptActivitySegment {
    readonly type: 'thinking' | 'tool' | 'text';
    readonly content?: string;
    readonly name?: string;
}

export type QaapTranscriptToolActivityKind = 'reading' | 'searching' | 'terminal' | 'editing' | 'tool';

export interface QaapTranscriptActivityStats {
    readonly fileReads: number;
    readonly searches: number;
    readonly shells: number;
    readonly edits: number;
    readonly otherTools: number;
}

/** Classifies a tool name into a coarse activity bucket for transcript meta stats. */
export function classifyTranscriptToolActivityKind(toolName: string): QaapTranscriptToolActivityKind {
    const name = toolName.toLowerCase();
    if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
        return 'terminal';
    }
    if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
        return 'editing';
    }
    if (name.includes('grep') || name.includes('search') || name.includes('glob')) {
        return 'searching';
    }
    if (name.includes('read') || name.includes('list') || name.includes('ls')) {
        return 'reading';
    }
    return 'tool';
}

/** Aggregates tool-call counts shown under the thought-brief header (Cursor-style meta line). */
export function resolveTranscriptActivityStats(
    segments: readonly QaapTranscriptActivitySegment[],
): QaapTranscriptActivityStats {
    let fileReads = 0;
    let searches = 0;
    let shells = 0;
    let edits = 0;
    let otherTools = 0;
    for (const segment of segments) {
        if (segment.type !== 'tool' || !segment.name) {
            continue;
        }
        switch (classifyTranscriptToolActivityKind(segment.name)) {
            case 'reading':
                fileReads += 1;
                break;
            case 'searching':
                searches += 1;
                break;
            case 'terminal':
                shells += 1;
                break;
            case 'editing':
                edits += 1;
                break;
            default:
                otherTools += 1;
        }
    }
    return { fileReads, searches, shells, edits, otherTools };
}

export function hasTranscriptActivityStats(stats: QaapTranscriptActivityStats): boolean {
    return stats.fileReads + stats.searches + stats.shells + stats.edits + stats.otherTools > 0;
}

/** Joins thinking segments into one block of reasoning text. */
export function resolveTranscriptThinkingContent(segments: readonly QaapTranscriptActivitySegment[]): string | undefined {
    const parts = segments
        .filter((segment): segment is QaapTranscriptActivitySegment & { type: 'thinking' } =>
            segment.type === 'thinking' && !!segment.content?.trim())
        .map(segment => segment.content!.trim());
    if (parts.length === 0) {
        return undefined;
    }
    return parts.join('\n\n');
}

/** One-line preview for the thought-brief body (Cursor-style intent paragraph). */
export function excerptTranscriptThought(text: string, maxLength = 280): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) {
        return compact;
    }
    return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function isTranscriptThoughtExcerptTruncated(text: string, maxLength = 280): boolean {
    return text.replace(/\s+/g, ' ').trim().length > maxLength;
}

/**
 * Whether the premium activity timeline would render for these segments.
 * Mirrors {@link resolveTranscriptActivityItems} empty-check without building labels.
 */
export function hasTranscriptActivityTimeline(segments: readonly QaapTranscriptActivitySegment[]): boolean {
    for (const segment of segments) {
        if (segment.type === 'thinking' && segment.content?.trim()) {
            return true;
        }
        if (segment.type === 'tool') {
            return true;
        }
    }
    if (segments.some(segment => segment.type === 'text' && segment.content?.trim())) {
        return true;
    }
    return false;
}

/**
 * When the activity timeline is shown, finished successful tool calls are already listed there.
 * Keep inline detail only for live tools (still running) or failed results worth inspecting.
 */
export function shouldRenderTranscriptToolSegmentInline(options: {
    readonly activityTimelineShown: boolean;
    readonly finished: boolean;
    readonly resultFailed: boolean;
}): boolean {
    if (!options.activityTimelineShown) {
        return true;
    }
    if (!options.finished) {
        return true;
    }
    return options.resultFailed;
}

/** Expand tool/shell panels while running or when a failed result needs attention. */
export function shouldOpenTranscriptToolDetails(options: {
    readonly finished: boolean;
    readonly resultFailed: boolean;
}): boolean {
    if (!options.finished) {
        return true;
    }
    return options.resultFailed;
}
