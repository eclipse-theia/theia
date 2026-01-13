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
import { Container } from '@theia/core/shared/inversify';
import { ChatSessionTokenTrackerImpl } from './chat-session-token-tracker';
import { SessionTokenUpdateEvent } from '../common/chat-session-token-tracker';

describe('ChatSessionTokenTrackerImpl', () => {
    let container: Container;
    let tracker: ChatSessionTokenTrackerImpl;

    beforeEach(() => {
        container = new Container();
        container.bind(ChatSessionTokenTrackerImpl).toSelf().inSingletonScope();
        tracker = container.get(ChatSessionTokenTrackerImpl);
    });

    describe('getSessionInputTokens', () => {
        it('should return undefined for unknown session', () => {
            expect(tracker.getSessionInputTokens('unknown-session')).to.be.undefined;
        });
    });

    describe('getSessionOutputTokens', () => {
        it('should return undefined for unknown session', () => {
            expect(tracker.getSessionOutputTokens('unknown-session')).to.be.undefined;
        });
    });

    describe('getSessionTotalTokens', () => {
        it('should return undefined for unknown session', () => {
            expect(tracker.getSessionTotalTokens('unknown-session')).to.be.undefined;
        });

        it('should return input tokens when only input is set', () => {
            const sessionId = 'session-1';
            tracker.updateSessionTokens(sessionId, 5000);
            expect(tracker.getSessionTotalTokens(sessionId)).to.equal(5000);
        });

        it('should return sum of input and output tokens', () => {
            const sessionId = 'session-1';
            tracker.updateSessionTokens(sessionId, 5000, 100);
            expect(tracker.getSessionTotalTokens(sessionId)).to.equal(5100);
        });
    });

    describe('resetSessionTokens', () => {
        it('should update token count and fire onSessionTokensUpdated', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            // Set initial token count via resetSessionTokens
            tracker.resetSessionTokens(sessionId, 50000);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(50000);
            expect(tracker.getSessionOutputTokens(sessionId)).to.be.undefined;
            expect(updateEvents).to.have.length(1);
            expect(updateEvents[0].sessionId).to.equal(sessionId);
            expect(updateEvents[0].inputTokens).to.equal(50000);
            expect(updateEvents[0].outputTokens).to.be.undefined;

            // Reset to new baseline (simulating post-summarization)
            const newTokenCount = 10000;
            tracker.resetSessionTokens(sessionId, newTokenCount);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(newTokenCount);
            expect(tracker.getSessionOutputTokens(sessionId)).to.be.undefined;
            expect(updateEvents).to.have.length(2);
            expect(updateEvents[1].sessionId).to.equal(sessionId);
            expect(updateEvents[1].inputTokens).to.equal(newTokenCount);
            expect(updateEvents[1].outputTokens).to.be.undefined;
        });

        it('should delete token count and emit undefined when called with undefined', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            // Set initial token count via resetSessionTokens
            tracker.resetSessionTokens(sessionId, 50000);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(50000);
            expect(updateEvents).to.have.length(1);

            // Reset to undefined (simulating switch to branch with no prior LLM requests)
            tracker.resetSessionTokens(sessionId, undefined);

            expect(tracker.getSessionInputTokens(sessionId)).to.be.undefined;
            expect(tracker.getSessionOutputTokens(sessionId)).to.be.undefined;
            expect(updateEvents).to.have.length(2);
            expect(updateEvents[1].sessionId).to.equal(sessionId);
            expect(updateEvents[1].inputTokens).to.be.undefined;
            expect(updateEvents[1].outputTokens).to.be.undefined;
        });

        it('should clear output tokens when resetting', () => {
            const sessionId = 'session-1';

            // Set both input and output tokens via updateSessionTokens
            tracker.updateSessionTokens(sessionId, 5000, 500);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(500);

            // Reset should clear output tokens
            tracker.resetSessionTokens(sessionId, 3000);
            expect(tracker.getSessionInputTokens(sessionId)).to.equal(3000);
            expect(tracker.getSessionOutputTokens(sessionId)).to.be.undefined;
        });
    });

    describe('updateSessionTokens', () => {
        it('should set input tokens and reset output to 0 when input provided', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            tracker.updateSessionTokens(sessionId, 5000);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(5000);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(0);
            expect(updateEvents).to.have.length(1);
            expect(updateEvents[0].inputTokens).to.equal(5000);
            expect(updateEvents[0].outputTokens).to.equal(0);
        });

        it('should update output tokens progressively', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            // Initial request with input tokens
            tracker.updateSessionTokens(sessionId, 5000, 0);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(0);

            // Progressive updates during streaming
            tracker.updateSessionTokens(sessionId, undefined, 100);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(100);
            expect(tracker.getSessionInputTokens(sessionId)).to.equal(5000); // Input unchanged

            tracker.updateSessionTokens(sessionId, undefined, 250);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(250);

            expect(updateEvents).to.have.length(3);
            expect(updateEvents[2].inputTokens).to.equal(5000);
            expect(updateEvents[2].outputTokens).to.equal(250);
        });

        it('should reset output to 0 when new input tokens arrive (new request)', () => {
            const sessionId = 'session-1';

            // First request
            tracker.updateSessionTokens(sessionId, 5000, 500);
            expect(tracker.getSessionTotalTokens(sessionId)).to.equal(5500);

            // New request starts - input tokens set, output resets
            tracker.updateSessionTokens(sessionId, 5500);
            expect(tracker.getSessionInputTokens(sessionId)).to.equal(5500);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(0);
            expect(tracker.getSessionTotalTokens(sessionId)).to.equal(5500);
        });

        it('should not update input tokens when input is 0', () => {
            const sessionId = 'session-1';

            tracker.updateSessionTokens(sessionId, 5000);
            expect(tracker.getSessionInputTokens(sessionId)).to.equal(5000);

            // Input of 0 should not reset
            tracker.updateSessionTokens(sessionId, 0, 100);
            expect(tracker.getSessionInputTokens(sessionId)).to.equal(5000);
            expect(tracker.getSessionOutputTokens(sessionId)).to.equal(100);
        });
    });

    describe('branch token methods', () => {
        it('should set and get branch tokens', () => {
            const sessionId = 'session-1';
            const branchId = 'branch-1';

            expect(tracker.getBranchTokens(sessionId, branchId)).to.be.undefined;

            tracker.setBranchTokens(sessionId, branchId, 5000);

            expect(tracker.getBranchTokens(sessionId, branchId)).to.equal(5000);
        });

        it('should get all branch tokens for a session', () => {
            const sessionId = 'session-1';

            tracker.setBranchTokens(sessionId, 'branch-1', 1000);
            tracker.setBranchTokens(sessionId, 'branch-2', 2000);
            tracker.setBranchTokens('other-session', 'branch-3', 3000);

            const result = tracker.getBranchTokensForSession(sessionId);

            expect(result).to.deep.equal({
                'branch-1': 1000,
                'branch-2': 2000
            });
        });

        it('should return empty object when no branch tokens exist for session', () => {
            const result = tracker.getBranchTokensForSession('unknown-session');
            expect(result).to.deep.equal({});
        });

        it('should restore branch tokens from persisted data', () => {
            const sessionId = 'session-1';
            const branchTokens = {
                'branch-1': 1000,
                'branch-2': 2000
            };

            tracker.restoreBranchTokens(sessionId, branchTokens);

            expect(tracker.getBranchTokens(sessionId, 'branch-1')).to.equal(1000);
            expect(tracker.getBranchTokens(sessionId, 'branch-2')).to.equal(2000);
        });

        it('should clear all branch tokens for a session', () => {
            const sessionId = 'session-1';

            tracker.setBranchTokens(sessionId, 'branch-1', 1000);
            tracker.setBranchTokens(sessionId, 'branch-2', 2000);
            tracker.setBranchTokens('other-session', 'branch-3', 3000);

            tracker.clearSessionBranchTokens(sessionId);

            expect(tracker.getBranchTokens(sessionId, 'branch-1')).to.be.undefined;
            expect(tracker.getBranchTokens(sessionId, 'branch-2')).to.be.undefined;
            expect(tracker.getBranchTokens('other-session', 'branch-3')).to.equal(3000);
        });
    });
});
