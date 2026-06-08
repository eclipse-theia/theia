// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageSegment } from './qaap-qaiq-stream';

/** Denormalized list-row metrics derived from conversation messages (Work Hub / SSE). */
export interface QaapAgentConversationListMetrics {
    /** True when the thread ran a `git` command or is linked to a pull request (Work Hub inbox). */
    readonly hasGitOperation?: boolean;
    /** Human-readable in-flight status, e.g. "Searching" or "Running bash". */
    readonly activityLabel?: string;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    /** Epoch ms when the current streaming turn started (last user message). */
    readonly turnStartedAt?: number;
    /** Completed steps in the current streaming turn (tool uses + early-phase estimate). */
    readonly turnProgressCurrent?: number;
    /** Total steps in the current streaming turn. */
    readonly turnProgressTotal?: number;
    /** Duration of the last completed agent turn in milliseconds. */
    readonly lastTurnDurationMs?: number;
}

/** Minimum step count shown while streaming before any tool call appears. */
const STREAMING_TURN_FALLBACK_TOTAL = 6;

export interface QaapAgentConversationListMetricsInput {
    readonly status: 'idle' | 'streaming' | 'failed';
    readonly messages: ReadonlyArray<{
        readonly role: 'user' | 'agent';
        readonly content: string;
        readonly createdAt: number;
        readonly segments?: ReadonlyArray<QaapAgentMessageSegment>;
    }>;
}

