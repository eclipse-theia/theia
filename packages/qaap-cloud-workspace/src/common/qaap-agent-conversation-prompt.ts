// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    DEFAULT_QAAP_CONTEXT_WINDOW,
    estimateConversationTokensFromMessages,
    resolveConversationContextWindowSize,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-context-usage';
import type { QaapAgentMessage } from './qaap-agent-conversation';

/** Start compressing older turns once the estimated prompt exceeds this share of the context window. */
export const VPS_PROMPT_COMPRESS_THRESHOLD_RATIO = 0.55;
/** Full verbatim user+agent pairs kept at the tail of the transcript. */
export const VPS_PROMPT_KEEP_RECENT_TURN_PAIRS = 2;
/** Max chars per compressed historical message body. */
export const VPS_PROMPT_COMPRESSED_MESSAGE_MAX_CHARS = 480;

export interface BuildConversationAgentPromptOptions {
    readonly history: ReadonlyArray<QaapAgentMessage>;
    readonly latestUserContent: string;
    readonly contextPreamble?: string;
    readonly contextWindowSize?: number;
}

function compressMessageBody(message: QaapAgentMessage, maxChars: number): string {
    let text = message.content.trim();
    if (!text && message.segments?.length) {
        const parts: string[] = [];
        for (const segment of message.segments) {
            if (segment.type === 'text' && segment.content.trim()) {
                parts.push(segment.content.trim());
            } else if (segment.type === 'thinking' && segment.content.trim()) {
                parts.push(`[thinking] ${segment.content.trim()}`);
            } else if (segment.type === 'tool') {
                const summary = segment.result?.trim()
                    ? `${segment.name} → ${segment.result.trim().slice(0, 120)}`
                    : segment.name;
                parts.push(`[tool] ${summary}`);
            }
        }
        text = parts.join(' ');
    }
    if (text.length <= maxChars) {
        return text;
    }
    return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Split history into compressed prefix + verbatim suffix (last N turn pairs). */
export function partitionConversationHistory(
    history: ReadonlyArray<QaapAgentMessage>,
    keepRecentTurnPairs = VPS_PROMPT_KEEP_RECENT_TURN_PAIRS,
): { readonly compressed: QaapAgentMessage[]; readonly recent: QaapAgentMessage[] } {
    if (history.length === 0 || keepRecentTurnPairs <= 0) {
        return { compressed: [...history], recent: [] };
    }
    let pairs = 0;
    let splitIndex = history.length;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') {
            pairs += 1;
            if (pairs >= keepRecentTurnPairs) {
                splitIndex = i;
                break;
            }
        }
    }
    if (splitIndex <= 0 || splitIndex >= history.length) {
        return { compressed: [], recent: [...history] };
    }
    return {
        compressed: history.slice(0, splitIndex),
        recent: history.slice(splitIndex),
    };
}

export function shouldCompressConversationPrompt(
    messages: ReadonlyArray<QaapAgentMessage>,
    contextPreamble: string | undefined,
    contextWindowSize: number | undefined,
    thresholdRatio = VPS_PROMPT_COMPRESS_THRESHOLD_RATIO,
): boolean {
    const window = resolveConversationContextWindowSize(contextWindowSize);
    const estimated = estimateConversationTokensFromMessages(messages, contextPreamble);
    return estimated > Math.floor(window * thresholdRatio);
}

function formatTranscriptLines(messages: ReadonlyArray<QaapAgentMessage>, compressOlder: boolean): string[] {
    const lines: string[] = [];
    for (const message of messages) {
        const role = message.role === 'user' ? 'USER' : 'ASSISTANT';
        const body = compressOlder
            ? compressMessageBody(message, VPS_PROMPT_COMPRESSED_MESSAGE_MAX_CHARS)
            : message.content.trim() || compressMessageBody(message, VPS_PROMPT_COMPRESSED_MESSAGE_MAX_CHARS);
        if (!body) {
            continue;
        }
        lines.push(`${role}: ${body}`);
        lines.push('');
    }
    return lines;
}

/**
 * Build the multi-turn agent prompt. Compresses older turns when the estimated token load
 * exceeds {@link VPS_PROMPT_COMPRESS_THRESHOLD_RATIO} of the context window.
 */
export function buildConversationAgentPrompt(options: BuildConversationAgentPromptOptions): string {
    const { history, latestUserContent, contextPreamble, contextWindowSize } = options;
    if (history.length === 0) {
        return latestUserContent;
    }

    const allMessages = history.concat({
        id: 'pending-user',
        role: 'user',
        content: latestUserContent,
        createdAt: 0,
    });
    const compress = shouldCompressConversationPrompt(allMessages, contextPreamble, contextWindowSize);
    const { compressed, recent } = compress
        ? partitionConversationHistory(history)
        : { compressed: [], recent: [...history] };

    const lines: string[] = ['You are continuing an ongoing conversation.'];
    if (compress && compressed.length > 0) {
        lines.push('Earlier context (compressed):', '');
        lines.push(...formatTranscriptLines(compressed, true));
    }
    if (compress && recent.length > 0) {
        lines.push('Recent transcript:', '');
        lines.push(...formatTranscriptLines(recent, false));
    } else if (!compress) {
        lines.push('The transcript so far:', '');
        lines.push(...formatTranscriptLines(history, false));
    }
    lines.push('Now respond to the latest user message:', '');
    lines.push(`USER: ${latestUserContent}`);
    return lines.join('\n');
}

export function resolveConversationPromptContextWindow(contextWindowSize: number | undefined): number {
    return resolveConversationContextWindowSize(contextWindowSize ?? DEFAULT_QAAP_CONTEXT_WINDOW);
}
