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

export const CHAT_CONTEXT_WINDOW_SIZE = 200000;
const CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD = 0.9 * CHAT_CONTEXT_WINDOW_SIZE;

export function formatTokenCount(count: number | undefined): string {
    if (count === undefined || count === 0) {
        return '-';
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
}

export function getUsageColorClass(totalTokens: number): string {
    if (totalTokens === 0) {
        return 'token-usage-none';
    }
    if (totalTokens < CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD) {
        return 'token-usage-green';
    }
    if (totalTokens < CHAT_CONTEXT_WINDOW_SIZE) {
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

export function buildBarTooltip(usage: ResponseTokenUsage | undefined, totalTokens: number): MarkdownString | undefined {
    if (!usage) {
        return undefined;
    }
    const lines: string[] = [
        `**${nls.localize('theia/ai/chat-ui/tokenUsageLabel', 'Token Usage')}**`
    ];
    const colorClass = getUsageColorClass(totalTokens);
    if (colorClass === 'token-usage-yellow') {
        lines.push(`⚠ ${nls.localize('theia/ai/chat-ui/tokenUsageWarning', 'Approaching context window limit.')}`, '');
    } else if (colorClass === 'token-usage-red') {
        lines.push(`⚠ ${nls.localize('theia/ai/chat-ui/tokenUsageOverflow', 'Context window limit reached. Consider starting a new session.')}`, '');
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
    const pct = Math.round((totalTokens / CHAT_CONTEXT_WINDOW_SIZE) * 100);
    lines.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipTotal', 'Total: {0} / {1} ({2}%)', formatTokenCount(totalTokens), formatTokenCount(CHAT_CONTEXT_WINDOW_SIZE), pct));
    return { value: lines.join('  \n') };
}

