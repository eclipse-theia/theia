// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ChatModel, ResponseTokenUsage } from '@theia/ai-chat';
import { nls } from '@theia/core/lib/common/nls';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

/**
 * Provisional context window size used as the denominator for the indicator bar
 * fill and the tooltip's "Total: X / Y" display until per-model context sizes
 * are available. See issue #17323 comments for context.
 */
export const CHAT_CONTEXT_WINDOW_SIZE = 200000;

export type TokenUsageWarningDecision = 'notify' | 'reset' | 'skip';

/** Returns true when the given total has crossed (>=) the configured warning threshold. */
export function isAboveTokenUsageWarningThreshold(totalTokens: number, threshold: number): boolean {
    return totalTokens > 0 && totalTokens >= threshold;
}

/**
 * Pure decision function for whether to show the token usage warning for a session.
 * Callers are expected to short-circuit before invoking this when the warning feature
 * is disabled, so this helper is not concerned with the enabled state.
 * - `reset`: usage is below the threshold; any prior "already notified" state for this session should be cleared.
 * - `skip`:  we already notified for this session while still above the threshold.
 * - `notify`: warning should be shown now and the session marked as notified.
 */
export function decideTokenUsageWarning(args: {
    totalTokens: number;
    threshold: number;
    alreadyNotified: boolean;
}): TokenUsageWarningDecision {
    if (!isAboveTokenUsageWarningThreshold(args.totalTokens, args.threshold)) {
        return 'reset';
    }
    if (args.alreadyNotified) {
        return 'skip';
    }
    return 'notify';
}

export function formatTokenCount(count: number | undefined): string {
    if (count === undefined || count === 0) {
        return '-';
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
}

/**
 * Returns the CSS class for the token usage indicator based on the current
 * total, the configured warning threshold, and the assumed context window size.
 * Yellow band: [threshold, contextWindowSize). Red band: [contextWindowSize, ∞).
 */
export function getUsageColorClass(totalTokens: number, threshold: number, contextWindowSize: number = CHAT_CONTEXT_WINDOW_SIZE): string {
    if (totalTokens === 0) {
        return 'token-usage-none';
    }
    if (totalTokens < threshold) {
        return 'token-usage-green';
    }
    if (totalTokens < contextWindowSize) {
        return 'token-usage-yellow';
    }
    return 'token-usage-red';
}

export function computeSessionTokenUsage(chatModel?: ChatModel): number {
    if (!chatModel) {
        return 0;
    }
    const requests = chatModel.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
        const usage: ResponseTokenUsage | undefined = requests[i].response.tokenUsage;
        if (usage) {
            return usage.inputTokens
                + usage.outputTokens
                + (usage.cacheCreationInputTokens ?? 0)
                + (usage.cacheReadInputTokens ?? 0);
        }
    }
    return 0;
}

export function getLatestTokenUsage(chatModel?: ChatModel): ResponseTokenUsage | undefined {
    if (!chatModel) {
        return undefined;
    }
    const requests = chatModel.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
        const usage = requests[i].response.tokenUsage;
        if (usage) {
            return usage;
        }
    }
    return undefined;
}

export function buildBarTooltip(usage: ResponseTokenUsage | undefined, totalTokens: number, threshold: number): MarkdownString | undefined {
    if (!usage) {
        return undefined;
    }
    const lines: string[] = [
        `**${nls.localize('theia/ai/chat-ui/tokenUsageLabel', 'Token Usage')}**`
    ];
    const colorClass = getUsageColorClass(totalTokens, threshold);
    if (colorClass === 'token-usage-yellow') {
        lines.push(`⚠ ${nls.localize('theia/ai/chat-ui/tokenUsageWarning', 'Token usage warning threshold reached.')}`, '');
    } else if (colorClass === 'token-usage-red') {
        lines.push(`⚠ ${nls.localize('theia/ai/chat-ui/tokenUsageOverflow', 'Token usage well past the warning threshold. Consider compacting or starting a new session.')}`, '');
    }
    lines.push(`${nls.localizeByDefault('Input: {0}',
        formatTokenCount(usage.inputTokens))} | ${nls.localizeByDefault('Output: {0}',
            formatTokenCount(usage.outputTokens))}`);
    const cacheParts: string[] = [];
    if (usage.cacheReadInputTokens) {
        cacheParts.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipCacheRead', 'Cache read: {0}', formatTokenCount(usage.cacheReadInputTokens)));
    }
    if (usage.cacheCreationInputTokens) {
        cacheParts.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipCacheCreate', 'Cache creation: {0}', formatTokenCount(usage.cacheCreationInputTokens)));
    }
    if (cacheParts.length > 0) {
        lines.push(cacheParts.join(' | '));
    }
    const percentage = Math.round((totalTokens / CHAT_CONTEXT_WINDOW_SIZE) * 100);
    lines.push(nls.localize(
        'theia/ai/chat-ui/tokenUsageTooltipTotal',
        'Total: {0} / {1} ({2}%)',
        formatTokenCount(totalTokens),
        formatTokenCount(CHAT_CONTEXT_WINDOW_SIZE),
        percentage
    ));
    return { value: lines.join('  \n') };
}
