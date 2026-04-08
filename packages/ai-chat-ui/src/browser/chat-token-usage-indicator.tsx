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

import { ReactWidget } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ChatModel, ResponseTokenUsage } from '@theia/ai-chat';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { CHAT_VIEW_TOKEN_USAGE_ENABLED } from './chat-view-preferences';

const CHAT_CONTEXT_WINDOW_SIZE = 200000;
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

export interface ChatTokenUsageIndicatorProps {
    chatModel?: ChatModel;
    totalTokens?: number;
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

function buildBarTooltip(usage: ResponseTokenUsage | undefined, totalTokens: number): string {
    if (!usage) {
        return '';
    }
    const parts: string[] = [
        nls.localizeByDefault('Input: {0}', formatTokenCount(usage.inputTokens)),
        nls.localizeByDefault('Output: {0}', formatTokenCount(usage.outputTokens)),
    ];
    if (usage.cacheReadInputTokens) {
        parts.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipCacheRead', 'Cache read: {0}', formatTokenCount(usage.cacheReadInputTokens)));
    }
    if (usage.cacheCreationInputTokens) {
        parts.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipCacheCreate', 'Cache creation: {0}', formatTokenCount(usage.cacheCreationInputTokens)));
    }
    parts.push(nls.localize('theia/ai/chat-ui/tokenUsageTooltipTotal', 'Total: {0} / {1}', formatTokenCount(totalTokens), formatTokenCount(CHAT_CONTEXT_WINDOW_SIZE)));
    return parts.join('\n');
}

export const ChatTokenUsageIndicator: React.FC<ChatTokenUsageIndicatorProps> = ({ chatModel, totalTokens: totalTokensProp }) => {
    const totalTokens = totalTokensProp ?? computeSessionTokenUsage(chatModel);
    if (totalTokens === 0) {
        return <React.Fragment />;
    }

    const colorClass = getUsageColorClass(totalTokens);
    const pct = Math.min((totalTokens / CHAT_CONTEXT_WINDOW_SIZE) * 100, 100);
    const usage = getLatestTokenUsage(chatModel);
    const tooltip = buildBarTooltip(usage, totalTokens);

    return (
        <div className='chat-token-usage-indicator' title={tooltip}>
            <div className='token-usage-bar-container'>
                <div
                    className={`token-usage-bar ${colorClass}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className='token-usage-label'>
                {formatTokenCount(totalTokens)} / {formatTokenCount(CHAT_CONTEXT_WINDOW_SIZE)}
            </span>
        </div>
    );
};

@injectable()
export class ChatTokenUsageIndicatorWidget extends ReactWidget {
    static readonly ID = 'chat-token-usage-indicator-widget';

    @inject(PreferenceService) @optional()
    protected readonly preferenceService: PreferenceService | undefined;

    protected chatModel: ChatModel | undefined;
    protected modelListener: Disposable | undefined;
    protected preferenceListener: Disposable | undefined;

    constructor() {
        super();
        this.id = ChatTokenUsageIndicatorWidget.ID;
        this.addClass('chat-token-usage-indicator-widget');
    }

    @postConstruct()
    protected init(): void {
        this.preferenceListener = this.preferenceService?.onPreferenceChanged(change => {
            if (change.preferenceName === CHAT_VIEW_TOKEN_USAGE_ENABLED) {
                this.update();
            }
        });
        if (this.preferenceListener) {
            this.toDispose.push(this.preferenceListener);
        }
    }

    protected isEnabled(): boolean {
        return this.preferenceService?.get<boolean>(CHAT_VIEW_TOKEN_USAGE_ENABLED, false) ?? false;
    }

    setChatModel(model: ChatModel): void {
        if (this.chatModel === model) {
            return;
        }
        this.modelListener?.dispose();
        this.chatModel = model;
        this.modelListener = model.onDidChange(() => this.update());
        this.update();
    }

    override dispose(): void {
        this.modelListener?.dispose();
        super.dispose();
    }

    protected render(): React.ReactNode {
        const enabled = this.isEnabled();
        const totalTokens = enabled ? computeSessionTokenUsage(this.chatModel) : 0;
        const hasTokens = totalTokens > 0;
        this.node.style.display = (enabled && hasTokens) ? '' : 'none';
        if (!enabled) {
            return undefined;
        }
        return React.createElement(ChatTokenUsageIndicator, {
            chatModel: this.chatModel,
            totalTokens
        });
    }
}
