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
import { ChatAgentLocation } from './chat-agents';
import { ChatResponseContent, MutableChatModel, MutableChatRequestModel, SummaryChatResponseContent, TextChatResponseContentImpl } from './chat-model';
import { ParsedChatRequest } from './parsed-chat-request';

describe('MutableChatModel.insertSummary()', () => {

    function createParsedRequest(text: string): ParsedChatRequest {
        return {
            request: { text },
            parts: [{
                kind: 'text',
                text,
                promptText: text,
                range: { start: 0, endExclusive: text.length }
            }],
            toolRequests: new Map(),
            variables: []
        };
    }

    function createModelWithRequests(count: number): MutableChatModel {
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        for (let i = 1; i <= count; i++) {
            const req = model.addRequest(createParsedRequest(`Request ${i}`));
            req.response.complete();
        }
        return model;
    }

    describe('basic functionality', () => {
        it('should return undefined when model has less than 2 requests', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            model.addRequest(createParsedRequest('Single request'));

            const result = await model.insertSummary(
                async () => 'Summary text',
                'end'
            );

            expect(result).to.be.undefined;
        });

        it('should return undefined when model is empty', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);

            const result = await model.insertSummary(
                async () => 'Summary text',
                'end'
            );

            expect(result).to.be.undefined;
        });

        it('should return summary text on success', async () => {
            const model = createModelWithRequests(3);

            const result = await model.insertSummary(
                async () => 'This is a summary',
                'end'
            );

            expect(result).to.equal('This is a summary');
        });
    });

    describe('position: end', () => {
        it('should append summary at the end', async () => {
            const model = createModelWithRequests(3);

            await model.insertSummary(
                async () => 'Summary text',
                'end'
            );

            const requests = model.getRequests();
            // Should have 4 requests: 3 original + 1 summary
            expect(requests).to.have.lengthOf(4);
            expect(requests[3].request.kind).to.equal('summary');
        });

        it('should mark all requests except the last as stale', async () => {
            const model = createModelWithRequests(3);

            await model.insertSummary(
                async () => 'Summary text',
                'end'
            );

            const requests = model.getRequests();
            // Requests 1-2 (indices 0-1) should be stale, request 3 should not be
            expect(requests[0].isStale).to.be.true;
            expect(requests[1].isStale).to.be.true;
            expect(requests[2].isStale).to.be.false;
            // Summary request (index 3) should also not be stale
            expect(requests[3].isStale).to.be.false;
        });

        it('should create SummaryChatResponseContent in response', async () => {
            const model = createModelWithRequests(2);

            await model.insertSummary(
                async () => 'The conversation summary',
                'end'
            );

            const summaryRequest = model.getRequests().find(r => r.request.kind === 'summary');
            expect(summaryRequest).to.not.be.undefined;

            const content = summaryRequest!.response.response.content;
            expect(content).to.have.lengthOf(1);
            expect(SummaryChatResponseContent.is(content[0])).to.be.true;
            expect((content[0] as SummaryChatResponseContent).content).to.equal('The conversation summary');
        });
    });

    describe('position: beforeLast', () => {
        it('should insert summary before the last request', async () => {
            const model = createModelWithRequests(3);
            const lastRequestId = model.getRequests()[2].id;

            await model.insertSummary(
                async () => 'Summary text',
                'beforeLast'
            );

            const requests = model.getRequests();
            // Should have 4 requests: 3 original + 1 summary
            expect(requests).to.have.lengthOf(4);
            // Summary should be at index 2, original last request at index 3
            expect(requests[2].request.kind).to.equal('summary');
            expect(requests[3].id).to.equal(lastRequestId);
        });

        it('should preserve the trigger request identity (same object)', async () => {
            const model = createModelWithRequests(3);
            const originalLastRequest = model.getRequests()[2];
            const originalId = originalLastRequest.id;

            await model.insertSummary(
                async () => 'Summary text',
                'beforeLast'
            );

            const readdedRequest = model.getRequests()[3];
            // Should be the exact same object
            expect(readdedRequest.id).to.equal(originalId);
        });

        it('should mark all requests except trigger as stale', async () => {
            const model = createModelWithRequests(3);
            const triggerRequestId = model.getRequests()[2].id;

            await model.insertSummary(
                async () => 'Summary text',
                'beforeLast'
            );

            const requests = model.getRequests();
            // Requests 1-2 (indices 0-1) should be stale
            expect(requests[0].isStale).to.be.true;
            expect(requests[1].isStale).to.be.true;
            // Summary request (index 2) should not be stale
            expect(requests[2].isStale).to.be.false;
            // Trigger request (index 3) should not be stale
            expect(requests[3].isStale).to.be.false;
            expect(requests[3].id).to.equal(triggerRequestId);
        });
    });

    describe('callback failure handling', () => {
        it('should rollback on callback returning undefined (end position)', async () => {
            const model = createModelWithRequests(3);
            const originalRequestCount = model.getRequests().length;

            const result = await model.insertSummary(
                async () => undefined,
                'end'
            );

            expect(result).to.be.undefined;
            // Model should be unchanged
            expect(model.getRequests()).to.have.lengthOf(originalRequestCount);
            // Stale flags should be restored
            model.getRequests().forEach(r => {
                expect(r.isStale).to.be.false;
            });
        });

        it('should rollback on callback throwing error (end position)', async () => {
            const model = createModelWithRequests(3);
            const originalRequestCount = model.getRequests().length;

            const result = await model.insertSummary(
                async () => { throw new Error('Agent failed'); },
                'end'
            );

            expect(result).to.be.undefined;
            // Model should be unchanged
            expect(model.getRequests()).to.have.lengthOf(originalRequestCount);
            // Stale flags should be restored
            model.getRequests().forEach(r => {
                expect(r.isStale).to.be.false;
            });
        });

        it('should rollback on callback failure (beforeLast position)', async () => {
            const model = createModelWithRequests(3);
            const originalRequestIds = model.getRequests().map(r => r.id);

            const result = await model.insertSummary(
                async () => undefined,
                'beforeLast'
            );

            expect(result).to.be.undefined;
            // Should have same requests in same order
            const currentRequestIds = model.getRequests().map(r => r.id);
            expect(currentRequestIds).to.deep.equal(originalRequestIds);
            // Stale flags should be restored
            model.getRequests().forEach(r => {
                expect(r.isStale).to.be.false;
            });
        });

        it('should restore trigger request on failure (beforeLast position)', async () => {
            const model = createModelWithRequests(3);
            const originalLastRequestId = model.getRequests()[2].id;

            const result = await model.insertSummary(
                async () => { throw new Error('Agent failed'); },
                'beforeLast'
            );

            expect(result).to.be.undefined;
            // Trigger request should be back in position
            const requests = model.getRequests();
            expect(requests).to.have.lengthOf(3);
            expect(requests[2].id).to.equal(originalLastRequestId);
        });
    });

    describe('callback receives correct summaryRequest', () => {
        it('should pass a valid MutableChatRequestModel to callback', async () => {
            const model = createModelWithRequests(2);
            let receivedRequest: MutableChatRequestModel | undefined;

            await model.insertSummary(
                async summaryRequest => {
                    receivedRequest = summaryRequest;
                    return 'Summary';
                },
                'end'
            );

            expect(receivedRequest).to.not.be.undefined;
            expect(receivedRequest!.request.kind).to.equal('summary');
            expect(receivedRequest!.response).to.not.be.undefined;
        });

        it('should allow callback to use summaryRequest for agent invocation', async () => {
            const model = createModelWithRequests(2);
            let responseModified = false;

            await model.insertSummary(
                async summaryRequest => {
                    // Simulate agent adding content to response
                    summaryRequest.response.response.addContent(
                        new TextChatResponseContentImpl('Agent response') as ChatResponseContent
                    );
                    responseModified = true;
                    return summaryRequest.response.response.asDisplayString();
                },
                'end'
            );

            expect(responseModified).to.be.true;
        });
    });

    describe('already stale requests', () => {
        it('should not re-mark already stale requests', async () => {
            const model = createModelWithRequests(4);
            // Mark first request as already stale
            model.getRequests()[0].isStale = true;

            await model.insertSummary(
                async () => 'Summary',
                'end'
            );

            const requests = model.getRequests();
            // First request was already stale, should remain stale
            expect(requests[0].isStale).to.be.true;
            // Second and third requests should now be stale
            expect(requests[1].isStale).to.be.true;
            expect(requests[2].isStale).to.be.true;
            // Fourth (last before summary) should not be stale
            expect(requests[3].isStale).to.be.false;
        });
    });
});