/** Detects shell/tool text that invokes the `git` CLI (not substrings like "github"). */
export function textInvokesGit(text: string): boolean {
    if (!text.trim()) {
        return false;
    }
    if (!/\bgit\b/i.test(text)) {
        return false;
    }
    if (/(?:^|[\s;&|`'"(]|&&|\|\|)git(?:\s|$|[\s;&|`'")])/i.test(text)) {
        return true;
    }
    return /["']command["']\s*:\s*["'][^"']*\bgit\s/i.test(text);
}

export function conversationMessagesHaveGitOperation(
    messages: QaapAgentConversationListMetricsInput['messages'],
): boolean {
    for (const message of messages) {
        if (message.role === 'user' && textInvokesGit(message.content)) {
            return true;
        }
        for (const text of collectMessageTexts(message)) {
            if (textInvokesGit(text)) {
                return true;
            }
        }
    }
    return false;
}

export function buildConversationListMetrics(
    input: QaapAgentConversationListMetricsInput,
): QaapAgentConversationListMetrics {
    const turnMessages = sliceLastTurnMessages(input.messages);
    const diff = aggregateDiffStats(input.messages);
    const hasGitOperation = conversationMessagesHaveGitOperation(input.messages)
        ? true
        : undefined;
    if (input.status === 'streaming') {
        const turnProgress = resolveConversationTurnProgress(turnMessages);
        return {
            ...diff,
            hasGitOperation,
            turnStartedAt: findLastUserMessage(input.messages)?.createdAt,
            activityLabel: resolveStreamingActivityLabel(turnMessages),
            ...turnProgress,
        };
    }
    return {
        ...diff,
        hasGitOperation,
        lastTurnDurationMs: resolveLastTurnDurationMs(input.messages),
    };
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

function parseToolArgNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
}

/** True for file `Read` tools — not grep/glob/list. */
export function isPureReadToolName(toolName: string): boolean {
    const name = toolName.trim().toLowerCase();
    if (name.includes('grep') || name.includes('search') || name.includes('glob')
        || name.includes('list') || name === 'ls') {
        return false;
    }
    return name === 'read' || name.endsWith('_read') || /\bread\b/.test(name);
}

/** `L2505-2554` from Read-tool args (`offset` + `limit`, 1-based lines). */
export function formatReadToolLineRange(args: Record<string, unknown>): string | undefined {
    const offset = parseToolArgNumber(args.offset);
    const limit = parseToolArgNumber(args.limit);
    if (offset !== undefined && limit !== undefined && limit > 0) {
        return `L${offset}-${offset + limit - 1}`;
    }
    if (offset !== undefined) {
        return `L${offset}`;
    }
    if (limit !== undefined && limit > 0) {
        return `L1-${limit}`;
    }
    return undefined;
}

/** Basename + optional line range, e.g. `mobile-projects-panel.ts L2505-2554`. */
export function formatReadToolDetailFromArgs(argsJson?: string): string | undefined {
    if (!argsJson) {
        return undefined;
    }
    try {
        const args = JSON.parse(argsJson) as Record<string, unknown>;
        const filePath = (typeof args.path === 'string' && args.path)
            ? args.path
            : (typeof args.file_path === 'string' && args.file_path)
                ? args.file_path
                : (typeof args.filename === 'string' && args.filename)
                    ? args.filename
                    : undefined;
        if (!filePath) {
            return undefined;
        }
        const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
        const fileName = parts.pop() ?? filePath;
        const range = formatReadToolLineRange(args);
        return range ? `${fileName} ${range}` : fileName;
    } catch {
        return undefined;
    }
}

export function formatToolActivityLabel(toolName: string | undefined | null, argsJson?: string): string {
    const safeToolName = toolName ?? '';
    const name = safeToolName.trim().toLowerCase();

    // Try to extract a meaningful detail (file name or command) from the tool args.
    let detail: string | undefined;
    if (argsJson) {
        try {
            const args = JSON.parse(argsJson) as Record<string, unknown>;
            const filePath = (typeof args.path === 'string' && args.path)
                ? args.path
                : (typeof args.file_path === 'string' && args.file_path)
                    ? args.file_path
                    : undefined;
            if (filePath) {
                const parts = filePath.split('/').filter(Boolean);
                detail = parts.slice(-2).join('/');
            } else if (typeof args.command === 'string' && args.command.trim()) {
                const cmd = args.command.trim();
                detail = cmd.length > 40 ? `${cmd.slice(0, 37)}…` : cmd;
            } else if (typeof args.pattern === 'string' && args.pattern.trim()) {
                const pat = args.pattern.trim();
                detail = pat.length > 30 ? `${pat.slice(0, 27)}…` : pat;
            } else if (typeof args.query === 'string' && args.query.trim()) {
                const q = args.query.trim();
                detail = q.length > 30 ? `${q.slice(0, 27)}…` : q;
            }
        } catch { /* partial or non-JSON args — fall back to generic label */ }
    }

    if (!name) {
        return detail ? `Working on ${detail}` : 'Working';
    }
    if (name.includes('grep') || name.includes('search') || name.includes('glob') || name.includes('web_search')) {
        return detail ? `Searching: ${detail}` : 'Searching';
    }
    if (isPureReadToolName(name)) {
        const readDetail = formatReadToolDetailFromArgs(argsJson);
        return readDetail ? `Read ${readDetail}` : 'Read';
    }
    if (name.includes('list') || name.includes('ls')) {
        return detail ? `Reading ${detail}` : 'Reading files';
    }
    if (name.includes('bash') || name.includes('shell') || name.includes('terminal') || name.includes('run_')) {
        return detail ? `Running: ${detail}` : 'Running command';
    }
    if (name.includes('write') || name.includes('edit') || name.includes('patch') || name.includes('replace')) {
        return detail ? `Editing ${detail}` : 'Editing';
    }
    if (name.includes('think')) {
        return 'Thinking';
    }
    return safeToolName.replace(/_/g, ' ');
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
    const content = message.content?.trim() ?? '';
    if (content) {
        texts.push(content);
    }
    for (const segment of message.segments ?? []) {
        if (segment.type === 'text' || segment.type === 'thinking') {
            const segmentText = segment.content?.trim() ?? '';
            if (segmentText) {
                texts.push(segmentText);
            }
        } else if (segment.result?.trim()) {
            texts.push(segment.result);
        } else if (segment.args?.trim()) {
            texts.push(segment.args);
        }
    }
    return texts;
}

export function conversationTurnProgressRatio(current: number, total: number): number {
    if (total <= 0) {
        return 0;
    }
    return Math.min(1, Math.max(0, current / total));
}

function resolveConversationTurnProgress(
    turnMessages: QaapAgentConversationListMetricsInput['messages'],
): Pick<QaapAgentConversationListMetrics, 'turnProgressCurrent' | 'turnProgressTotal'> | undefined {
    const tools: boolean[] = [];
    for (const message of turnMessages) {
        if (message.role !== 'agent') {
            continue;
        }
        for (const segment of message.segments ?? []) {
            if (segment.type === 'tool') {
                tools.push(segment.finished);
            }
        }
    }
    if (tools.length > 0) {
        const finished = tools.filter(done => done).length;
        const hasActive = tools.some(done => !done);
        const total = tools.length;
        const current = Math.min(total, finished + (hasActive ? 1 : 0));
        return { turnProgressCurrent: current, turnProgressTotal: total };
    }
    const lastAgent = [...turnMessages].reverse().find(message => message.role === 'agent');
    if (!lastAgent) {
        return undefined;
    }
    const hasThinking = lastAgent.segments?.some(segment =>
        segment.type === 'thinking' && segment.content.trim().length > 0) ?? false;
    const hasText = lastAgent.segments?.some(segment =>
        segment.type === 'text' && segment.content.trim().length > 0) ?? false;
    let current = 1;
    if (hasText) {
        current = 3;
    } else if (hasThinking) {
        current = 2;
    }
    return {
        turnProgressCurrent: current,
        turnProgressTotal: STREAMING_TURN_FALLBACK_TOTAL,
    };
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
        return formatToolActivityLabel(activeTool.name, activeTool.args);
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
