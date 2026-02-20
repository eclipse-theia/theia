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

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { TokenUsageServiceClient } from '@theia/ai-core/lib/common/protocol';

const CHAT_TOKEN_BUDGET = 200000;
const CHAT_TOKEN_THRESHOLD = 180000;

export interface ChatTokenUsageIndicatorProps {
    sessionId: string;
    tokenUsageClient: TokenUsageServiceClient;
}

export function formatTokenCount(count: number | undefined): string {
    if (count === undefined || count === 0) {
        return '-';
    }
    if (count >= 1000) {
        return `${Math.round(count / 1000)}k`;
    }
    return `${count}`;
}

export function getUsageColorClass(totalTokens: number | undefined): string {
    if (totalTokens === undefined) {
        return 'token-usage-none';
    }
    if (totalTokens === 0) {
        return 'token-usage-none';
    }
    if (totalTokens < CHAT_TOKEN_THRESHOLD) {
        return 'token-usage-green';
    }
    if (totalTokens < CHAT_TOKEN_BUDGET) {
        return 'token-usage-yellow';
    }
    return 'token-usage-red';
}

@injectable()
export class ChatTokenUsageIndicatorWidget extends ReactWidget {
    static readonly ID = 'chat-token-usage-indicator-widget';

    @inject(TokenUsageServiceClient)
    protected readonly tokenUsageClient: TokenUsageServiceClient;

    protected sessionId: string = '';

    @postConstruct()
    protected init(): void {
        this.id = ChatTokenUsageIndicatorWidget.ID;
        this.title.closable = false;
        this.node.classList.add('chat-token-usage-container');
        this.update();
    }

    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
        this.update();
    }

    protected render(): React.ReactNode {
        return React.createElement(ChatTokenUsageIndicator, {
            sessionId: this.sessionId,
            tokenUsageClient: this.tokenUsageClient
        });
    }
}

export const ChatTokenUsageIndicator: React.FC<ChatTokenUsageIndicatorProps> = ({ sessionId, tokenUsageClient }) => {
    const [totalTokens, setTotalTokens] = React.useState<number>(0);

    React.useEffect(() => {
        setTotalTokens(0);
        const disposable = tokenUsageClient.onTokenUsageUpdated(usage => {
            if (usage.sessionId === sessionId) {
                setTotalTokens(usage.inputTokens + (usage.cachedInputTokens ?? 0) + (usage.readCachedInputTokens ?? 0) + (usage.outputTokens ?? 0));
            }
        });
        return () => disposable.dispose();
    }, [sessionId, tokenUsageClient]);

    const colorClass = getUsageColorClass(totalTokens);
    const formattedUsage = formatTokenCount(totalTokens);
    const budgetFormatted = formatTokenCount(CHAT_TOKEN_BUDGET);
    const thresholdFormatted = formatTokenCount(CHAT_TOKEN_THRESHOLD);
    const tooltipText = [
        `Total tokens (input + output): ${totalTokens > 0 ? totalTokens.toLocaleString() : 'None'}`,
        `Threshold: ${CHAT_TOKEN_THRESHOLD.toLocaleString()} (${thresholdFormatted})`,
        `Budget: ${CHAT_TOKEN_BUDGET.toLocaleString()} (${budgetFormatted})`
    ].join('\n');

    return (
        <div className={`theia-ChatTokenUsageIndicator ${colorClass}`} title={tooltipText}>
            <span className='token-usage-text'>{formattedUsage} / {budgetFormatted} tokens</span>
        </div>
    );
};
