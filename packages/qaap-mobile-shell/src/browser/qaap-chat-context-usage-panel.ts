// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatModel } from '@theia/ai-chat';
import {
    CHAT_CONTEXT_WINDOW_SIZE,
    formatTokenCount,
    getLatestTokenUsage,
} from '@theia/ai-chat-ui/lib/browser/chat-token-usage-indicator-util';
import { nls } from '@theia/core/lib/common/nls';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import {
    resolveVpsContextUsageFromSummary,
    type QaapAgentContextUsage,
} from '../common/qaap-agent-context-usage';

import {
    scheduleStickyComposerPopoverPosition,
    wireStickyComposerPopoverDismiss,
} from './qaap-sticky-composer-popover';

export interface ContextUsageBreakdownCategory {
    readonly id: string;
    readonly label: string;
    readonly tokens: number;
    readonly toneClass: string;
}

export interface ContextUsageBreakdownView {
    readonly totalTokens: number;
    readonly contextWindowSize: number;
    readonly percent: number;
    readonly estimated: boolean;
    readonly empty: boolean;
    readonly categories: readonly ContextUsageBreakdownCategory[];
}

const CATEGORY_TONES = {
    input: 'theia-mod-input',
    output: 'theia-mod-output',
    cacheRead: 'theia-mod-cache-read',
    cacheWrite: 'theia-mod-cache-write',
    estimated: 'theia-mod-estimated',
} as const;

function buildUsageCategories(
    usage: QaapAgentContextUsage | undefined,
    estimated: boolean,
    totalTokens: number,
): readonly ContextUsageBreakdownCategory[] {
    if (usage) {
        const categories: ContextUsageBreakdownCategory[] = [];
        if (usage.inputTokens > 0) {
            categories.push({
                id: 'input',
                label: nls.localizeByDefault('Input'),
                tokens: usage.inputTokens,
                toneClass: CATEGORY_TONES.input,
            });
        }
        if (usage.outputTokens > 0) {
            categories.push({
                id: 'output',
                label: nls.localizeByDefault('Output'),
                tokens: usage.outputTokens,
                toneClass: CATEGORY_TONES.output,
            });
        }
        if (usage.cacheReadInputTokens && usage.cacheReadInputTokens > 0) {
            categories.push({
                id: 'cache-read',
                label: nls.localize('qaap/chat/contextUsageCategoryCacheRead', 'Cache read'),
                tokens: usage.cacheReadInputTokens,
                toneClass: CATEGORY_TONES.cacheRead,
            });
        }
        if (usage.cacheCreationInputTokens && usage.cacheCreationInputTokens > 0) {
            categories.push({
                id: 'cache-write',
                label: nls.localize('qaap/chat/contextUsageCategoryCacheWrite', 'Cache write'),
                tokens: usage.cacheCreationInputTokens,
                toneClass: CATEGORY_TONES.cacheWrite,
            });
        }
        if (categories.length > 0) {
            return categories;
        }
    }
    if (estimated && totalTokens > 0) {
        return [{
            id: 'estimated',
            label: nls.localize('qaap/chat/contextUsageCategoryConversation', 'Conversation (estimated)'),
            tokens: totalTokens,
            toneClass: CATEGORY_TONES.estimated,
        }];
    }
    return [];
}

export function resolveChatModelContextUsageBreakdown(
    chatModel: ChatModel | undefined,
    contextWindowSize: number = CHAT_CONTEXT_WINDOW_SIZE,
): ContextUsageBreakdownView {
    const usage = getLatestTokenUsage(chatModel);
    const qaapUsage = usage ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        ...(usage.cacheReadInputTokens ? { cacheReadInputTokens: usage.cacheReadInputTokens } : {}),
        ...(usage.cacheCreationInputTokens ? { cacheCreationInputTokens: usage.cacheCreationInputTokens } : {}),
    } satisfies QaapAgentContextUsage : undefined;
    const totalTokens = qaapUsage
        ? qaapUsage.inputTokens
            + qaapUsage.outputTokens
            + (qaapUsage.cacheReadInputTokens ?? 0)
            + (qaapUsage.cacheCreationInputTokens ?? 0)
        : 0;
    const categories = buildUsageCategories(qaapUsage, false, totalTokens);
    const percent = Math.min((totalTokens / contextWindowSize) * 100, 100);
    return {
        totalTokens,
        contextWindowSize,
        percent,
        estimated: false,
        empty: totalTokens === 0,
        categories,
    };
}

export function resolveVpsContextUsageBreakdown(
    summary: QaapAgentConversationSummaryDTO | undefined,
    full?: QaapAgentConversationDTO,
): ContextUsageBreakdownView {
    const snapshot = resolveVpsContextUsageFromSummary(summary, full);
    const categories = buildUsageCategories(snapshot.usage, snapshot.estimated, snapshot.totalTokens);
    const percent = Math.min((snapshot.totalTokens / snapshot.contextWindowSize) * 100, 100);
    return {
        totalTokens: snapshot.totalTokens,
        contextWindowSize: snapshot.contextWindowSize,
        percent,
        estimated: snapshot.estimated,
        empty: snapshot.totalTokens === 0,
        categories,
    };
}

function formatPanelTokenCount(count: number, estimated: boolean): string {
    if (count === 0) {
        return '-';
    }
    const formatted = formatTokenCount(count);
    return estimated && formatted !== '-' ? `~${formatted}` : formatted;
}

