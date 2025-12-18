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

    describe('resetSessionTokens', () => {
        it('should update token count and fire onSessionTokensUpdated', () => {
            const sessionId = 'session-1';
            const updateEvents: SessionTokenUpdateEvent[] = [];

            tracker.onSessionTokensUpdated(event => updateEvents.push(event));

            // Set initial token count via resetSessionTokens
            tracker.resetSessionTokens(sessionId, 50000);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(50000);
            expect(updateEvents).to.have.length(1);
            expect(updateEvents[0].sessionId).to.equal(sessionId);
            expect(updateEvents[0].inputTokens).to.equal(50000);

            // Reset to new baseline (simulating post-summarization)
            const newTokenCount = 10000;
            tracker.resetSessionTokens(sessionId, newTokenCount);

            expect(tracker.getSessionInputTokens(sessionId)).to.equal(newTokenCount);
            expect(updateEvents).to.have.length(2);
            expect(updateEvents[1].sessionId).to.equal(sessionId);
            expect(updateEvents[1].inputTokens).to.equal(newTokenCount);
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
            expect(updateEvents).to.have.length(2);
            expect(updateEvents[1].sessionId).to.equal(sessionId);
            expect(updateEvents[1].inputTokens).to.be.undefined;
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
