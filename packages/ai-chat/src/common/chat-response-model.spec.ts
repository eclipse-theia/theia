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
import { MutableChatResponseModel, ToolCallChatResponseContentImpl } from './chat-model';

describe('MutableChatResponseModel', () => {
    describe('content change propagation', () => {
        it('should fire onDidChange when a tool call\'s result is updated after it was added', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            response.response.addContent(toolCall);

            let fireCount = 0;
            response.onDidChange(() => { fireCount++; });

            toolCall.updateResult('partial');

            // The response model must observe the change so auto-save can persist
            // intermediate state. Without this propagation, mutations that don't go
            // through addContent/merge (e.g. renderer-side partial results) would be
            // lost on reload.
            expect(fireCount).to.equal(1);
        });
    });

    describe('setTokenUsage', () => {
        it('should also add a token usage entry', () => {
            const response = new MutableChatResponseModel('req-1');
            const usage = { inputTokens: 100, outputTokens: 50 };

            response.setTokenUsage(usage);

            expect(response.tokenUsage).to.deep.equal(usage);
            expect(response.tokenUsageEntries).to.have.lengthOf(1);
            expect(response.tokenUsageEntries[0]).to.deep.equal(usage);
        });

        it('should accumulate entries across multiple setTokenUsage calls', () => {
            const response = new MutableChatResponseModel('req-1');
            const usage1 = { inputTokens: 100, outputTokens: 50 };
            const usage2 = { inputTokens: 200, outputTokens: 80 };

            response.setTokenUsage(usage1);
            response.setTokenUsage(usage2);

            expect(response.tokenUsage).to.deep.equal(usage2);
            expect(response.tokenUsageEntries).to.have.lengthOf(2);
            expect(response.tokenUsageEntries[0]).to.deep.equal(usage1);
            expect(response.tokenUsageEntries[1]).to.deep.equal(usage2);
        });
    });

    describe('waiting-for-input ref counting', () => {
        it('should not be waiting for input initially', () => {
            const response = new MutableChatResponseModel('req-1');
            expect(response.isWaitingForInput).to.equal(false);
        });

        it('should be waiting after a single waitForInput call', () => {
            const response = new MutableChatResponseModel('req-1');
            response.waitForInput();
            expect(response.isWaitingForInput).to.equal(true);
        });

        it('should stay waiting until all parallel waitForInput calls are released', () => {
            const response = new MutableChatResponseModel('req-1');

            response.waitForInput();
            response.waitForInput();
            expect(response.isWaitingForInput).to.equal(true);

            response.stopWaitingForInput();
            // Still waiting because the second waitForInput has not been released yet.
            expect(response.isWaitingForInput).to.equal(true);

            response.stopWaitingForInput();
            expect(response.isWaitingForInput).to.equal(false);
        });

        it('should clamp at zero on extra stopWaitingForInput calls (underflow guard)', () => {
            const response = new MutableChatResponseModel('req-1');

            response.waitForInput();
            response.stopWaitingForInput();
            // Extra release: must not push the counter negative, otherwise a later waitForInput
            // would have to be called twice before isWaitingForInput becomes true again.
            response.stopWaitingForInput();
            expect(response.isWaitingForInput).to.equal(false);

            response.waitForInput();
            expect(response.isWaitingForInput).to.equal(true);
        });

        it('should fire onDidChange on each waitForInput / stopWaitingForInput', () => {
            const response = new MutableChatResponseModel('req-1');
            let fireCount = 0;
            response.onDidChange(() => { fireCount++; });

            response.waitForInput();
            response.stopWaitingForInput();

            expect(fireCount).to.equal(2);
        });

        it('should hard-reset the waiting state on complete()', () => {
            const response = new MutableChatResponseModel('req-1');
            response.waitForInput();
            response.waitForInput();

            response.complete();

            expect(response.isWaitingForInput).to.equal(false);
            // Counter is fully reset, not merely decremented: a subsequent stopWaitingForInput
            // must not flip the state back via underflow.
            response.stopWaitingForInput();
            expect(response.isWaitingForInput).to.equal(false);
        });

        it('should hard-reset the waiting state on cancel()', () => {
            const response = new MutableChatResponseModel('req-1');
            response.waitForInput();
            response.waitForInput();

            response.cancel();

            expect(response.isWaitingForInput).to.equal(false);
        });

        it('should hard-reset the waiting state on error()', () => {
            const response = new MutableChatResponseModel('req-1');
            response.waitForInput();
            response.waitForInput();

            response.error(new Error('boom'));

            expect(response.isWaitingForInput).to.equal(false);
        });
    });
});
