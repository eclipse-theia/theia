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
import {
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    MutableChatResponseModel,
    QuestionResponseContentImpl,
    ToolCallChatResponseContentImpl
} from './chat-model';

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

        it('should not accumulate duplicate listeners when content is cleared and re-added', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            response.response.addContent(toolCall);

            // Simulate AbstractStreamParsingChatAgent.addStreamResponse: for every streamed
            // text token, the whole content is cleared and re-added, tool call included.
            for (let i = 0; i < 10; i++) {
                const contentBeforeMarker = response.response.content.slice(0, 1);
                response.response.clearContent();
                response.response.addContents(contentBeforeMarker);
                response.response.addContents([new MarkdownChatResponseContentImpl(`token ${i}`)]);
            }

            let fireCount = 0;
            response.onDidChange(() => { fireCount++; });

            toolCall.updateResult('result');

            // A single tool call change must fire exactly once, no matter how often the
            // content array was rebuilt during streaming (see #17858).
            expect(fireCount).to.equal(1);
        });

        it('should stop propagating changes of content that was cleared and not re-added', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            response.response.addContent(toolCall);
            response.response.clearContent();

            let fireCount = 0;
            response.onDidChange(() => { fireCount++; });

            toolCall.updateResult('result');

            // Content that is no longer part of the response must not trigger response changes
            // (and with that auto-save) anymore.
            expect(fireCount).to.equal(0);
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

    describe('pending interactions', () => {
        const createAwaitingToolCall = (id: string): ToolCallChatResponseContentImpl => {
            const toolCall = new ToolCallChatResponseContentImpl(id, 'tool', '{}', false);
            toolCall.requestUserConfirmation();
            return toolCall;
        };

        it('should track a content part fired via fireInteractionNeeded until it is resolved', async () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);

            expect(response.pendingInteractions).to.have.lengthOf(0);

            response.fireInteractionNeeded(toolCall);

            // Late subscribers (e.g. a remounted delegation renderer) must be able to
            // rebuild pending interaction state instead of relying on the push event.
            expect(response.pendingInteractions).to.deep.equal([toolCall]);

            toolCall.complete('done');
            await toolCall.whenResolved;

            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should not track the same interaction twice', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);

            response.fireInteractionNeeded(toolCall);
            response.fireInteractionNeeded(toolCall);

            expect(response.pendingInteractions).to.have.lengthOf(1);
        });

        it('should still emit onInteractionNeeded for every fireInteractionNeeded call', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);

            let fireCount = 0;
            response.onInteractionNeeded(() => { fireCount++; });

            response.fireInteractionNeeded(toolCall);
            response.fireInteractionNeeded(toolCall);

            expect(fireCount).to.equal(2);
        });

        it('should clear pending interactions on complete()', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);
            response.fireInteractionNeeded(toolCall);

            response.complete();

            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should clear pending interactions on cancel()', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            // cancel() rejects the tool call's confirmed promise; absorb the rejection
            // so it does not surface as an unhandled rejection in stricter runners.
            toolCall.confirmed.catch(() => { /* expected rejection */ });
            response.response.addContent(toolCall);
            response.fireInteractionNeeded(toolCall);

            response.cancel();

            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should not track interactions fired after the response completed', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);
            response.complete();

            // e.g. a bubbled child-session interaction arriving after the parent finished
            response.fireInteractionNeeded(toolCall);

            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should not list a confirmed tool call that is still executing', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);
            response.fireInteractionNeeded(toolCall);

            toolCall.confirm();

            // The confirmation was granted; the tool is executing but no longer actionable
            // by the user, so late subscribers must not resurrect the confirmation UI.
            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should not list a tool call whose confirmation was canceled', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = createAwaitingToolCall('tool-1');
            response.response.addContent(toolCall);
            response.fireInteractionNeeded(toolCall);
            toolCall.confirmed.catch(() => { /* expected rejection */ });

            toolCall.cancelConfirmation(new Error('canceled'));

            expect(response.pendingInteractions).to.have.lengthOf(0);
        });

        it('should list a tool call waiting for user input until the input is handled', () => {
            const response = new MutableChatResponseModel('req-1');
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            response.response.addContent(toolCall);

            toolCall.requestUserInput();
            response.fireInteractionNeeded(toolCall);
            expect(response.pendingInteractions).to.deep.equal([toolCall]);

            toolCall.userInputHandled();
            expect(response.pendingInteractions).to.have.lengthOf(0);
        });
    });

    describe('interactive content awaiting state', () => {
        it('tool call: isAwaitingInteraction follows confirmation and user-input state', () => {
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            expect(toolCall.isAwaitingInteraction).to.equal(false);

            toolCall.requestUserConfirmation();
            expect(toolCall.isAwaitingInteraction).to.equal(true);
            toolCall.confirm();
            expect(toolCall.isAwaitingInteraction).to.equal(false);

            toolCall.requestUserInput();
            expect(toolCall.isAwaitingInteraction).to.equal(true);
            toolCall.userInputHandled();
            expect(toolCall.isAwaitingInteraction).to.equal(false);
        });

        it('tool call: finishing clears the awaiting-input state', () => {
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'tool', '{}', false);
            toolCall.requestUserInput();

            toolCall.complete('done');

            expect(toolCall.isAwaitingInteraction).to.equal(false);
        });

        it('question: isAwaitingInteraction is false once answered or skipped', () => {
            const fakeRequest = {
                response: {
                    fireInteractionNeeded: () => { },
                    response: { responseContentChanged: () => { } }
                }
            } as unknown as MutableChatRequestModel;
            const options = [{ text: 'Yes', value: 'yes' }];

            const answered = new QuestionResponseContentImpl('Proceed?', options, fakeRequest, () => { });
            expect(answered.isAwaitingInteraction).to.equal(true);
            answered.selectedOption = options[0];
            expect(answered.isAwaitingInteraction).to.equal(false);

            // A dismissed question resolves with an empty selection: isResolved stays
            // false, but the question must no longer count as awaiting interaction.
            const skipped = new QuestionResponseContentImpl('Proceed?', options, fakeRequest, () => { });
            skipped.selectedOptions = [];
            expect(skipped.isResolved).to.equal(false);
            expect(skipped.isAwaitingInteraction).to.equal(false);
        });

        it('question: a read-only (restored) question is never awaiting interaction', () => {
            const question = new QuestionResponseContentImpl('Proceed?', [{ text: 'Yes', value: 'yes' }], undefined, undefined);
            expect(question.isAwaitingInteraction).to.equal(false);
        });
    });
});
