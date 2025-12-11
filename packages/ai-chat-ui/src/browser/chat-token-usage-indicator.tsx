// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import {
    ChatSessionTokenTracker,
    CHAT_TOKEN_BUDGET,
    CHAT_TOKEN_THRESHOLD
} from '@theia/ai-chat/lib/browser';

export interface ChatTokenUsageIndicatorProps {
    sessionId: string;
    tokenTracker: ChatSessionTokenTracker;
    budgetAwareEnabled: boolean;
}

/**
 * Formats a token count to a human-readable string.
 * E.g., 125000 -> "125k", 1500 -> "1.5k", 500 -> "500"
 */
const formatTokenCount = (tokens: number | undefined): string => {
    if (tokens === undefined) {
        return '-';
    }
    if (tokens >= 1000) {
        const k = tokens / 1000;
        // Show one decimal place if needed, otherwise whole number
        return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return tokens.toString();
};

/**
 * Determines the color class based on usage percentage.
 * - Green: <70%
 * - Yellow: 70-<90%
 * - Red: ≥90%
 */
const getUsageColorClass = (tokens: number | undefined, threshold: number): string => {
    if (tokens === undefined) {
        return 'token-usage-none';
    }
    const percentage = (tokens / threshold) * 100;
    if (percentage >= 90) {
        return 'token-usage-red';
    }
    if (percentage >= 70) {
        return 'token-usage-yellow';
    }
    return 'token-usage-green';
};

/**
 * A React component that displays the current token usage for a chat session.
 * Shows current input tokens vs threshold with color coding based on usage percentage.
 */
export const ChatTokenUsageIndicator: React.FC<ChatTokenUsageIndicatorProps> = ({
    sessionId,
    tokenTracker,
    budgetAwareEnabled
}) => {
    const [inputTokens, setInputTokens] = React.useState<number | undefined>(
        () => tokenTracker.getSessionInputTokens(sessionId)
    );

    React.useEffect(() => {
        // Get initial value
        setInputTokens(tokenTracker.getSessionInputTokens(sessionId));

        // Subscribe to token updates
        const disposable = tokenTracker.onSessionTokensUpdated(event => {
            if (event.sessionId === sessionId) {
                setInputTokens(event.inputTokens);
            }
        });

        return () => disposable.dispose();
    }, [sessionId, tokenTracker]);

    const thresholdFormatted = formatTokenCount(CHAT_TOKEN_THRESHOLD);
    const budgetFormatted = formatTokenCount(CHAT_TOKEN_BUDGET);
    const currentFormatted = formatTokenCount(inputTokens);
    const colorClass = getUsageColorClass(inputTokens, CHAT_TOKEN_THRESHOLD);

    const tooltipText = [
        `Tokens: ${inputTokens !== undefined ? inputTokens.toLocaleString() : 'None'}`,
        `Threshold: ${CHAT_TOKEN_THRESHOLD.toLocaleString()} (${thresholdFormatted})`,
        `Budget: ${CHAT_TOKEN_BUDGET.toLocaleString()} (${budgetFormatted})`,
        `Budget-aware: ${budgetAwareEnabled ? 'Enabled' : 'Disabled'}`
    ].join('\n');

    return (
        <div
            className={`theia-ChatTokenUsageIndicator ${colorClass}`}
            title={tooltipText}
        >
            <span className="token-usage-text">
                {currentFormatted} / {thresholdFormatted} tokens
            </span>
        </div>
    );
};
