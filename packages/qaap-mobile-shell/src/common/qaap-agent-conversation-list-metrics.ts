// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from './qaap-qaiq-stream';

/** Denormalized list-row metrics derived from conversation messages (Work Hub / SSE). */
export interface QaapAgentConversationListMetrics {
    /** Human-readable in-flight status, e.g. "Searching" or "Running bash". */
    readonly activityLabel?: string;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    /** Epoch ms when the current streaming turn started (last user message). */
    readonly turnStartedAt?: number;
    /** Duration of the last completed agent turn in milliseconds. */
    readonly lastTurnDurationMs?: number;
}

export interface QaapAgentConversationListMetricsInput {
    readonly status: 'idle' | 'streaming' | 'failed';
    readonly messages: ReadonlyArray<{
        readonly role: 'user' | 'agent';
        readonly content: string;
        readonly createdAt: number;
        readonly segments?: ReadonlyArray<QaapAgentMessageSegment>;
    }>;
}

export function buildConversationListMetrics(
    input: QaapAgentConversationListMetricsInput,
): QaapAgentConversationListMetrics {
    const turnMessages = sliceLastTurnMessages(input.messages);
    const diff = aggregateDiffStats(input.messages);
    const metrics: QaapAgentConversationListMetrics = { ...diff };

    if (input.status === 'streaming') {
        const turnStartedAt = findLastUserMessage(input.messages)?.createdAt;
        if (turnStartedAt !== undefined) {
            Object.assign(metrics, { turnStartedAt });
        }
        const activityLabel = resolveStreamingActivityLabel(turnMessages);
        if (activityLabel) {
            Object.assign(metrics, { activityLabel });
        }
        return metrics;
    }

    const durationMs = resolveLastTurnDurationMs(input.messages);
    if (durationMs !== undefined) {
        Object.assign(metrics, { lastTurnDurationMs: durationMs });
    }
    return metrics;
}

/** Best-effort parse of git / agent summaries into line counts. */
export function parseDiffStatsFromText(text: string): { readonly added: number; readonly removed: number } | undefined {
    const normalized = text.replace(/\s+/g, ' ');
    if (!normalized.trim()) {
        return undefined;
    }

    const combined = normalized.match(
        /(\d+)\s+insertions?\([^)]*\)[^.]*?(\d+)\s+deletions?\([^)]*\)/i,
    );
    if (combined) {
        return { added: parseInt(combined[1], 10), removed: parseInt(combined[2], 10) };
    }

    const cursorStyle = normalized.match(/\+\s*(\d{1,6})\s*[-–−]\s*(\d{1,6})/);
    if (cursorStyle) {
        return { added: parseInt(cursorStyle[1], 10), removed: parseInt(cursorStyle[2], 10) };
    }

    const insertion = normalized.match(/(\d+)\s+insertions?\(\+\)/i)
        ?? normalized.match(/(\d+)\s+insertion(?:s)?(?!\s*\()/i);
    const deletion = normalized.match(/(\d+)\s+deletions?\(-\)/i)
        ?? normalized.match(/(\d+)\s+deletion(?:s)?(?!\s*\()/i);
    if (insertion || deletion) {
        return {
            added: insertion ? parseInt(insertion[1], 10) : 0,
            removed: deletion ? parseInt(deletion[1], 10) : 0,
        };
    }

    return undefined;
}

export function formatToolActivityLabel(toolName: string): string {
    const name = toolName.trim().toLowerCase();
    if (!name) {
        return 'Working';
    }
    if (name.includes('grep') || name.includes('search') || name.includes('glob') || name.includes('web_search')) {
        return 'Searching';
    }
    if (name.includes('read') || name.includes('list') || name.includes('ls')) {
        return 'Reading files';
    }
    if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
        return 'Running command';
    }
    if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
        return 'Editing';
    }
    if (name.includes('think')) {
        return 'Thinking';
    }
    return toolName.replace(/_/g, ' ');
}

function sliceLastTurnMessages(
    messages: QaapAgentConversationListMetricsInput['messages'],
): QaapAgentConversationListMetricsInput['messages'] {
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }
    return lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages;
}

function findLastUserMessage(
    messages: QaapAgentConversationListMetricsInput['messages'],
): QaapAgentConversationListMetricsInput['messages'][number] | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            return messages[i];
        }
    }
    return undefined;
}

/** Sums diff stats reported across every agent message in the conversation. */
function aggregateDiffStats(
    messages: QaapAgentConversationListMetricsInput['messages'],
): Pick<QaapAgentConversationListMetrics, 'linesAdded' | 'linesRemoved'> {
    let added = 0;
    let removed = 0;
    let found = false;
    for (const message of messages) {
        if (message.role !== 'agent') {
            continue;
        }
        for (const text of collectMessageTexts(message)) {
            const parsed = parseDiffStatsFromText(text);
            if (parsed) {
                added += parsed.added;
                removed += parsed.removed;
                found = true;
            }
        }
    }
    if (!found || (added === 0 && removed === 0)) {
        return {};
    }
    return { linesAdded: added, linesRemoved: removed };
}

function collectMessageTexts(
    message: QaapAgentConversationListMetricsInput['messages'][number],
): string[] {
    const texts: string[] = [];
    if (message.content.trim()) {
        texts.push(message.content);
    }
    for (const segment of message.segments ?? []) {
        if (segment.type === 'text' || segment.type === 'thinking') {
            if (segment.content.trim()) {
                texts.push(segment.content);
            }
        } else if (segment.result?.trim()) {
            texts.push(segment.result);
        } else if (segment.args.trim()) {
            texts.push(segment.args);
        }
    }
    return texts;
}

function resolveStreamingActivityLabel(
    turnMessages: QaapAgentConversationListMetricsInput['messages'],
): string | undefined {
    const lastAgent = [...turnMessages].reverse().find(message => message.role === 'agent');
    if (!lastAgent?.segments?.length) {
        return undefined;
    }
    const activeTool = [...lastAgent.segments]
        .reverse()
        .find((segment): segment is Extract<QaapAgentMessageSegment, { type: 'tool' }> =>
            segment.type === 'tool' && !segment.finished);
    if (activeTool) {
        return formatToolActivityLabel(activeTool.name);
    }
    const thinking = lastAgent.segments.some(segment =>
        segment.type === 'thinking' && segment.content.trim().length > 0);
    const hasText = lastAgent.segments.some(segment =>
        segment.type === 'text' && segment.content.trim().length > 0);
    if (thinking && !hasText) {
        return 'Thinking';
    }
    return undefined;
}

function resolveLastTurnDurationMs(
    messages: QaapAgentConversationListMetricsInput['messages'],
): number | undefined {
    let lastUser: QaapAgentConversationListMetricsInput['messages'][number] | undefined;
    let lastAgent: QaapAgentConversationListMetricsInput['messages'][number] | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!lastAgent && message.role === 'agent') {
            lastAgent = message;
        }
        if (!lastUser && message.role === 'user') {
            lastUser = message;
        }
        if (lastUser && lastAgent) {
            break;
        }
    }
    if (!lastUser || !lastAgent || lastAgent.createdAt < lastUser.createdAt) {
        return undefined;
    }
    return Math.max(0, lastAgent.createdAt - lastUser.createdAt);
}
