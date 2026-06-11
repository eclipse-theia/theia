// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Claude-Code-style streaming status line data: elapsed turn time and an approximate
 * token count for the in-flight agent reply ("· 1m 23s · ~4.2k tokens").
 */

/** Rough chars-per-token heuristic — close enough for a progress hint. */
export const STREAM_STATUS_CHARS_PER_TOKEN = 4;

interface StreamStatusMessage {
    readonly role: string;
    readonly createdAt?: number;
    readonly content?: string;
    readonly segments?: ReadonlyArray<{ readonly type: string; readonly content?: string }>;
}

/** Start of the in-flight turn: the last user message's timestamp. */
export function resolveTranscriptTurnStartMs(messages: readonly StreamStatusMessage[]): number | undefined {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.role === 'user') {
            return message.createdAt;
        }
    }
    return undefined;
}

/** Characters produced by the in-flight agent turn (text + thinking segments, or raw content). */
export function resolveTranscriptTurnStreamChars(messages: readonly StreamStatusMessage[]): number {
    const last = messages[messages.length - 1];
    if (!last || last.role === 'user') {
        return 0;
    }
    if (last.segments?.length) {
        let total = 0;
        for (const segment of last.segments) {
            if (segment.type === 'text' || segment.type === 'thinking') {
                total += segment.content?.length ?? 0;
            }
        }
        return total;
    }
    return last.content?.length ?? 0;
}

/** "12s", "1m 23s", "1h 2m". */
export function formatTranscriptStreamElapsed(elapsedMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) {
        return `${totalMinutes}m ${totalSeconds % 60}s`;
    }
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/** "~870 tokens", "~4.2k tokens"; undefined while nothing has streamed yet. */
export function formatTranscriptStreamTokens(chars: number): string | undefined {
    const tokens = Math.round(chars / STREAM_STATUS_CHARS_PER_TOKEN);
    if (tokens <= 0) {
        return undefined;
    }
    if (tokens < 1000) {
        return `~${tokens} tokens`;
    }
    const thousands = tokens / 1000;
    const rounded = thousands >= 10 ? Math.round(thousands).toString() : (Math.round(thousands * 10) / 10).toFixed(1);
    return `~${rounded}k tokens`;
}
