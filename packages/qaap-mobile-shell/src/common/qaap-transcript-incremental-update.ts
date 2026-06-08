// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationDTO, QaapAgentMessageDTO, QaapAgentMessageSegmentDTO } from './qaap-agent-conversation-client';
import { usesStructuredAgentTranscript } from './qaap-agent-task-client';

/** How a live SSE update may patch the transcript DOM without a full rebuild. */
export type QaapTranscriptStreamingPatchKind = 'none' | 'activity-only' | 'last-agent' | 'append-agent';

const STRUCTURED_TRANSCRIPT_AGENTS = (agentId: string | undefined): boolean =>
    usesStructuredAgentTranscript(agentId);

function stdoutAgentContentGrew(prev: QaapAgentMessageDTO | undefined, next: QaapAgentMessageDTO | undefined): boolean {
    if (!prev || !next || prev.id !== next.id) {
        return false;
    }
    return (next.content?.length ?? 0) > (prev.content?.length ?? 0);
}

function structuredAgentMessageChanged(
    prev: QaapAgentMessageDTO | undefined,
    next: QaapAgentMessageDTO | undefined,
): boolean {
    if (!prev || !next || prev.id !== next.id) {
        return false;
    }
    if (fingerprintAgentSegments(prev.segments ?? []) !== fingerprintAgentSegments(next.segments ?? [])) {
        return true;
    }
    return (prev.content ?? '') !== (next.content ?? '');
}

function priorMessagesMatch(
    prev: readonly QaapAgentMessageDTO[],
    next: readonly QaapAgentMessageDTO[],
    count: number,
): boolean {
    for (let i = 0; i < count; i++) {
        if (prev[i]?.id !== next[i]?.id || prev[i]?.role !== next[i]?.role) {
            return false;
        }
    }
    return true;
}

/**
 * Fingerprint for transcript refresh debouncing. Hashes every segment so updates to
 * non-last tools/text during streaming are not skipped.
 */
export function buildConversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
    const parts: string[] = [
        conv.autoApprove === false ? '0' : '1',
        conv.status,
        String(conv.updatedAt),
        String(conv.messages.length),
    ];
    for (const message of conv.messages) {
        parts.push(message.id ?? '', String(message.content?.length ?? 0));
        if (message.segments?.length) {
            for (const segment of message.segments) {
                if (segment.type === 'tool') {
                    parts.push(
                        `t:${segment.toolUseId}:${segment.finished ? '1' : '0'}:${segment.args?.length ?? 0}:${segment.result?.length ?? 0}`,
                    );
                } else {
                    parts.push(`${segment.type}:${segment.content?.length ?? 0}`);
                }
            }
        }
    }
    return parts.join('|');
}

/** Whether {@link buildConversationTranscriptFingerprint} changed between two snapshots. */
export function transcriptFingerprintChanged(
    prev: QaapAgentConversationDTO | undefined,
    next: QaapAgentConversationDTO,
): boolean {
    if (!prev || prev.id !== next.id) {
        return true;
    }
    return buildConversationTranscriptFingerprint(prev) !== buildConversationTranscriptFingerprint(next);
}

/** Force a DOM refresh when a turn settles even if the fingerprint already matched mid-stream. */
export function shouldForceTranscriptRenderOnStatusSettle(
    prev: QaapAgentConversationDTO | undefined,
    next: QaapAgentConversationDTO,
    fingerprintUnchanged: boolean,
): boolean {
    if (!fingerprintUnchanged) {
        return false;
    }
    return prev?.status === 'streaming' && next.status !== 'streaming';
}

/**
 * During QAIQ/OpenCode streaming, only the tail of the thread changes. Patching avoids
 * `replaceChildren()` so tool expand state and scroll position stay stable.
 */
export function resolveStreamingTranscriptPatchKind(
    prev: QaapAgentConversationDTO | undefined,
    next: QaapAgentConversationDTO,
): QaapTranscriptStreamingPatchKind {
    if (!prev || prev.id !== next.id || next.status !== 'streaming') {
        return 'none';
    }

    const prevMessages = prev.messages;
    const nextMessages = next.messages;
    const nextLast = nextMessages[nextMessages.length - 1];
    const structured = STRUCTURED_TRANSCRIPT_AGENTS(next.agentId);

    if (prevMessages.length === nextMessages.length && nextLast?.role === 'user') {
        return priorMessagesMatch(prevMessages, nextMessages, nextMessages.length) ? 'activity-only' : 'none';
    }

    if (prevMessages.length === nextMessages.length && nextLast?.role === 'agent') {
        if (!priorMessagesMatch(prevMessages, nextMessages, nextMessages.length - 1)) {
            return 'none';
        }
        if (structured) {
            if (!hasRenderableSegments(nextLast)) {
                return 'none';
            }
            const prevLast = prevMessages[prevMessages.length - 1];
            return structuredAgentMessageChanged(prevLast, nextLast) ? 'last-agent' : 'none';
        }
        const prevLast = prevMessages[prevMessages.length - 1];
        return stdoutAgentContentGrew(prevLast, nextLast) ? 'last-agent' : 'none';
    }

    if (nextMessages.length === prevMessages.length + 1 && nextLast?.role === 'agent') {
        if (!priorMessagesMatch(prevMessages, nextMessages, prevMessages.length)) {
            return 'none';
        }
        if (structured) {
            return hasRenderableSegments(nextLast) ? 'append-agent' : 'none';
        }
        return !!nextLast.content?.trim() ? 'append-agent' : 'none';
    }

    return 'none';
}

function hasRenderableSegments(message: QaapAgentMessageDTO | undefined): boolean {
    return !!message?.segments?.length;
}

/** True when a streaming SSE tick did not change the visible tail of the transcript. */
export function isStreamingTranscriptTailUnchanged(
    prev: QaapAgentConversationDTO | undefined,
    next: QaapAgentConversationDTO,
): boolean {
    if (!prev || prev.id !== next.id || next.status !== 'streaming') {
        return false;
    }
    if (prev.messages.length !== next.messages.length) {
        return false;
    }
    const prevLast = prev.messages[prev.messages.length - 1];
    const nextLast = next.messages[next.messages.length - 1];
    if (!prevLast || !nextLast || prevLast.id !== nextLast.id || prevLast.role !== nextLast.role) {
        return false;
    }
    if (nextLast.role === 'agent' && STRUCTURED_TRANSCRIPT_AGENTS(next.agentId)) {
        return !structuredAgentMessageChanged(prevLast, nextLast);
    }
    return (prevLast.content ?? '') === (nextLast.content ?? '');
}

/** Stable selector hook for incremental DOM patches. */
export const TRANSCRIPT_MESSAGE_ID_ATTR = 'data-transcript-message-id';

/** Marks the live “thinking/acting” placeholder row while the agent has not replied yet. */
export const TRANSCRIPT_ACTIVITY_ROW_ATTR = 'data-transcript-activity-row';

export function fingerprintAgentSegments(segments: readonly QaapAgentMessageSegmentDTO[]): string {
    return segments.map(segment => {
        if (segment.type === 'tool') {
            return `t:${segment.toolUseId}:${segment.finished ? '1' : '0'}:${segment.args?.length ?? 0}:${segment.result?.length ?? 0}`;
        }
        return `${segment.type}:${segment.content?.length ?? 0}`;
    }).join('|');
}
