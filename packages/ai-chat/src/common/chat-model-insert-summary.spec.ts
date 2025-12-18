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
import { MutableChatModel, SummaryChatResponseContent, SummaryChatResponseContentImpl } from './chat-model';
import { ParsedChatRequest } from './parsed-chat-request';

describe('MutableChatModel.insertSummary()', () => {

    function createParsedRequest(text: string, kind?: 'user' | 'summary'): ParsedChatRequest {
        return {
            request: { text, kind },
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

    /**
     * Helper to create a summary callback that simulates ChatService.sendRequest().
     * It creates the summary request directly on the model (as sendRequest would do internally)
     * and returns the expected result structure.
     */
    function createSummaryCallback(model: MutableChatModel, summaryText: string): () => Promise<{ requestId: string; summaryText: string } | undefined> {
        return async () => {
            // Simulate what ChatService.sendRequest() would do: create a request on the model
            const summaryRequest = model.addRequest(createParsedRequest(summaryText, 'summary'));
            // Add the summary content to the response
            summaryRequest.response.response.addContent(new SummaryChatResponseContentImpl(summaryText));
            summaryRequest.response.complete();
            return {
                requestId: summaryRequest.id,
                summaryText
            };
        };
    }

    describe('basic functionality', () => {
        it('should return undefined when model has less than 2 requests', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            model.addRequest(createParsedRequest('Single request'));

            const result = await model.insertSummary(
                async () => ({ requestId: 'test-id', summaryText: 'Summary text' }),
                'end'
            );

            expect(result).to.be.undefined;
        });

        it('should return undefined when model is empty', async () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);

            const result = await model.insertSummary(
                async () => ({ requestId: 'test-id', summaryText: 'Summary text' }),
                'end'
            );

            expect(result).to.be.undefined;
        });

        it('should return summary text on success', async () => {
            const model = createModelWithRequests(3);

            const result = await model.insertSummary(
                createSummaryCallback(model, 'This is a summary'),
                'end'
            );

            expect(result).to.equal('This is a summary');
        });
    });

    describe('position: end', () => {
        it('should append summary at the end', async () => {
            const model = createModelWithRequests(3);

            await model.insertSummary(
                createSummaryCallback(model, 'Summary text'),
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
                createSummaryCallback(model, 'Summary text'),
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
                createSummaryCallback(model, 'The conversation summary'),
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

    describe('callback failure handling', () => {
        it('should return undefined on callback returning undefined (end position)', async () => {
            const model = createModelWithRequests(3);
            const originalRequestCount = model.getRequests().length;

            const result = await model.insertSummary(
                async () => undefined,
                'end'
            );

            expect(result).to.be.undefined;
            // Model should be unchanged - callback didn't create any request
            expect(model.getRequests()).to.have.lengthOf(originalRequestCount);
            // Stale flags should remain unchanged
            model.getRequests().forEach(r => {
                expect(r.isStale).to.be.false;
            });
        });

        it('should return undefined on callback throwing error (end position)', async () => {
            const model = createModelWithRequests(3);
            const originalRequestCount = model.getRequests().length;

            const result = await model.insertSummary(
                async () => { throw new Error('Agent failed'); },
                'end'
            );

            expect(result).to.be.undefined;
            // Model should be unchanged - callback didn't create any request before throwing
            expect(model.getRequests()).to.have.lengthOf(originalRequestCount);
            // Stale flags should remain unchanged
            model.getRequests().forEach(r => {
                expect(r.isStale).to.be.false;
            });
        });

    });

    describe('callback creates request via model', () => {
        it('should find created request by requestId after callback returns', async () => {
            const model = createModelWithRequests(2);
            let createdRequestId: string | undefined;

            await model.insertSummary(
                async () => {
                    // Simulate ChatService.sendRequest() creating a request
                    const createdSummaryRequest = model.addRequest(createParsedRequest('Summary', 'summary'));
                    createdSummaryRequest.response.response.addContent(new SummaryChatResponseContentImpl('Summary'));
                    createdSummaryRequest.response.complete();
                    createdRequestId = createdSummaryRequest.id;
                    return {
                        requestId: createdSummaryRequest.id,
                        summaryText: 'Summary'
                    };
                },
                'end'
            );

            // The summary request should be findable in the model
            const summaryRequest = model.getRequests().find(r => r.id === createdRequestId);
            expect(summaryRequest).to.not.be.undefined;
            expect(summaryRequest!.request.kind).to.equal('summary');
        });

        it('should return undefined if requestId references non-existent request', async () => {
            const model = createModelWithRequests(2);

            const result = await model.insertSummary(
                async () => ({
                    requestId: 'non-existent-id',
                    summaryText: 'Summary'
                }),
                'end'
            );

            // Should return undefined because request wasn't found
            expect(result).to.be.undefined;
        });
    });

    describe('already stale requests', () => {
        it('should not re-mark already stale requests', async () => {
            const model = createModelWithRequests(4);
            // Mark first request as already stale
            model.getRequests()[0].isStale = true;

            await model.insertSummary(
                createSummaryCallback(model, 'Summary'),
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
