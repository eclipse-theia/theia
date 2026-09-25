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
import { ChatRequestModel, ChatResponseModel, ResponseTokenUsage } from '@theia/ai-chat';
import {
    computeResponseStats,
    estimateTokens,
    formatResponseTime,
    formatStatTokens,
    formatTokensPerSecond
} from './chat-response-stats-util';

function createResponse(overrides: {
    tokenUsage?: ResponseTokenUsage;
    requestStartTime?: number;
    completionTime?: number;
    displayString?: string;
}): ChatResponseModel {
    return {
        tokenUsage: overrides.tokenUsage,
        requestStartTime: overrides.requestStartTime,
        completionTime: overrides.completionTime,
        response: {
            content: [],
            asString: () => overrides.displayString ?? '',
            asDisplayString: () => overrides.displayString ?? ''
        }
    } as unknown as ChatResponseModel;
}

function createRequest(text: string): ChatRequestModel {
    return {
        message: { request: { text } }
    } as unknown as ChatRequestModel;
}

describe('chat-response-stats-util', () => {

    describe('estimateTokens', () => {
        it('returns 0 for empty/undefined text', () => {
            expect(estimateTokens(undefined)).to.equal(0);
            expect(estimateTokens('')).to.equal(0);
        });
        it('estimates ~4 chars per token, rounding up', () => {
            expect(estimateTokens('abcd')).to.equal(1);
            expect(estimateTokens('abcde')).to.equal(2); // 5/4 -> 2
        });
    });

    describe('computeResponseStats', () => {
        it('uses reported token usage when available (input includes cache tokens)', () => {
            const response = createResponse({
                tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 20, cacheCreationInputTokens: 10 },
                requestStartTime: 1000,
                completionTime: 3000
            });
            const stats = computeResponseStats(response);
            expect(stats.inputEstimated).to.equal(false);
            expect(stats.inputTokens).to.equal(130); // 100 + 20 + 10
            expect(stats.outputEstimated).to.equal(false);
            expect(stats.outputTokens).to.equal(50);
            expect(stats.responseTimeMs).to.equal(2000);
            expect(stats.tokensPerSecond).to.equal(25); // 50 / 2s
        });

        it('estimates tokens from text when usage is missing', () => {
            const response = createResponse({
                displayString: 'abcdefgh', // 8 chars -> 2 tokens
                requestStartTime: 0,
                completionTime: 1000
            });
            const request = createRequest('abcd'); // 4 chars -> 1 token
            const stats = computeResponseStats(response, request);
            expect(stats.inputEstimated).to.equal(true);
            expect(stats.inputTokens).to.equal(1);
            expect(stats.outputEstimated).to.equal(true);
            expect(stats.outputTokens).to.equal(2);
            expect(stats.responseTimeMs).to.equal(1000);
            expect(stats.tokensPerSecond).to.equal(2); // 2 tokens / 1s
        });

        it('leaves response time and throughput undefined without timing', () => {
            const response = createResponse({ tokenUsage: { inputTokens: 10, outputTokens: 5 } });
            const stats = computeResponseStats(response);
            expect(stats.responseTimeMs).to.equal(undefined);
            expect(stats.tokensPerSecond).to.equal(undefined);
        });

        it('ignores negative time deltas', () => {
            const response = createResponse({ requestStartTime: 5000, completionTime: 1000, displayString: 'abcd' });
            const stats = computeResponseStats(response);
            expect(stats.responseTimeMs).to.equal(undefined);
        });
    });

    describe('formatting', () => {
        it('formats response time', () => {
            expect(formatResponseTime(undefined)).to.equal('-');
            expect(formatResponseTime(850)).to.equal('850ms');
            expect(formatResponseTime(3400)).to.equal('3.4s');
        });
        it('marks estimated token counts with ~', () => {
            expect(formatStatTokens(500, false)).to.equal('500');
            expect(formatStatTokens(500, true)).to.equal('~500');
            expect(formatStatTokens(1500, false)).to.equal('1.5k');
            expect(formatStatTokens(1500, true)).to.equal('~1.5k');
        });
        it('formats tokens per second', () => {
            expect(formatTokensPerSecond(undefined)).to.equal('-');
            expect(formatTokensPerSecond(42.345)).to.equal('42.3 tok/s');
            expect(formatTokensPerSecond(150.7)).to.equal('151 tok/s');
        });
    });
});
