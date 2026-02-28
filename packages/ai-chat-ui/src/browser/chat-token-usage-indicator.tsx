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
import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ChatModel, ResponseTokenUsage } from '@theia/ai-chat';

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
    let total = 0;
    for (const request of chatModel.getRequests()) {
        const usage: ResponseTokenUsage | undefined = request.response.tokenUsage;
        if (usage) {
            total += usage.inputTokens
                + usage.outputTokens
                + (usage.cacheCreationInputTokens ?? 0)
                + (usage.cacheReadInputTokens ?? 0);
        }
    }
    return total;
}

export interface ChatTokenUsageIndicatorProps {
    chatModel?: ChatModel;
}

export const ChatTokenUsageIndicator: React.FC<ChatTokenUsageIndicatorProps> = ({ chatModel }) => {
    const totalTokens = computeSessionTokenUsage(chatModel);
    const colorClass = getUsageColorClass(totalTokens);
    const percentage = Math.min((totalTokens / CHAT_CONTEXT_WINDOW_SIZE) * 100, 100);

    return (
        <div className='chat-token-usage-indicator'>
            <div className='token-usage-bar-container'>
                <div
                    className={`token-usage-bar ${colorClass}`}
                    style={{ width: `${percentage}%` }}
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

    protected chatModel: ChatModel | undefined;
    protected modelListener: Disposable | undefined;

    constructor() {
        super();
        this.id = ChatTokenUsageIndicatorWidget.ID;
        this.addClass('chat-token-usage-indicator-widget');
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
        return React.createElement(ChatTokenUsageIndicator, {
            chatModel: this.chatModel
        });
    }
}
