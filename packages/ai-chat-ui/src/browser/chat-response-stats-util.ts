// *****************************************************************************
// Copyright (C) 2026 Ericsson.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatRequestModel, ChatResponseModel } from '@theia/ai-chat';

/** Average number of characters per token used when the model does not report exact token counts. */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export interface ResponseStats {
    /** End-to-end response time in milliseconds, if timing information is available. */
    responseTimeMs?: number;
    /**
     * Number of input (prompt) tokens. When {@link inputEstimated} is `false` this is the exact,
     * provider-reported count and includes the full prompt sent to the model (system prompt,
     * skills, tools and conversation history). When estimated, it is derived only from the visible
     * request text and therefore undercounts the real prompt.
     */
    inputTokens: number;
    inputEstimated: boolean;
    /** Number of output (completion) tokens. Estimated from the response text when not reported. */
    outputTokens: number;
    outputEstimated: boolean;
    /** Output tokens per second, if a positive response time is available. */
    tokensPerSecond?: number;
}

/** Estimates the number of tokens for a piece of text using the {@link CHARS_PER_TOKEN_ESTIMATE} heuristic. */
export function estimateTokens(text: string | undefined): number {
    if (!text) {
        return 0;
    }
    return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * Computes display statistics for a completed chat response: response time, input/output token
 * counts (exact when reported by the provider, otherwise estimated at ~4 chars/token) and the
 * output token throughput (tokens/second).
 *
 * Note on input tokens: when the provider reports usage, the input count already accounts for the
 * system prompt, active skills, tool definitions and history. The char-based estimate only covers
 * the user's visible request text and is therefore a lower bound.
 */
export function computeResponseStats(response: ChatResponseModel, request?: ChatRequestModel): ResponseStats {
    const usage = response.tokenUsage;

    let responseTimeMs: number | undefined;
    if (response.requestStartTime !== undefined && response.completionTime !== undefined) {
        const delta = response.completionTime - response.requestStartTime;
        if (delta >= 0) {
            responseTimeMs = delta;
        }
    }

    let inputTokens: number;
    let inputEstimated: boolean;
    if (usage && usage.inputTokens > 0) {
        inputTokens = usage.inputTokens
            + (usage.cacheCreationInputTokens ?? 0)
            + (usage.cacheReadInputTokens ?? 0);
        inputEstimated = false;
    } else {
        inputTokens = estimateTokens(request?.message.request.text);
        inputEstimated = true;
    }

    let outputTokens: number;
    let outputEstimated: boolean;
    if (usage && usage.outputTokens > 0) {
        outputTokens = usage.outputTokens;
        outputEstimated = false;
    } else {
        outputTokens = estimateTokens(response.response.asDisplayString());
        outputEstimated = true;
    }

    let tokensPerSecond: number | undefined;
    if (responseTimeMs !== undefined && responseTimeMs > 0 && outputTokens > 0) {
        tokensPerSecond = outputTokens / (responseTimeMs / 1000);
    }

    return { responseTimeMs, inputTokens, inputEstimated, outputTokens, outputEstimated, tokensPerSecond };
}

/** Formats a duration given in milliseconds as a compact human-readable string (e.g. `850ms`, `3.4s`). */
export function formatResponseTime(ms: number | undefined): string {
    if (ms === undefined) {
        return '-';
    }
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(1)}s`;
}

/** Formats a token count with a `~` prefix when the value is an estimate. */
export function formatStatTokens(count: number, estimated: boolean): string {
    const formatted = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toString();
    return estimated ? `~${formatted}` : formatted;
}

/** Formats a tokens-per-second throughput value. */
export function formatTokensPerSecond(tokensPerSecond: number | undefined): string {
    if (tokensPerSecond === undefined) {
        return '-';
    }
    if (tokensPerSecond >= 100) {
        return `${Math.round(tokensPerSecond)} tok/s`;
    }
    return `${tokensPerSecond.toFixed(1)} tok/s`;
}
