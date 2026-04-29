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
import { AnthropicModel, DEFAULT_MAX_TOKENS, addCacheControlToLastMessage, mergeConsecutiveSameRoleMessages } from './anthropic-language-model';
import { isUsageResponsePart, LanguageModelRequest, LanguageModelStreamResponsePart, ReasoningApi, ReasoningSupport, UserRequest } from '@theia/ai-core';
import type { Anthropic } from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';

const REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

/** Test helper that exposes the otherwise protected getSettings() method. */
class TestableAnthropicModel extends AnthropicModel {
    public callGetSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return this.getSettings(request);
    }
}

function createReasoningModel(
    modelId: string, reasoningApi: ReasoningApi, supportsXHighEffort: boolean = false
): TestableAnthropicModel {
    return new TestableAnthropicModel(
        'test-id', modelId, { status: 'ready' }, true, false,
        () => 'test-key', undefined, DEFAULT_MAX_TOKENS,
        3, undefined, REASONING_SUPPORT, reasoningApi, supportsXHighEffort
    );
}

function createNonReasoningModel(modelId: string): TestableAnthropicModel {
    return new TestableAnthropicModel(
        'test-id', modelId, { status: 'ready' }, true, false,
        () => 'test-key', undefined, DEFAULT_MAX_TOKENS
    );
}

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

    describe('mergeConsecutiveSameRoleMessages', () => {
        it('should merge an assistant text message followed by an assistant tool_use into a single message', () => {
            const messages: MessageParam[] = [
                { role: 'user', content: [{ type: 'text', text: 'do something' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'let me call a tool' }] },
                { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'foo', input: { x: 1 } }] }
            ];
            const result = mergeConsecutiveSameRoleMessages(messages);
            expect(result).to.deep.equal([
                { role: 'user', content: [{ type: 'text', text: 'do something' }] },
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: 'let me call a tool' },
                        { type: 'tool_use', id: 'call_1', name: 'foo', input: { x: 1 } }
                    ]
                }
            ]);
        });

        it('should merge consecutive user messages with parallel tool_results into a single user message', () => {
            const messages: MessageParam[] = [
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'r1' }] },
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_2', content: 'r2' }] }
            ];
            const result = mergeConsecutiveSameRoleMessages(messages);
            expect(result).to.deep.equal([
                {
                    role: 'user',
                    content: [
                        { type: 'tool_result', tool_use_id: 'call_1', content: 'r1' },
                        { type: 'tool_result', tool_use_id: 'call_2', content: 'r2' }
                    ]
                }
            ]);
        });

        it('should reproduce the bug scenario from issue #17104 (text+tool_use after a tool_result round-trip)', () => {
            const messages: MessageParam[] = [
                { role: 'user', content: [{ type: 'text', text: 'first request' }] },
                { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'foo', input: {} }] },
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'r1' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'follow-up reasoning' }] },
                { role: 'assistant', content: [{ type: 'tool_use', id: 'call_2', name: 'bar', input: {} }] }
            ];
            const result = mergeConsecutiveSameRoleMessages(messages);
            // Sanity check: roles must strictly alternate after merging.
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].role).to.not.equal(result[i].role);
            }
            expect(result).to.have.lengthOf(4);
            expect(result[3].content).to.deep.equal([
                { type: 'text', text: 'follow-up reasoning' },
                { type: 'tool_use', id: 'call_2', name: 'bar', input: {} }
            ]);
        });

        it('should leave alternating messages unchanged', () => {
            const messages: MessageParam[] = [
                { role: 'user', content: [{ type: 'text', text: 'a' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
                { role: 'user', content: [{ type: 'text', text: 'c' }] }
            ];
            const result = mergeConsecutiveSameRoleMessages(messages);
            expect(result).to.deep.equal(messages);
        });

        it('should normalize string content to a text block when merging', () => {
            const messages: MessageParam[] = [
                { role: 'assistant', content: 'hello' },
                { role: 'assistant', content: [{ type: 'text', text: 'world' }] }
            ];
            const result = mergeConsecutiveSameRoleMessages(messages);
            expect(result).to.deep.equal([
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: 'hello' },
                        { type: 'text', text: 'world' }
                    ]
                }
            ]);
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

    describe('getSettings effort API (adaptive thinking)', () => {
        it('maps level=minimal to effort=low', () => {
            const model = createReasoningModel('claude-opus-4-6', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } });
            expect(result.thinking).to.deep.equal({ type: 'adaptive' });
            expect(result.output_config).to.deep.equal({ effort: 'low' });
        });
        it('maps level=low to effort=medium', () => {
            const model = createReasoningModel('claude-opus-4-6', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'low' } });
            expect(result.output_config).to.deep.equal({ effort: 'medium' });
        });
        it('maps level=medium to effort=high on models without xhigh', () => {
            const model = createReasoningModel('claude-opus-4-6', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } });
            expect(result.output_config).to.deep.equal({ effort: 'high' });
        });
        it('maps level=medium to effort=xhigh on models that support xhigh (Opus 4.7)', () => {
            const model = createReasoningModel('claude-opus-4-7', 'effort', true);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } });
            expect(result.output_config).to.deep.equal({ effort: 'xhigh' });
        });
        it('maps level=high to effort=max', () => {
            const model = createReasoningModel('claude-opus-4-6', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } });
            expect(result.output_config).to.deep.equal({ effort: 'max' });
        });
        it('omits output_config on level=auto so the provider default applies', () => {
            const model = createReasoningModel('claude-opus-4-6', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } });
            expect(result.thinking).to.deep.equal({ type: 'adaptive' });
            expect(result.output_config).to.equal(undefined);
        });
        it('omits thinking entirely when level=off', () => {
            const model = createReasoningModel('claude-opus-4-7', 'effort', true);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } });
            expect(result.thinking).to.equal(undefined);
        });
    });

    describe('getSettings budget API (legacy extended thinking)', () => {
        it('emits thinking.type="enabled" with budget_tokens for level=medium', () => {
            const model = createReasoningModel('claude-sonnet-4-20250514', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } });
            expect(result.thinking).to.deep.equal({ type: 'enabled', budget_tokens: 16000 });
        });
        it('enforces Anthropic 1024 minimum budget for level=minimal', () => {
            const model = createReasoningModel('claude-sonnet-4-20250514', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } });
            expect(result.thinking).to.deep.equal({ type: 'enabled', budget_tokens: 1024 });
        });
        it('uses a positive budget for level=high', () => {
            const model = createReasoningModel('claude-sonnet-4-20250514', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } });
            const thinking = result.thinking as { type: string, budget_tokens: number };
            expect(thinking.type).to.equal('enabled');
            expect(thinking.budget_tokens).to.be.greaterThan(16000);
        });
        it('omits thinking entirely when level=off', () => {
            const model = createReasoningModel('claude-sonnet-4-20250514', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } });
            expect(result.thinking).to.equal(undefined);
        });
    });

    describe('non-reasoning models', () => {
        it('ignores reasoning settings when the model has no reasoningSupport', () => {
            const model = createNonReasoningModel('claude-3-5-sonnet-20241022');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } });
            expect(result.thinking).to.equal(undefined);
        });
    });
});
