// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatModel } from '@theia/ai-chat';
import {
    CHAT_CONTEXT_WINDOW_SIZE,
    buildBarTooltip,
    computeSessionTokenUsage,
    formatTokenCount,
    getLatestTokenUsage,
    getUsageColorClass,
} from '@theia/ai-chat-ui/lib/browser/chat-token-usage-indicator-util';
import {
    resolveVpsContextUsageFromSummary,
    type QaapAgentContextUsage,
} from '../common/qaap-agent-context-usage';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import {
    CHAT_VIEW_TOKEN_USAGE_ENABLED,
    CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE,
    CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE_DEFAULT,
} from '@theia/ai-chat-ui/lib/browser/chat-view-preferences';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';

export interface ContextUsageIndicatorOptions {
    readonly enabled: boolean;
    readonly threshold: number;
    /** When true, render an empty ring before the first token report (sticky composer). */
    readonly showWhenEmpty?: boolean;
}

export interface ContextUsageIndicatorState {
    readonly visible: boolean;
    readonly percent: number;
    readonly colorClass: string;
    readonly title: string;
}

export function resolveContextUsageWarningThreshold(readPreference?: (key: string) => unknown): number {
    const percentage = resolveContextUsageWarningThresholdPercentage(readPreference);
    return Math.round((percentage / 100) * CHAT_CONTEXT_WINDOW_SIZE);
}

export function resolveContextUsageWarningThresholdPercentage(readPreference?: (key: string) => unknown): number {
    const raw = readPreference?.(CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE);
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1 || raw > 100) {
        return CHAT_VIEW_TOKEN_USAGE_WARNING_THRESHOLD_PERCENTAGE_DEFAULT;
    }
    return raw;
}

export function isContextUsageIndicatorEnabled(readPreference?: (key: string) => unknown): boolean {
    const raw = readPreference?.(CHAT_VIEW_TOKEN_USAGE_ENABLED);
    return raw !== false;
}

export function resolveContextUsageIndicatorState(
    chatModel: ChatModel | undefined,
    options: ContextUsageIndicatorOptions,
    contextWindowSize: number = CHAT_CONTEXT_WINDOW_SIZE,
): ContextUsageIndicatorState {
    if (!options.enabled) {
        return { visible: false, percent: 0, colorClass: 'token-usage-none', title: '' };
    }
    const totalTokens = computeSessionTokenUsage(chatModel);
    if (totalTokens === 0 && !options.showWhenEmpty) {
        return { visible: false, percent: 0, colorClass: 'token-usage-none', title: '' };
    }
    const percent = Math.min((totalTokens / contextWindowSize) * 100, 100);
    const colorClass = getUsageColorClass(totalTokens, options.threshold, contextWindowSize);
    const tooltip = buildBarTooltip(getLatestTokenUsage(chatModel), totalTokens, options.threshold);
    const title = tooltip?.value
        ? tooltip.value.replace(/\*\*/g, '').replace(/  \n/g, '\n')
        : nls.localize(
            'qaap/chat/contextUsageEmpty',
            'Context window: {0} tokens used (200k assumed until per-model limits ship).',
            totalTokens,
        );
    return { visible: true, percent, colorClass, title };
}

export function buildVpsContextUsageTooltip(
    usage: QaapAgentContextUsage | undefined,
    totalTokens: number,
    contextWindowSize: number,
    threshold: number,
    estimated: boolean,
): string {
    const lines: string[] = [
        nls.localize('theia/ai/chat-ui/tokenUsageLabel', 'Token Usage'),
    ];
    const colorClass = getUsageColorClass(totalTokens, threshold, contextWindowSize);
    if (colorClass === 'token-usage-yellow') {
        lines.push(nls.localize('theia/ai/chat-ui/tokenUsageWarning', 'Token usage warning threshold reached.'));
    } else if (colorClass === 'token-usage-red') {
        lines.push(nls.localize(
            'theia/ai/chat-ui/tokenUsageOverflow',
            'Token usage well past the warning threshold. Consider compacting or starting a new session.',
        ));
    }
    if (usage) {
        lines.push(
            `${nls.localizeByDefault('Input: {0}', formatTokenCount(usage.inputTokens))}`
                + ` | ${nls.localizeByDefault('Output: {0}', formatTokenCount(usage.outputTokens))}`,
        );
        const cacheParts: string[] = [];
        if (usage.cacheReadInputTokens) {
            cacheParts.push(nls.localize(
                'theia/ai/chat-ui/tokenUsageTooltipCacheRead',
                'Cache read: {0}',
                formatTokenCount(usage.cacheReadInputTokens),
            ));
        }
        if (usage.cacheCreationInputTokens) {
            cacheParts.push(nls.localize(
                'theia/ai/chat-ui/tokenUsageTooltipCacheCreate',
                'Cache creation: {0}',
                formatTokenCount(usage.cacheCreationInputTokens),
            ));
        }
        if (cacheParts.length > 0) {
            lines.push(cacheParts.join(' | '));
        }
    } else if (estimated) {
        lines.push(nls.localize(
            'qaap/chat/contextUsageEstimated',
            'Estimated from transcript size until the agent reports usage.',
        ));
    }
    const percentage = Math.round((totalTokens / contextWindowSize) * 100);
    lines.push(nls.localize(
        'theia/ai/chat-ui/tokenUsageTooltipTotal',
        'Total: {0} / {1} ({2}%)',
        formatTokenCount(totalTokens),
        formatTokenCount(contextWindowSize),
        percentage,
    ));
    return lines.join('\n');
}

