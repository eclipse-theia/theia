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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { TokenUsageServiceClient, TokenUsage } from '@theia/ai-core/lib/common';
import { ChatSessionTokenTrackerImpl, CHAT_TOKEN_THRESHOLD } from './chat-session-token-tracker';
import { SessionTokenThresholdEvent, SessionTokenUpdateEvent } from '../common/chat-session-token-tracker';

describe('ChatSessionTokenTrackerImpl', () => {
    let container: Container;
    let tracker: ChatSessionTokenTrackerImpl;
    let mockTokenUsageEmitter: Emitter<TokenUsage>;
    let mockTokenUsageClient: TokenUsageServiceClient;

    const createTokenUsage = (sessionId: string | undefined, inputTokens: number, requestId: string): TokenUsage => ({
        sessionId,
        inputTokens,
        outputTokens: 100,
        requestId,
        model: 'test-model',
        timestamp: new Date()
    });

    beforeEach(() => {
        container = new Container();

        // Create a mock TokenUsageServiceClient with controllable event emitter
        mockTokenUsageEmitter = new Emitter<TokenUsage>();
        mockTokenUsageClient = {
            notifyTokenUsage: sinon.stub(),
            onTokenUsageUpdated: mockTokenUsageEmitter.event
        };

        // Bind dependencies
        container.bind(TokenUsageServiceClient).toConstantValue(mockTokenUsageClient);
        container.bind(ChatSessionTokenTrackerImpl).toSelf().inSingletonScope();

        tracker = container.get(ChatSessionTokenTrackerImpl);
    });

    afterEach(() => {
        mockTokenUsageEmitter.dispose();
        sinon.restore();
    });

    describe('getSessionInputTokens', () => {
        it('should return correct token count after usage is reported', () => {
            const sessionId = 'session-1';
            const inputTokens = 5000;

            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, inputTokens, 'request-1'));

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(inputTokens);
        });

        it('should return undefined for unknown session', () => {
            expect(tracker.getSessionInputTokens('unknown-session')).to.be.undefined;
        });
    });

    describe('onThresholdExceeded', () => {
        it('should fire when tokens exceed threshold', () => {
            const sessionId = 'session-1';
            const inputTokens = CHAT_TOKEN_THRESHOLD + 1000;
            const thresholdEvents: SessionTokenThresholdEvent[] = [];

            tracker.onThresholdExceeded(event => thresholdEvents.push(event));

            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, inputTokens, 'request-1'));

            expect(thresholdEvents).to.have.length(1);
            expect(thresholdEvents[0].sessionId).to.equal(sessionId);
            expect(thresholdEvents[0].inputTokens).to.equal(inputTokens);
        });

        it('should not fire when tokens are below threshold', () => {
            const sessionId = 'session-1';
            const inputTokens = CHAT_TOKEN_THRESHOLD - 1000;
            const thresholdEvents: SessionTokenThresholdEvent[] = [];

            tracker.onThresholdExceeded(event => thresholdEvents.push(event));

            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, inputTokens, 'request-1'));

            expect(thresholdEvents).to.have.length(0);
        });

        it('should not fire twice for the same session without reset', () => {
            const sessionId = 'session-1';
            const thresholdEvents: SessionTokenThresholdEvent[] = [];

            tracker.onThresholdExceeded(event => thresholdEvents.push(event));

            // First token usage exceeding threshold
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, CHAT_TOKEN_THRESHOLD + 1000, 'request-1'));

            // Second token usage exceeding threshold (should not trigger again)
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, CHAT_TOKEN_THRESHOLD + 2000, 'request-2'));

            expect(thresholdEvents).to.have.length(1);
        });
    });

    describe('resetThresholdTrigger', () => {
        it('should allow re-triggering after resetThresholdTrigger is called', () => {
            const sessionId = 'session-1';
            const thresholdEvents: SessionTokenThresholdEvent[] = [];

            tracker.onThresholdExceeded(event => thresholdEvents.push(event));

            // First token usage exceeding threshold
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, CHAT_TOKEN_THRESHOLD + 1000, 'request-1'));

            expect(thresholdEvents).to.have.length(1);

            // Reset the threshold trigger (simulating summarization completion)
            tracker.resetThresholdTrigger(sessionId);

            // Second token usage exceeding threshold should trigger again
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, CHAT_TOKEN_THRESHOLD + 3000, 'request-2'));

            expect(thresholdEvents).to.have.length(2);
            expect(thresholdEvents[0].sessionId).to.equal(sessionId);
            expect(thresholdEvents[1].sessionId).to.equal(sessionId);
        });

        it('should not affect other sessions', () => {
            const sessionId1 = 'session-1';
            const sessionId2 = 'session-2';
            const thresholdEvents: SessionTokenThresholdEvent[] = [];

            tracker.onThresholdExceeded(event => thresholdEvents.push(event));

            // Trigger threshold for session 1
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId1, CHAT_TOKEN_THRESHOLD + 1000, 'request-1'));

            // Trigger threshold for session 2
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId2, CHAT_TOKEN_THRESHOLD + 1000, 'request-2'));

            expect(thresholdEvents).to.have.length(2);

            // Reset only session 1
            tracker.resetThresholdTrigger(sessionId1);

            // Session 1 should be able to trigger again
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId1, CHAT_TOKEN_THRESHOLD + 2000, 'request-3'));

            // Session 2 should not trigger again (not reset)
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId2, CHAT_TOKEN_THRESHOLD + 2000, 'request-4'));

            expect(thresholdEvents).to.have.length(3);
            expect(thresholdEvents[2].sessionId).to.equal(sessionId1);
        });
    });

    describe('resetSessionTokens', () => {
        it('should update token count and fire onSessionTokensUpdated', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            // Set initial token count
            mockTokenUsageEmitter.fire(createTokenUsage(sessionId, 50000, 'request-1'));

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(50000);
            expect(updateEvents).to.have.length(1);

            // Reset to new baseline (simulating post-summarization)
            const newTokenCount = 10000;
            tracker.resetSessionTokens(sessionId, newTokenCount);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(newTokenCount);
            expect(updateEvents).to.have.length(2);
            expect(updateEvents[1].sessionId).to.equal(sessionId);
            expect(updateEvents[1].inputTokens).to.equal(newTokenCount);
        });
    });

    describe('token usage handling', () => {
        it('should ignore token usage without sessionId', () => {
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            mockTokenUsageEmitter.fire(createTokenUsage(undefined, 5000, 'request-1'));

            expect(updateEvents).to.have.length(0);
        });
    });
});
