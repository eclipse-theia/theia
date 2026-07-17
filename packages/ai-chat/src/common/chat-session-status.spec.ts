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
    ChatChangeEvent,
    ChatSessionStatus,
    MutableChatModel,
    MutableChatRequestModel,
    QuestionResponseContentImpl,
    TextChatResponseContentImpl,
    ToolCallChatResponseContentImpl
} from './chat-model';
import { ParsedChatRequest, ParsedChatRequestTextPart } from './parsed-chat-request';

describe('ChatSessionStatus', () => {

    function parsedRequest(text: string = 'hello'): ParsedChatRequest {
        return {
            request: { text },
            parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)],
            toolRequests: new Map(),
            variables: []
        };
    }

    function trackStatusChanges(model: MutableChatModel): ChatSessionStatus[] {
        const statuses: ChatSessionStatus[] = [];
        model.onDidChange(event => {
            if (ChatChangeEvent.isStatusChangedEvent(event)) {
                statuses.push(event.status);
            }
        });
        return statuses;
    }

    /** Simulates the tool request service's confirmation flow up to the point where the user must decide. */
    function requestConfirmation(request: MutableChatRequestModel, toolCall: ToolCallChatResponseContentImpl): void {
        toolCall.requestUserConfirmation();
        request.response.fireInteractionNeeded(toolCall);
        request.response.waitForInput();
    }

    describe('fromRequest', () => {
        it('should be idle without a request', () => {
            expect(ChatSessionStatus.fromRequest(undefined)).to.equal('idle');
        });
    });

    describe('isInProgress', () => {
        it('should be true for all non-terminal statuses', () => {
            expect(ChatSessionStatus.isInProgress('running')).to.be.true;
            expect(ChatSessionStatus.isInProgress('awaitingApproval')).to.be.true;
            expect(ChatSessionStatus.isInProgress('awaitingToolCall')).to.be.true;
            expect(ChatSessionStatus.isInProgress('awaitingInput')).to.be.true;
            expect(ChatSessionStatus.isInProgress('idle')).to.be.false;
            expect(ChatSessionStatus.isInProgress('failed')).to.be.false;
        });
    });

    describe('requiresUserAction', () => {
        it('should be true only when blocked on the user', () => {
            expect(ChatSessionStatus.requiresUserAction('awaitingApproval')).to.be.true;
            expect(ChatSessionStatus.requiresUserAction('awaitingInput')).to.be.true;
            expect(ChatSessionStatus.requiresUserAction('running')).to.be.false;
            expect(ChatSessionStatus.requiresUserAction('awaitingToolCall')).to.be.false;
            expect(ChatSessionStatus.requiresUserAction('idle')).to.be.false;
            expect(ChatSessionStatus.requiresUserAction('failed')).to.be.false;
        });
    });

    describe('MutableChatModel.status', () => {
        it('should be idle for an empty session', () => {
            const model = new MutableChatModel();
            expect(model.status).to.equal('idle');
        });

        it('should be running while a request is in progress', () => {
            const model = new MutableChatModel();
            model.addRequest(parsedRequest());
            expect(model.status).to.equal('running');
        });

        it('should fire a statusChanged event with the model already updated', () => {
            const model = new MutableChatModel();
            let statusInEvent: ChatSessionStatus | undefined;
            let statusOnModel: ChatSessionStatus | undefined;
            model.onDidChange(event => {
                if (ChatChangeEvent.isStatusChangedEvent(event)) {
                    statusInEvent = event.status;
                    statusOnModel = model.status;
                }
            });

            model.addRequest(parsedRequest());

            expect(statusInEvent).to.equal('running');
            expect(statusOnModel).to.equal('running');
        });

        it('should not fire statusChanged for changes that keep the status', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const statuses = trackStatusChanges(model);

            request.response.response.addContent(new TextChatResponseContentImpl('first'));
            request.response.response.addContent(new TextChatResponseContentImpl('second'));

            expect(model.status).to.equal('running');
            expect(statuses).to.deep.equal([]);
        });

        it('should return to idle when the last request completes', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const statuses = trackStatusChanges(model);

            request.response.complete();

            expect(model.status).to.equal('idle');
            expect(statuses).to.deep.equal(['idle']);
        });

        it('should be idle when the last request was canceled', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());

            request.response.cancel();

            expect(model.status).to.equal('idle');
        });

        it('should be failed when the last request ended in an error', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());

            request.response.error(new Error('boom'));

            expect(model.status).to.equal('failed');
        });

        it('should be running again when a new request is added after a failure', () => {
            const model = new MutableChatModel();
            const failed = model.addRequest(parsedRequest());
            failed.response.error(new Error('boom'));

            model.addRequest(parsedRequest('try again'));

            expect(model.status).to.equal('running');
        });

        it('should be awaitingToolCall while a tool call is executing', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);

            request.response.response.addContent(toolCall);
            expect(model.status).to.equal('awaitingToolCall');

            toolCall.complete('done');
            expect(model.status).to.equal('running');
        });

        it('should be awaitingApproval while a tool call waits for user confirmation', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);
            request.response.response.addContent(toolCall);

            requestConfirmation(request, toolCall);

            expect(model.status).to.equal('awaitingApproval');
        });

        it('should move to awaitingToolCall when the user approves the tool call', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);
            request.response.response.addContent(toolCall);
            requestConfirmation(request, toolCall);

            toolCall.confirm();
            request.response.stopWaitingForInput();

            expect(model.status).to.equal('awaitingToolCall');
        });

        it('should move back to running when the user denies the tool call', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);
            request.response.response.addContent(toolCall);
            requestConfirmation(request, toolCall);

            toolCall.deny('not allowed');
            request.response.stopWaitingForInput();

            expect(model.status).to.equal('running');
        });

        it('should be awaitingInput while a structured question is unanswered', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const question = new QuestionResponseContentImpl(
                'Proceed?',
                [{ text: 'Yes' }, { text: 'No' }],
                request,
                () => { /* no-op */ }
            );

            request.response.response.addContent(question);
            expect(model.status).to.equal('awaitingInput');

            question.selectedOption = { text: 'Yes' };
            expect(model.status).to.equal('running');
        });

        it('should be awaitingInput while waiting for input without a question part', () => {
            // E.g. the user-interaction tool keeps its tool call unfinished while the
            // user completes a wizard; only the waiting-for-input flag is set.
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'userInteraction', '{}', false);
            request.response.response.addContent(toolCall);

            request.response.waitForInput();
            expect(model.status).to.equal('awaitingInput');

            request.response.stopWaitingForInput();
            expect(model.status).to.equal('awaitingToolCall');
        });

        it('should prefer awaitingApproval over awaitingInput', () => {
            const model = new MutableChatModel();
            const request = model.addRequest(parsedRequest());
            const question = new QuestionResponseContentImpl(
                'Proceed?',
                [{ text: 'Yes' }],
                request,
                () => { /* no-op */ }
            );
            request.response.response.addContent(question);
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);
            request.response.response.addContent(toolCall);

            requestConfirmation(request, toolCall);

            expect(model.status).to.equal('awaitingApproval');
        });

        it('should record the full transition sequence of a confirmed tool call', () => {
            const model = new MutableChatModel();
            const statuses = trackStatusChanges(model);
            const request = model.addRequest(parsedRequest());
            const toolCall = new ToolCallChatResponseContentImpl('tool-1', 'myTool', '{}', false);

            request.response.response.addContent(toolCall);
            requestConfirmation(request, toolCall);
            toolCall.confirm();
            request.response.stopWaitingForInput();
            toolCall.complete('done');
            request.response.complete();

            expect(statuses).to.deep.equal(['running', 'awaitingToolCall', 'awaitingApproval', 'awaitingToolCall', 'running', 'idle']);
        });
    });
});
