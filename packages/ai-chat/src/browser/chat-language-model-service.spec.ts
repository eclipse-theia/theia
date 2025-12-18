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
import { ILogger, PreferenceService } from '@theia/core';
import {
    LanguageModel,
    LanguageModelRegistry,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    UserRequest,
    isLanguageModelStreamResponse
} from '@theia/ai-core';
import { ChatLanguageModelServiceImpl } from './chat-language-model-service';
import { ChatSessionTokenTracker, CHAT_TOKEN_THRESHOLD } from './chat-session-token-tracker';
import { ChatSessionSummarizationService } from './chat-session-summarization-service';
import { BUDGET_AWARE_TOOL_LOOP_PREF } from '../common/ai-chat-preferences';
import { PREFERENCE_NAME_REQUEST_SETTINGS } from '@theia/ai-core/lib/common/ai-core-preferences';

describe('ChatLanguageModelServiceImpl', () => {
    let container: Container;
    let service: ChatLanguageModelServiceImpl;
    let mockLanguageModel: sinon.SinonStubbedInstance<LanguageModel>;
    let mockPreferenceService: sinon.SinonStubbedInstance<PreferenceService>;
    let mockTokenTracker: sinon.SinonStubbedInstance<ChatSessionTokenTracker>;
    let mockSummarizationService: sinon.SinonStubbedInstance<ChatSessionSummarizationService>;
    let mockLogger: sinon.SinonStubbedInstance<ILogger>;

    beforeEach(() => {
        container = new Container();

        // Create mocks
        mockLanguageModel = {
            id: 'test/model',
            name: 'Test Model',
            request: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<LanguageModel>;

        mockPreferenceService = {
            get: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        mockTokenTracker = {
            getSessionInputTokens: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<ChatSessionTokenTracker>;

        mockSummarizationService = {
            triggerSummarization: sinon.stub(),
            hasSummary: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<ChatSessionSummarizationService>;

        mockLogger = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<ILogger>;

        // Bind mocks
        container.bind(LanguageModelRegistry).toConstantValue({} as LanguageModelRegistry);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(ChatSessionTokenTracker).toConstantValue(mockTokenTracker);
        container.bind(ChatSessionSummarizationService).toConstantValue(mockSummarizationService);
        container.bind(ILogger).toConstantValue(mockLogger);
        container.bind(ChatLanguageModelServiceImpl).toSelf().inSingletonScope();

        service = container.get(ChatLanguageModelServiceImpl);

        // Default preference setup
        mockPreferenceService.get.withArgs(PREFERENCE_NAME_REQUEST_SETTINGS, []).returns([]);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('sendRequest', () => {
        it('should delegate to super when preference is disabled', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(false);

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            const mockStream = createMockStream([{ content: 'Response' }]);
            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            expect(isLanguageModelStreamResponse(response)).to.be.true;
            expect(mockSummarizationService.triggerSummarization.called).to.be.false;
        });

        it('should delegate to super when request has no tools', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }]
                // No tools
            };

            const mockStream = createMockStream([{ content: 'Response' }]);
            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            expect(isLanguageModelStreamResponse(response)).to.be.true;
            expect(mockSummarizationService.triggerSummarization.called).to.be.false;
        });

        it('should use budget-aware handling when preference is enabled and tools are present', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100); // Below threshold

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            const mockStream = createMockStream([{ content: 'Response' }]);
            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            expect(isLanguageModelStreamResponse(response)).to.be.true;

            // Consume stream to trigger the actual request
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _part of (response as LanguageModelStreamResponse).stream) {
                // just consume
            }

            // Verify singleRoundTrip was set
            expect(mockLanguageModel.request.calledOnce).to.be.true;
            const actualRequest = mockLanguageModel.request.firstCall.args[0] as UserRequest;
            expect(actualRequest.singleRoundTrip).to.be.true;
        });
    });

    describe('budget checking', () => {
        it('should trigger summarization after tool execution when budget is exceeded mid-loop', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            // Return over threshold - budget check happens before request and after tool execution
            mockTokenTracker.getSessionInputTokens.returns(CHAT_TOKEN_THRESHOLD + 1000);
            mockSummarizationService.triggerSummarization.resolves(undefined);

            const toolHandler = sinon.stub().resolves('tool result');
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{
                    id: 'tool-1',
                    name: 'test-tool',
                    parameters: { type: 'object', properties: {} },
                    handler: toolHandler
                }]
            };

            // First call: model returns tool call without result
            const firstStream = createMockStream([
                { content: 'Let me use a tool' },
                { tool_calls: [{ id: 'call-1', function: { name: 'test-tool', arguments: '{}' }, finished: true }] }
            ]);

            // Second call: model returns final response
            const secondStream = createMockStream([{ content: 'Done!' }]);

            mockLanguageModel.request
                .onFirstCall().resolves({ stream: firstStream })
                .onSecondCall().resolves({ stream: secondStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            // Consume stream to trigger the tool loop
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _part of (response as LanguageModelStreamResponse).stream) {
                // just consume
            }

            // Verify summarization was triggered both before request and after tool execution
            expect(mockSummarizationService.triggerSummarization.calledTwice).to.be.true;
            // First call (before request): no skipReorder
            expect(mockSummarizationService.triggerSummarization.firstCall.calledWith('session-1')).to.be.true;
            // Second call (mid-turn, after tool execution): skipReorder=true
            expect(mockSummarizationService.triggerSummarization.secondCall.calledWith('session-1', true)).to.be.true;
        });

        it('should trigger summarization before request when budget is exceeded', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(CHAT_TOKEN_THRESHOLD + 1000);
            mockSummarizationService.triggerSummarization.resolves(undefined);

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            // Model returns response without tool calls
            const mockStream = createMockStream([{ content: 'Response' }]);
            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            // Consume stream to trigger the actual request
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _part of (response as LanguageModelStreamResponse).stream) {
                // just consume
            }

            // Summarization should be triggered before the request since budget is exceeded
            expect(mockSummarizationService.triggerSummarization.calledOnce).to.be.true;
            expect(mockSummarizationService.triggerSummarization.calledWith('session-1')).to.be.true;
        });

        it('should preserve original messages (no message rebuilding)', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100); // Below threshold

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [
                    { actor: 'system', type: 'text', text: 'System prompt' },
                    { actor: 'user', type: 'text', text: 'Hello' }
                ],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            const mockStream = createMockStream([{ content: 'Response' }]);
            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);

            // Consume stream to trigger the actual request
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _part of (response as LanguageModelStreamResponse).stream) {
                // just consume
            }

            // Verify original messages are preserved
            expect(mockLanguageModel.request.calledOnce).to.be.true;
            const actualRequest = mockLanguageModel.request.firstCall.args[0] as UserRequest;
            expect(actualRequest.messages).to.have.length(2);
            expect((actualRequest.messages[0] as { text: string }).text).to.equal('System prompt');
            expect((actualRequest.messages[1] as { text: string }).text).to.equal('Hello');
        });
    });

    describe('tool loop handling', () => {
        it('should execute tools and continue loop when model respects singleRoundTrip', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100);

            const toolHandler = sinon.stub().resolves('tool result');
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{
                    id: 'tool-1',
                    name: 'test-tool',
                    parameters: { type: 'object', properties: {} },
                    handler: toolHandler
                }]
            };

            // First call: model returns tool call without result (respected singleRoundTrip)
            const firstStream = createMockStream([
                { content: 'Let me use a tool' },
                { tool_calls: [{ id: 'call-1', function: { name: 'test-tool', arguments: '{}' }, finished: true }] }
            ]);

            // Second call: model returns final response
            const secondStream = createMockStream([
                { content: 'Done!' }
            ]);

            mockLanguageModel.request
                .onFirstCall().resolves({ stream: firstStream })
                .onSecondCall().resolves({ stream: secondStream });

            const response = await service.sendRequest(mockLanguageModel, request);
            expect(isLanguageModelStreamResponse(response)).to.be.true;

            // Consume the stream to trigger the tool loop
            const parts: LanguageModelStreamResponsePart[] = [];
            for await (const part of (response as LanguageModelStreamResponse).stream) {
                parts.push(part);
            }

            // Verify tool was executed
            expect(toolHandler.calledOnce).to.be.true;

            // Verify two LLM calls were made (initial + continuation)
            expect(mockLanguageModel.request.calledTwice).to.be.true;
        });

        it('should not execute tools when model ignores singleRoundTrip (has results)', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100);

            const toolHandler = sinon.stub().resolves('tool result');
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{
                    id: 'tool-1',
                    name: 'test-tool',
                    parameters: { type: 'object', properties: {} },
                    handler: toolHandler
                }]
            };

            // Model returns tool call WITH result (ignored singleRoundTrip, handled internally)
            const mockStream = createMockStream([
                { content: 'Let me use a tool' },
                { tool_calls: [{ id: 'call-1', function: { name: 'test-tool', arguments: '{}' }, finished: true, result: 'internal result' }] },
                { content: 'Done!' }
            ]);

            mockLanguageModel.request.resolves({ stream: mockStream });

            const response = await service.sendRequest(mockLanguageModel, request);
            expect(isLanguageModelStreamResponse(response)).to.be.true;

            // Consume the stream
            const parts: LanguageModelStreamResponsePart[] = [];
            for await (const part of (response as LanguageModelStreamResponse).stream) {
                parts.push(part);
            }

            // Tool should NOT have been executed by our service (model did it)
            expect(toolHandler.called).to.be.false;

            // Only one LLM call (model handled everything)
            expect(mockLanguageModel.request.calledOnce).to.be.true;
        });
    });

    describe('error handling', () => {
        it('should log context-too-long errors and re-throw', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100);

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            const contextError = new Error('Request too long: context exceeds maximum token limit');
            mockLanguageModel.request.rejects(contextError);

            const response = await service.sendRequest(mockLanguageModel, request);
            expect(isLanguageModelStreamResponse(response)).to.be.true;

            // Consuming the stream should throw
            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for await (const _part of (response as LanguageModelStreamResponse).stream) {
                    // Should throw before we get here
                }
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.equal(contextError);
                expect(mockLogger.error.calledOnce).to.be.true;
                expect(mockLogger.error.firstCall.args[0]).to.include('Context too long');
            }
        });

        it('should propagate non-context errors without special logging', async () => {
            mockPreferenceService.get.withArgs(BUDGET_AWARE_TOOL_LOOP_PREF, false).returns(true);
            mockTokenTracker.getSessionInputTokens.returns(100);

            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'Hello' }],
                tools: [{ id: 'tool-1', name: 'test-tool', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
            };

            const networkError = new Error('Network connection failed');
            mockLanguageModel.request.rejects(networkError);

            const response = await service.sendRequest(mockLanguageModel, request);

            try {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for await (const _part of (response as LanguageModelStreamResponse).stream) {
                    // Should throw
                }
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error).to.equal(networkError);
                // Should not have logged "Context too long" message
                expect(mockLogger.error.called).to.be.false;
            }
        });
    });
});

/**
 * Helper to create a mock async iterable stream from an array of parts.
 */
function createMockStream(parts: LanguageModelStreamResponsePart[]): AsyncIterable<LanguageModelStreamResponsePart> {
    return {
        async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
            for (const part of parts) {
                yield part;
            }
        }
    };
}
