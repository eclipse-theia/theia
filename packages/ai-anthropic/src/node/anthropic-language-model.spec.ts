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
import { AnthropicModel, DEFAULT_MAX_TOKENS, addCacheControlToLastMessage } from './anthropic-language-model';
import { isUsageResponsePart, LanguageModelStreamResponsePart, UserRequest } from '@theia/ai-core';
import type { Anthropic } from '@anthropic-ai/sdk';

describe('AnthropicModel', () => {

    describe('constructor', () => {
        it('should set default maxRetries to 3 when not provided', () => {
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                {
                    status: 'ready'
                },
                true,
                true,
                () => 'test-api-key',
                undefined,
                DEFAULT_MAX_TOKENS
            );

            expect(model.maxRetries).to.equal(3);
        });

        it('should set custom maxRetries when provided', () => {
            const customMaxRetries = 5;
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                {
                    status: 'ready'
                },
                true,
                true,
                () => 'test-api-key',
                undefined,
                DEFAULT_MAX_TOKENS,
                customMaxRetries
            );

            expect(model.maxRetries).to.equal(customMaxRetries);
        });

        it('should preserve all other constructor parameters', () => {
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                {
                    status: 'ready'
                },
                true,
                true,
                () => 'test-api-key',
                undefined,
                DEFAULT_MAX_TOKENS,
                5
            );

            expect(model.id).to.equal('test-id');
            expect(model.model).to.equal('claude-3-opus-20240229');
            expect(model.enableStreaming).to.be.true;
            expect(model.maxTokens).to.equal(DEFAULT_MAX_TOKENS);
            expect(model.maxRetries).to.equal(5);
        });

        it('should set custom url when provided', () => {
            const model = new AnthropicModel(
                'test-id',
                'claude-3-opus-20240229',
                {
                    status: 'ready'
                },
                true,
                true,
                () => 'test-api-key',
                'custom-url',
                DEFAULT_MAX_TOKENS,
                5
            );

            expect(model.url).to.equal('custom-url');
        });
    });

    describe('addCacheControlToLastMessage', () => {
        it('should preserve all content blocks when adding cache control to parallel tool calls', () => {
            const messages = [
                {
                    role: 'user' as const,
                    content: [
                        { type: 'tool_result' as const, tool_use_id: 'tool1', content: 'result1' },
                        { type: 'tool_result' as const, tool_use_id: 'tool2', content: 'result2' },
                        { type: 'tool_result' as const, tool_use_id: 'tool3', content: 'result3' }
                    ]
                }
            ];

            const result = addCacheControlToLastMessage(messages);

            expect(result).to.have.lengthOf(1);
            expect(result[0].content).to.be.an('array').with.lengthOf(3);
            expect(result[0].content[0]).to.deep.equal({ type: 'tool_result', tool_use_id: 'tool1', content: 'result1' });
            expect(result[0].content[1]).to.deep.equal({ type: 'tool_result', tool_use_id: 'tool2', content: 'result2' });
            expect(result[0].content[2]).to.deep.equal({
                type: 'tool_result',
                tool_use_id: 'tool3',
                content: 'result3',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should add cache control to last non-thinking block in mixed content', () => {
            const messages = [
                {
                    role: 'assistant' as const,
                    content: [
                        { type: 'text' as const, text: 'Some text' },
                        { type: 'tool_use' as const, id: 'tool1', name: 'getTool', input: {} },
                        { type: 'thinking' as const, thinking: 'thinking content', signature: 'signature' }
                    ]
                }
            ];

            const result = addCacheControlToLastMessage(messages);

            expect(result).to.have.lengthOf(1);
            expect(result[0].content).to.be.an('array').with.lengthOf(3);
            expect(result[0].content[0]).to.deep.equal({ type: 'text', text: 'Some text' });
            expect(result[0].content[1]).to.deep.equal({
                type: 'tool_use',
                id: 'tool1',
                name: 'getTool',
                input: {},
                cache_control: { type: 'ephemeral' }
            });
            expect(result[0].content[2]).to.deep.equal({ type: 'thinking', thinking: 'thinking content', signature: 'signature' });
        });

        it('should handle string content by converting to content block', () => {
            const messages = [
                {
                    role: 'user' as const,
                    content: 'Simple text message'
                }
            ];

            const result = addCacheControlToLastMessage(messages);

            expect(result).to.have.lengthOf(1);
            expect(result[0].content).to.be.an('array').with.lengthOf(1);
            expect(result[0].content[0]).to.deep.equal({
                type: 'text',
                text: 'Simple text message',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should not modify original messages', () => {
            const originalMessages = [
                {
                    role: 'user' as const,
                    content: [
                        { type: 'tool_result' as const, tool_use_id: 'tool1', content: 'result1' }
                    ]
                }
            ];

            addCacheControlToLastMessage(originalMessages);

            expect(originalMessages[0].content[0]).to.not.have.property('cache_control');
        });
    });

    describe('streaming token usage', () => {
        /**
         * Builds a mock Anthropic client whose messages.stream() yields
         * the supplied raw Anthropic-format event objects. This lets the real
         * translation logic inside handleStreamingRequest run unchanged.
         */
        function buildMockAnthropic(anthropicEvents: object[]): Anthropic {
            return {
                messages: {
                    stream: (_params: object) => {
                        async function* iterate(): AsyncGenerator<object> {
                            for (const event of anthropicEvents) {
                                yield event;
                            }
                        }
                        const iter = iterate();
                        (iter as unknown as Record<string, unknown>).on = () => { /* no-op */ };
                        (iter as unknown as Record<string, unknown>).abort = () => { /* no-op */ };
                        return iter;
                    }
                }
            } as unknown as Anthropic;
        }

        function createModel(anthropicEventsByCall: object[][]): AnthropicModel {
            let callIndex = 0;
            return new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    const events = anthropicEventsByCall[Math.min(callIndex++, anthropicEventsByCall.length - 1)];
                    return buildMockAnthropic(events);
                }
            }(
                'test-id', 'claude-opus-4-5', { status: 'ready' },
                true, false, () => 'test-key', undefined
            );
        }

        async function collectStreamParts(model: AnthropicModel, text: string): Promise<LanguageModelStreamResponsePart[]> {
            const request: UserRequest = {
                messages: [{ actor: 'user', type: 'text', text }],
                agentId: 'test',
                sessionId: 'test-session',
                requestId: 'test-req'
            };
            const response = await model.request(request);
            const parts: LanguageModelStreamResponsePart[] = [];
            if ('stream' in response) {
                for await (const part of response.stream) {
                    parts.push(part);
                }
            }
            return parts;
        }

        it('should yield output_tokens from message_stop only', async () => {
            // The real Anthropic API always sends output_tokens=0 in message_start.
            // The actual count arrives in message_delta.usage.output_tokens.
            // Only one UsageResponsePart is emitted: at message_stop.
            const events = [
                { type: 'message_start', message: { usage: { input_tokens: 1000, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } },
                { type: 'message_stop' },
            ];

            const parts = await collectStreamParts(createModel([events]), 'hi');
            const usageParts = parts.filter(isUsageResponsePart);

            // Only message_stop yields a usage part
            expect(usageParts).to.have.lengthOf(1);
            expect(usageParts[0].input_tokens).to.equal(1000);
            expect(usageParts[0].output_tokens).to.equal(42);
        });

        it('should report cache_creation_input_tokens when present', async () => {
            // Simulates reading a large file for the first time — most tokens go to cache_creation
            const events = [
                {
                    type: 'message_start',
                    message: {
                        usage: {
                            input_tokens: 500,
                            output_tokens: 0,
                            cache_creation_input_tokens: 55000,
                            cache_read_input_tokens: undefined
                        }
                    }
                },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Summary' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 150 } },
                { type: 'message_stop' },
            ];

            const parts = await collectStreamParts(createModel([events]), 'Summarize');
            const usageParts = parts.filter(isUsageResponsePart);

            // Only message_stop yields a usage part
            expect(usageParts).to.have.lengthOf(1);
            expect(usageParts[0].input_tokens).to.equal(500);
            expect(usageParts[0].output_tokens).to.equal(150);
            expect(usageParts[0].cache_creation_input_tokens).to.equal(55000);
        });

        it('should report per-turn tokens without accumulation across turns', async () => {
            // Within a single stream, two message_start/message_delta/message_stop sequences
            // appear back-to-back. Each turn yields its own per-turn values.
            const bothTurnsInOneStream = [
                // Turn 1: input=1000, output=20
                { type: 'message_start', message: { usage: { input_tokens: 1000, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
                { type: 'message_stop' },
                // Turn 2: input=5000, output=80
                { type: 'message_start', message: { usage: { input_tokens: 5000, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Final answer' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 80 } },
                { type: 'message_stop' },
            ];

            const parts = await collectStreamParts(createModel([bothTurnsInOneStream]), 'hi');
            const usageParts = parts.filter(isUsageResponsePart);

            // Each turn emits one usage part at message_stop = 2 total
            expect(usageParts).to.have.lengthOf(2);

            // Turn 1: per-turn values only
            expect(usageParts[0].input_tokens).to.equal(1000);
            expect(usageParts[0].output_tokens).to.equal(20);

            // Turn 2: per-turn values only (not accumulated)
            expect(usageParts[1].input_tokens).to.equal(5000);
            expect(usageParts[1].output_tokens).to.equal(80);
        });

        it('should yield partial usage when stream is aborted before message_stop', async () => {
            // Simulates a user cancellation: message_start fires (giving input_tokens),
            // some content streams, message_delta gives output_tokens, then the stream
            // is aborted before message_stop. The partial usage should still be yielded.
            const abortError = new Error('Stream aborted');
            function buildAbortingAnthropic(streamEvents: object[], abortAfterIndex: number): Anthropic {
                return {
                    messages: {
                        stream: (_params: object) => {
                            async function* iterate(): AsyncGenerator<object> {
                                for (let i = 0; i < streamEvents.length; i++) {
                                    if (i === abortAfterIndex) {
                                        throw abortError;
                                    }
                                    yield streamEvents[i];
                                }
                            }
                            const iter = iterate();
                            (iter as unknown as Record<string, unknown>).on = () => { /* no-op */ };
                            (iter as unknown as Record<string, unknown>).abort = () => { /* no-op */ };
                            return iter;
                        }
                    }
                } as unknown as Anthropic;
            }

            const events = [
                { type: 'message_start', message: { usage: { input_tokens: 2000, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
                { type: 'message_delta', delta: { stop_reason: undefined }, usage: { output_tokens: 15 } },
                // Abort happens here (index 4) — before message_stop
                { type: 'message_stop' },
            ];

            const model = new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    return buildAbortingAnthropic(events, 4);
                }
            }(
                'test-id', 'claude-opus-4-5', { status: 'ready' },
                true, false, () => 'test-key', undefined
            );

            const request: UserRequest = {
                messages: [{ actor: 'user', type: 'text', text: 'hi' }],
                agentId: 'test',
                sessionId: 'test-session',
                requestId: 'test-req'
            };
            const response = await model.request(request);
            const parts: LanguageModelStreamResponsePart[] = [];
            let caughtError: Error | undefined;
            if ('stream' in response) {
                try {
                    for await (const part of response.stream) {
                        parts.push(part);
                    }
                } catch (e) {
                    caughtError = e as Error;
                }
            }

            // The abort error should propagate
            expect(caughtError).to.equal(abortError);

            // But partial usage should have been yielded in the finally block
            const usageParts = parts.filter(isUsageResponsePart);
            expect(usageParts).to.have.lengthOf(1);
            expect(usageParts[0].input_tokens).to.equal(2000);
            expect(usageParts[0].output_tokens).to.equal(15);
        });

        it('should only yield usage at message_stop, not at message_delta', async () => {
            // Usage is only emitted at message_stop for per-turn recording.
            const events = [
                { type: 'message_start', message: { usage: { input_tokens: 800, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 55 } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_stop' },
            ];

            const parts = await collectStreamParts(createModel([events]), 'go');
            const usageParts = parts.filter(isUsageResponsePart);

            // Only one usage part from message_stop
            expect(usageParts).to.have.lengthOf(1);
            expect(usageParts[0].input_tokens).to.equal(800);
            expect(usageParts[0].output_tokens).to.equal(55);
        });
    });
});
