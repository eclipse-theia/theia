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

import { expect } from 'chai';
import { Emitter, Event } from '@theia/core';
import { ChatModel, ChatRequestModel, ResponseTokenUsage } from '@theia/ai-chat';
import {
    CHAT_CONTEXT_WINDOW_SIZE,
    computeSessionTokenUsage,
    formatTokenCount,
    getUsageColorClass
} from './chat-token-usage-indicator-util';

const CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD = 0.9 * CHAT_CONTEXT_WINDOW_SIZE;

function createMockRequest(tokenUsage?: ResponseTokenUsage, isComplete = true): Partial<ChatRequestModel> {
    return {
        response: {
            tokenUsage,
            isComplete
        } as ChatRequestModel['response']
    };
}

function createMockChatModel(requests: Partial<ChatRequestModel>[]): ChatModel {
    const emitter = new Emitter<unknown>();
    return {
        onDidChange: emitter.event as Event<unknown>,
        id: 'test-model',
        getRequests: () => requests as ChatRequestModel[],
    } as ChatModel;
}

describe('ChatTokenUsageIndicator', () => {
    describe('formatTokenCount', () => {
        it('should return "-" for undefined', () => {
            expect(formatTokenCount(undefined)).to.equal('-');
        });

        it('should return "-" for 0', () => {
            expect(formatTokenCount(0)).to.equal('-');
        });

        it('should format numbers below 1000 as-is', () => {
            expect(formatTokenCount(500)).to.equal('500');
            expect(formatTokenCount(999)).to.equal('999');
        });

        it('should format numbers >= 1000 with k suffix and one decimal', () => {
            expect(formatTokenCount(1000)).to.equal('1.0k');
            expect(formatTokenCount(1500)).to.equal('1.5k');
            expect(formatTokenCount(125000)).to.equal('125.0k');
            expect(formatTokenCount(200000)).to.equal('200.0k');
        });
    });

    describe('getUsageColorClass', () => {
        it('should return none for 0 tokens', () => {
            expect(getUsageColorClass(0)).to.equal('token-usage-none');
        });

        it('should return green for tokens below threshold', () => {
            expect(getUsageColorClass(1)).to.equal('token-usage-green');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD - 1)).to.equal('token-usage-green');
        });

        it('should return yellow for tokens at or above threshold but below budget', () => {
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD)).to.equal('token-usage-yellow');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE - 1)).to.equal('token-usage-yellow');
        });

        it('should return red for tokens at or above budget', () => {
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE)).to.equal('token-usage-red');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE + 1)).to.equal('token-usage-red');
        });
    });

    describe('computeSessionTokenUsage', () => {
        it('should return 0 when chatModel is undefined', () => {
            expect(computeSessionTokenUsage(undefined)).to.equal(0);
        });

        it('should return 0 when there are no requests', () => {
            const model = createMockChatModel([]);
            expect(computeSessionTokenUsage(model)).to.equal(0);
        });

        it('should return 0 when requests have no token usage', () => {
            const model = createMockChatModel([
                createMockRequest(undefined),
                createMockRequest(undefined)
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(0);
        });

        it('should sum all tokens from a single request', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 })
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(1500);
        });

        it('should return only the last request tokens, not the sum', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }),
                createMockRequest({ inputTokens: 2000, outputTokens: 800 })
            ]);
            // Only the last request: 2000+800 = 2800
            expect(computeSessionTokenUsage(model)).to.equal(2800);
        });

        it('should return last request tokens from 3 requests (2 complete, 1 in-progress)', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }, true),
                createMockRequest({ inputTokens: 2000, outputTokens: 800 }, true),
                createMockRequest({ inputTokens: 3000, outputTokens: 200 }, false) // in-progress
            ]);
            // Only the last request: 3000+200 = 3200
            expect(computeSessionTokenUsage(model)).to.equal(3200);
        });

        it('should skip requests without token usage and return last with usage', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }),
                createMockRequest(undefined),
                createMockRequest({ inputTokens: 3000, outputTokens: 1000 })
            ]);
            // Last request with usage: 3000+1000 = 4000
            expect(computeSessionTokenUsage(model)).to.equal(4000);
        });

        it('should include cache creation and cache read tokens in the total', () => {
            const model = createMockChatModel([
                createMockRequest({
                    inputTokens: 1000,
                    outputTokens: 500,
                    cacheCreationInputTokens: 200,
                    cacheReadInputTokens: 300
                })
            ]);
            // 1000+500+200+300 = 2000
            expect(computeSessionTokenUsage(model)).to.equal(2000);
        });

        it('should return only last request cache tokens, not sum across requests', () => {
            const model = createMockChatModel([
                createMockRequest({
                    inputTokens: 1000,
                    outputTokens: 500,
                    cacheCreationInputTokens: 200,
                    cacheReadInputTokens: 300
                }),
                createMockRequest({
                    inputTokens: 500,
                    outputTokens: 100,
                    cacheCreationInputTokens: 50,
                    cacheReadInputTokens: 50
                })
            ]);
            // Only last request: 500+100+50+50 = 700
            expect(computeSessionTokenUsage(model)).to.equal(700);
        });

        it('should return in-progress request token usage when it is last', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }, true),
                createMockRequest({ inputTokens: 5000, outputTokens: 200 }, false) // in-progress
            ]);
            // Only last request: 5000+200 = 5200
            expect(computeSessionTokenUsage(model)).to.equal(5200);
        });

        it('should return total from in-progress request when it is the only request', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 5000, outputTokens: 200 }, false)
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(5200);
        });

        it('should skip trailing requests without usage and find last with usage', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }),
                createMockRequest({ inputTokens: 3000, outputTokens: 1000 }),
                createMockRequest(undefined)
            ]);
            // Last request with usage: 3000+1000 = 4000
            expect(computeSessionTokenUsage(model)).to.equal(4000);
        });
    });
});
