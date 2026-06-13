// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { Anthropic } from '@anthropic-ai/sdk';

type NonThinkingParam = Exclude<Anthropic.Messages.ContentBlockParam, Anthropic.Messages.ThinkingBlockParam | Anthropic.Messages.RedactedThinkingBlockParam>;

function isNonThinkingParam(
    content: Anthropic.Messages.ContentBlockParam
): content is NonThinkingParam {
    return content.type !== 'thinking' && content.type !== 'redacted_thinking';
}

/**
 * Adds ephemeral `cache_control` breakpoints to enable rolling cache reuse across turns:
 *  - A "write" breakpoint on the last message — caches the full conversation for the next turn.
 *  - A "read" breakpoint on the previous user message — hits the cache written by the previous turn,
 *    so history is processed as an incremental delta instead of being re-encoded each request.
 *
 * Combined with the system + last-tool breakpoints applied elsewhere, this stays within Anthropic's
 * 4-breakpoint limit. The original messages array is never mutated.
 */
export function addCacheControlToLastMessage(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
    if (messages.length === 0) {
        return messages;
    }

    const withWrite = applyCacheControlToMessageAt(messages, messages.length - 1);
    if (withWrite === messages) {
        return messages;
    }

    for (let i = messages.length - 2; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const withRead = applyCacheControlToMessageAt(withWrite, i);
            return withRead;
        }
    }

    return withWrite;
}

function applyCacheControlToMessageAt(
    messages: Anthropic.Messages.MessageParam[],
    index: number
): Anthropic.Messages.MessageParam[] {
    const target = messages[index];
    if (!target) {
        return messages;
    }
    if (typeof target.content === 'string') {
        const cachedContent: NonThinkingParam = {
            type: 'text',
            text: target.content,
            cache_control: { type: 'ephemeral' }
        };
        const next = [...messages];
        next[index] = { ...target, content: [cachedContent] };
        return next;
    }
    if (Array.isArray(target.content)) {
        const updatedContent = [...target.content];
        for (let i = updatedContent.length - 1; i >= 0; i--) {
            if (isNonThinkingParam(updatedContent[i])) {
                updatedContent[i] = {
                    ...updatedContent[i],
                    cache_control: { type: 'ephemeral' }
                } as NonThinkingParam;
                const next = [...messages];
                next[index] = { ...target, content: updatedContent };
                return next;
            }
        }
    }
    return messages;
}

export const DEFAULT_HISTORY_TURN_LIMIT = 50;

/**
 * Drops the oldest conversation turns once the history exceeds `maxTurns` human turns,
 * keeping the most recent `maxTurns` turns. A "turn" boundary is a user message that does
 * not consist solely of `tool_result` blocks (i.e. a real human input, not a tool round-trip),
 * so the cut never splits a `tool_use`/`tool_result` pair — which Anthropic rejects.
 *
 * The original messages array is not mutated.
 */
export function pruneOldHistoryTurns(
    messages: Anthropic.Messages.MessageParam[],
    maxTurns: number = DEFAULT_HISTORY_TURN_LIMIT
): Anthropic.Messages.MessageParam[] {
    if (messages.length === 0 || maxTurns <= 0) {
        return messages;
    }
    const humanTurnIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.role !== 'user') {
            continue;
        }
        const isHumanTurn = typeof m.content === 'string'
            || !m.content.some((block: Anthropic.Messages.ContentBlockParam) => block.type === 'tool_result');
        if (isHumanTurn) {
            humanTurnIndices.push(i);
        }
    }
    if (humanTurnIndices.length <= maxTurns) {
        return messages;
    }
    const cutAt = humanTurnIndices[humanTurnIndices.length - maxTurns];
    return messages.slice(cutAt);
}