export function resolveVpsContextUsageIndicatorState(
    summary: QaapAgentConversationSummaryDTO | undefined,
    options: ContextUsageIndicatorOptions & { readonly thresholdPercentBasis?: number },
    full?: QaapAgentConversationDTO,
): ContextUsageIndicatorState {
    if (!options.enabled) {
        return { visible: false, percent: 0, colorClass: 'token-usage-none', title: '' };
    }
    const snapshot = resolveVpsContextUsageFromSummary(summary, full);
    const totalTokens = snapshot.totalTokens;
    if (totalTokens === 0 && !options.showWhenEmpty) {
        return { visible: false, percent: 0, colorClass: 'token-usage-none', title: '' };
    }
    const threshold = options.thresholdPercentBasis
        ? Math.round((options.thresholdPercentBasis / 100) * snapshot.contextWindowSize)
        : options.threshold;
    const percent = Math.min((totalTokens / snapshot.contextWindowSize) * 100, 100);
    const colorClass = getUsageColorClass(totalTokens, threshold, snapshot.contextWindowSize);
    const title = buildVpsContextUsageTooltip(
        snapshot.usage,
        totalTokens,
        snapshot.contextWindowSize,
        threshold,
        snapshot.estimated,
    );
    return { visible: true, percent, colorClass, title };
}

export function createContextUsageIndicatorBadge(): HTMLButtonElement {
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'token-usage-badge qaap-chat-context-usage-indicator theia-mobile-projects-sticky-composer-context-usage-btn';
    const ring = document.createElement('span');
    ring.className = 'token-usage-ring';
    const inner = document.createElement('span');
    inner.className = 'token-usage-ring-inner';
    ring.append(inner);
    badge.append(ring);
    return badge;
}

const CONTEXT_USAGE_COLOR_CLASSES = ['token-usage-none', 'token-usage-yellow', 'token-usage-red'] as const;

export function applyContextUsageIndicatorState(badge: HTMLElement, state: ContextUsageIndicatorState): void {
    badge.hidden = !state.visible;
    if (!state.visible) {
        return;
    }
    badge.classList.add('token-usage-badge', 'qaap-chat-context-usage-indicator');
    for (const colorClass of CONTEXT_USAGE_COLOR_CLASSES) {
        badge.classList.toggle(colorClass, colorClass === state.colorClass);
    }
    badge.title = state.title;
    badge.setAttribute('aria-label', state.title);
    const ring = badge.querySelector<HTMLElement>('.token-usage-ring');
    if (ring) {
        ring.style.background = `conic-gradient(var(--token-usage-fill) ${state.percent}%, var(--token-usage-track) ${state.percent}%)`;
    }
}

export function bindContextUsageIndicator(
    badge: HTMLElement,
    refreshState: () => ContextUsageIndicatorState,
    subscribe?: (onRefresh: () => void) => Disposable,
): Disposable {
    const update = (): void => {
        applyContextUsageIndicatorState(badge, refreshState());
    };
    update();
    const subscription = subscribe?.(update) ?? Disposable.NULL;
    return Disposable.create(() => {
        subscription.dispose();
    });
}

export function bindContextUsageIndicatorToChatModel(
    badge: HTMLElement,
    resolveModel: () => ChatModel | undefined,
    options: ContextUsageIndicatorOptions,
): Disposable {
    const modelDisposables = new DisposableCollection();
    let subscribedModelId: string | undefined;
    return bindContextUsageIndicator(
        badge,
        () => resolveContextUsageIndicatorState(resolveModel(), options),
        onRefresh => {
            const refresh = (): void => {
                const model = resolveModel();
                if (model?.id === subscribedModelId) {
                    onRefresh();
                    return;
                }
                subscribedModelId = model?.id;
                modelDisposables.dispose();
                if (model) {
                    modelDisposables.push(model.onDidChange(() => {
                        onRefresh();
                    }));
                }
                onRefresh();
            };
            refresh();
            return Disposable.create(() => {
                modelDisposables.dispose();
            });
        },
    );
}