function createContextUsagePanel(
    view: ContextUsageBreakdownView,
    onClose: () => void,
): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'theia-mobile-sticky-composer-sheet-panel qaap-chat-context-usage-sheet-panel';

    const header = document.createElement('header');
    header.className = 'theia-mobile-sticky-composer-sheet-header';

    const title = document.createElement('h2');
    title.textContent = nls.localize('qaap/chat/contextUsagePanelTitle', 'Context Usage');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
    closeBtn.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
    closeBtn.setAttribute('aria-label', closeBtn.title);
    closeBtn.addEventListener('click', () => onClose());

    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'qaap-chat-context-usage-sheet-body';

    const summary = document.createElement('div');
    summary.className = 'qaap-chat-context-usage-panel-summary';

    const percentLabel = document.createElement('span');
    percentLabel.className = 'qaap-chat-context-usage-panel-percent';
    percentLabel.textContent = view.empty
        ? nls.localize('qaap/chat/contextUsagePanelEmpty', 'No usage yet')
        : nls.localize('qaap/chat/contextUsagePanelPercentFull', '{0}% Full', Math.round(view.percent));

    const totalLabel = document.createElement('span');
    totalLabel.className = 'qaap-chat-context-usage-panel-total';
    totalLabel.textContent = nls.localize(
        'qaap/chat/contextUsagePanelTotalTokens',
        '{0} / {1} Tokens',
        formatPanelTokenCount(view.totalTokens, view.estimated),
        formatTokenCount(view.contextWindowSize),
    );
    summary.append(percentLabel, totalLabel);

    const bar = document.createElement('div');
    bar.className = 'qaap-chat-context-usage-panel-bar';
    bar.setAttribute('role', 'presentation');
    if (!view.empty && view.categories.length > 0) {
        for (const category of view.categories) {
            const segment = document.createElement('span');
            segment.className = `qaap-chat-context-usage-panel-bar-segment ${category.toneClass}`;
            segment.style.width = `${Math.max(0, (category.tokens / view.contextWindowSize) * 100)}%`;
            bar.append(segment);
        }
    } else {
        const track = document.createElement('span');
        track.className = 'qaap-chat-context-usage-panel-bar-track';
        bar.append(track);
    }

    const list = document.createElement('ul');
    list.className = 'qaap-chat-context-usage-panel-list';

    if (view.categories.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'qaap-chat-context-usage-panel-empty';
        empty.textContent = nls.localize(
            'qaap/chat/contextUsagePanelEmptyHint',
            'Usage appears here once the agent reports tokens or the transcript is estimated.',
        );
        list.append(empty);
    } else {
        for (const category of view.categories) {
            const row = document.createElement('li');
            row.className = 'qaap-chat-context-usage-panel-row';

            const swatch = document.createElement('span');
            swatch.className = `qaap-chat-context-usage-panel-swatch ${category.toneClass}`;
            swatch.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'qaap-chat-context-usage-panel-label';
            label.textContent = category.label;

            const count = document.createElement('span');
            count.className = 'qaap-chat-context-usage-panel-count';
            count.textContent = formatPanelTokenCount(category.tokens, view.estimated && category.id === 'estimated');

            row.append(swatch, label, count);
            list.append(row);
        }
    }

    body.append(summary, bar, list);
    if (view.estimated) {
        const note = document.createElement('p');
        note.className = 'qaap-chat-context-usage-panel-note';
        note.textContent = nls.localize(
            'qaap/chat/contextUsageEstimated',
            'Estimated from transcript size until the agent reports usage.',
        );
        body.append(note);
    }

    panel.append(header, body);
    return panel;
}

export function positionContextUsagePopover(popover: HTMLElement, anchor: HTMLElement): void {
    scheduleStickyComposerPopoverPosition(popover, anchor, 'end');
}

export function wireContextUsagePopoverDismiss(
    popover: HTMLElement,
    anchor: HTMLElement,
    onClose: () => void,
): () => void {
    return wireStickyComposerPopoverDismiss(popover, anchor, onClose, 'end');
}

export function renderContextUsagePopover(
    view: ContextUsageBreakdownView,
    options: {
        readonly transcriptOverlay?: boolean;
        readonly onClose: () => void;
    },
): HTMLElement {
    const popover = document.createElement('div');
    popover.className = options.transcriptOverlay
        ? 'qaap-sticky-composer-sheet-popover theia-mod-context-usage theia-mod-transcript-overlay'
        : 'qaap-sticky-composer-sheet-popover theia-mod-context-usage';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', nls.localize('qaap/chat/contextUsagePanelTitle', 'Context Usage'));
    popover.append(createContextUsagePanel(view, options.onClose));
    return popover;
}

export function renderContextUsageSheet(
    view: ContextUsageBreakdownView,
    options: {
        readonly transcriptOverlay?: boolean;
        readonly onClose: () => void;
    },
): HTMLElement {
    const sheet = document.createElement('div');
    sheet.className = options.transcriptOverlay
        ? 'theia-mobile-sticky-composer-sheet theia-mod-context-usage theia-mod-transcript-overlay'
        : 'theia-mobile-sticky-composer-sheet theia-mod-context-usage';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');

    const backdrop = document.createElement('div');
    backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
    backdrop.addEventListener('click', () => options.onClose());

    sheet.append(backdrop, createContextUsagePanel(view, options.onClose));
    return sheet;
}
