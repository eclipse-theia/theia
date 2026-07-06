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
import {
    ANTHROPIC_RESULT_BLOCK_DATA_KEY, AnthropicModel, DEFAULT_MAX_TOKENS, addCacheControlToLastMessage,
    mergeConsecutiveSameRoleMessages, transformToAnthropicParams
} from './anthropic-language-model';
import {
    CompactionMessage, isServerToolCallResponsePart, isUsageResponsePart, LanguageModelMessage, LanguageModelRequest,
    LanguageModelStreamResponsePart, ReasoningApi, ReasoningSupport, UserRequest
} from '@theia/ai-core';
import type { Anthropic } from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';

const REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

/** Test helper that exposes the otherwise protected getSettings(), createTools(), applyCompactionParams(), and computeServerSideCompactionSupport() methods. */
class TestableAnthropicModel extends AnthropicModel {
    public callGetSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return this.getSettings(request);
    }
    public callCreateTools(request: LanguageModelRequest): Anthropic.Messages.ToolUnion[] | undefined {
        return this.createTools(request);
    }
    public callApplyCompactionParams<T extends Anthropic.MessageCreateParams>(params: T, request: LanguageModelRequest): T {
        return this.applyCompactionParams(params, request);
    }
    public callComputeServerSideCompactionSupport(): boolean {
        return this.computeServerSideCompactionSupport();
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

        it('exposes the anthropic vendor (used to key server tool selections and the capabilities UI)', () => {
            const model = createNonReasoningModel('claude-opus-4-5');
            expect(model.vendor).to.equal('anthropic');
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
            expect(result.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
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
            expect(result.thinking).to.deep.equal({ type: 'adaptive', display: 'summarized' });
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

    describe('server tools', () => {
        it('createTools injects native params only for enabled server tool ids', () => {
            const model = createNonReasoningModel('claude-opus-4-5');
            const tools = model.callCreateTools({ messages: [], tools: [], serverTools: ['web_fetch', 'web_search'] });
            expect(tools).to.deep.include({ type: 'web_fetch_20250910', name: 'web_fetch' });
            expect(tools).to.deep.include({ type: 'web_search_20250305', name: 'web_search' });
        });

        it('createTools omits server tools that are not enabled', () => {
            const model = createNonReasoningModel('claude-opus-4-5');
            const tools = model.callCreateTools({ messages: [], tools: [], serverTools: ['web_fetch'] });
            expect(tools?.some(tool => 'type' in tool && tool.type === 'web_fetch_20250910')).to.be.true;
            expect(tools?.some(tool => 'type' in tool && tool.type === 'web_search_20250305')).to.be.false;
        });

        it('createTools returns undefined when neither client nor server tools are present', () => {
            const model = createNonReasoningModel('claude-opus-4-5');
            expect(model.callCreateTools({ messages: [], tools: [] })).to.equal(undefined);
        });

        it('surfaces a finished server tool call from server_tool_use + web_fetch_tool_result blocks', async () => {
            const resultContent = { type: 'web_fetch_result', url: 'https://example.com', content: { type: 'document' } };
            const events = [
                { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srv-1', name: 'web_fetch', input: {} } },
                { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"url":"https://example.com"}' } },
                { type: 'content_block_stop', index: 0 },
                { type: 'content_block_start', index: 1, content_block: { type: 'web_fetch_tool_result', tool_use_id: 'srv-1', content: resultContent } },
                { type: 'content_block_stop', index: 1 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
                { type: 'message_stop' },
            ];

            const model = new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    return buildMockAnthropicStream(events);
                }
            }('test-id', 'claude-opus-4-5', { status: 'ready' }, true, false, () => 'test-key', undefined);

            const parts = await collectParts(model, 'fetch https://example.com');
            const serverParts = parts.filter(isServerToolCallResponsePart);
            const finished = serverParts.flatMap(p => p.server_tool_calls).find(c => c.finished);

            expect(finished).to.not.be.undefined;
            expect(finished!.id).to.equal('srv-1');
            expect(finished!.name).to.equal('web_fetch');
            expect(finished!.arguments).to.equal('{"url":"https://example.com"}');
            // The result is a compact, human-readable summary for rendering...
            expect(finished!.result).to.deep.equal({ content: [{ type: 'text', text: 'Fetched https://example.com' }] });
            // ...while the raw provider block is preserved on `data` for faithful replay.
            expect(JSON.parse(finished!.data![ANTHROPIC_RESULT_BLOCK_DATA_KEY])).to.deep.equal(resultContent);
        });

        it('reconstructs the server tool blocks from a ServerToolUseMessage on replay', async () => {
            let capturedParams: Anthropic.MessageCreateParams | undefined;
            const model = new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    return {
                        messages: {
                            stream: (params: Anthropic.MessageCreateParams) => {
                                capturedParams = params;
                                async function* iterate(): AsyncGenerator<object> { /* no events */ }
                                const iter = iterate();
                                (iter as unknown as Record<string, unknown>).on = () => { /* no-op */ };
                                (iter as unknown as Record<string, unknown>).abort = () => { /* no-op */ };
                                return iter;
                            }
                        }
                    } as unknown as Anthropic;
                }
            }('test-id', 'claude-opus-4-5', { status: 'ready' }, true, false, () => 'test-key', undefined);

            const rawBlock = { type: 'web_fetch_result', url: 'https://example.com', content: { type: 'document', title: 'Example' } };
            const request: UserRequest = {
                messages: [
                    { actor: 'user', type: 'text', text: 'hi' },
                    {
                        actor: 'ai', type: 'server_tool_use', id: 'srv-1', name: 'web_fetch',
                        input: { url: 'https://example.com' },
                        // The renderable summary lives on result; the faithful raw block lives on data.
                        result: { content: [{ type: 'text', text: 'Fetched https://example.com' }] },
                        data: { [ANTHROPIC_RESULT_BLOCK_DATA_KEY]: JSON.stringify(rawBlock) }
                    }
                ],
                agentId: 'test', sessionId: 'session', requestId: 'req'
            };
            const response = await model.request(request);
            if ('stream' in response) {
                // drain to ensure stream() is invoked
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for await (const _part of response.stream) { /* no-op */ }
            }

            const allBlocks = (capturedParams?.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : []);
            expect(allBlocks.some(b => b.type === 'server_tool_use' && b.id === 'srv-1')).to.be.true;
            const resultBlock = allBlocks.find(b => b.type === 'web_fetch_tool_result' && b.tool_use_id === 'srv-1');
            expect(resultBlock).to.not.be.undefined;
            // The raw block from `data` is reconstructed faithfully (not the rendering summary).
            expect((resultBlock as { content: unknown }).content).to.deep.equal(rawBlock);
        });

        it('surfaces the deferred tool search as a running then finished server tool call', async () => {
            const events = [
                { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'ts-1', name: 'tool_search_tool_bm25', input: {} } },
                { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"file"}' } },
                { type: 'content_block_stop', index: 0 },
                {
                    type: 'content_block_start', index: 1,
                    content_block: {
                        type: 'tool_search_tool_result', tool_use_id: 'ts-1',
                        content: { type: 'tool_search_tool_search_result', tool_references: [{}, {}] }
                    }
                },
                { type: 'content_block_stop', index: 1 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
                { type: 'message_stop' },
            ];

            const model = new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    return buildMockAnthropicStream(events);
                }
            }('test-id', 'claude-opus-4-5', { status: 'ready' }, true, false, () => 'test-key', undefined);

            const parts = await collectParts(model, 'do something requiring a deferred tool');
            const calls = parts.filter(isServerToolCallResponsePart).flatMap(p => p.server_tool_calls);

            // The native `tool_search_tool_bm25` invocation is surfaced under the stable, user-facing name.
            const running = calls.find(c => !c.finished && c.name === 'tool_search');
            expect(running).to.not.be.undefined;
            expect(running!.id).to.equal('ts-1');

            const finished = calls.find(c => c.finished);
            expect(finished).to.not.be.undefined;
            expect(finished!.id).to.equal('ts-1');
            expect(finished!.name).to.equal('tool_search');
            expect(finished!.arguments).to.equal('{"query":"file"}');
            expect(finished!.result).to.deep.equal({ content: [{ type: 'text', text: 'Found 2 tools.' }] });
        });

        it('drops the deferred tool search server tool use message on replay', async () => {
            let capturedParams: Anthropic.MessageCreateParams | undefined;
            const model = new class extends AnthropicModel {
                protected override initializeAnthropic(): Anthropic {
                    return {
                        messages: {
                            stream: (params: Anthropic.MessageCreateParams) => {
                                capturedParams = params;
                                async function* iterate(): AsyncGenerator<object> { /* no events */ }
                                const iter = iterate();
                                (iter as unknown as Record<string, unknown>).on = () => { /* no-op */ };
                                (iter as unknown as Record<string, unknown>).abort = () => { /* no-op */ };
                                return iter;
                            }
                        }
                    } as unknown as Anthropic;
                }
            }('test-id', 'claude-opus-4-5', { status: 'ready' }, true, false, () => 'test-key', undefined);

            const request: UserRequest = {
                messages: [
                    { actor: 'user', type: 'text', text: 'hi' },
                    {
                        actor: 'ai', type: 'server_tool_use', id: 'ts-1', name: 'tool_search',
                        input: { query: 'file' },
                        result: { content: [{ type: 'text', text: 'Found 2 tools.' }] }
                    }
                ],
                agentId: 'test', sessionId: 'session', requestId: 'req'
            };
            const response = await model.request(request);
            if ('stream' in response) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for await (const _part of response.stream) { /* no-op */ }
            }

            const allBlocks = (capturedParams?.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : []);
            expect(allBlocks.some(b => b.type === 'server_tool_use')).to.be.false;
        });
    });

    describe('server-side compaction', () => {

        function textMessage(text: string, actor: 'user' | 'ai' = 'user'): LanguageModelMessage {
            return { actor, type: 'text', text, query: text } as unknown as LanguageModelMessage;
        }

        function compactionMessage(provider: string): CompactionMessage {
            return {
                actor: 'ai',
                type: 'compaction',
                provider,
                data: { content: 'summary of earlier turns', encrypted_content: 'opaque-blob' },
                summary: 'summary of earlier turns'
            };
        }

        function findCompactionBlock(messages: Anthropic.Messages.MessageParam[]): { type: string; content: unknown; encrypted_content: unknown } | undefined {
            for (const message of messages) {
                if (Array.isArray(message.content)) {
                    for (const block of message.content) {
                        if ((block as { type?: string }).type === 'compaction') {
                            return block as unknown as { type: string; content: unknown; encrypted_content: unknown };
                        }
                    }
                }
            }
            return undefined;
        }

        function createCompactionModel(serverSideCompactionEnabledByDefault: boolean): TestableAnthropicModel {
            return new TestableAnthropicModel(
                'test-id', 'claude-opus-4-6', { status: 'ready' }, true, false, () => 'test-key', undefined,
                DEFAULT_MAX_TOKENS, 3, undefined, undefined, undefined, undefined, undefined, undefined, serverSideCompactionEnabledByDefault
            );
        }

        describe('transformToAnthropicParams', () => {
            it('emits a compaction block for an anthropic compaction message when compaction is enabled, retaining surrounding messages', () => {
                const messages: LanguageModelMessage[] = [textMessage('first user turn'), compactionMessage('anthropic'), textMessage('second user turn')];

                const { messages: result } = transformToAnthropicParams(messages, false, true);

                const compactionBlock = findCompactionBlock(result);
                expect(compactionBlock, 'compaction block present').to.not.equal(undefined);
                expect(compactionBlock!.content).to.equal('summary of earlier turns');
                expect(compactionBlock!.encrypted_content).to.equal('opaque-blob');

                const flattened = JSON.stringify(result);
                expect(flattened).to.contain('first user turn');
                expect(flattened).to.contain('second user turn');
            });

            it('omits the compaction block when compaction is disabled, retaining surrounding messages', () => {
                const messages: LanguageModelMessage[] = [textMessage('first user turn'), compactionMessage('anthropic'), textMessage('second user turn')];

                const { messages: result } = transformToAnthropicParams(messages, false, false);

                expect(findCompactionBlock(result), 'no compaction block').to.equal(undefined);
                const flattened = JSON.stringify(result);
                expect(flattened).to.contain('first user turn');
                expect(flattened).to.contain('second user turn');
            });

            it('skips a foreign-provider compaction message even when compaction is enabled', () => {
                const messages: LanguageModelMessage[] = [textMessage('first user turn'), compactionMessage('openai-responses'), textMessage('second user turn')];

                const { messages: result } = transformToAnthropicParams(messages, false, true);

                expect(findCompactionBlock(result), 'no compaction block for foreign provider').to.equal(undefined);
                const flattened = JSON.stringify(result);
                expect(flattened).to.contain('first user turn');
                expect(flattened).to.contain('second user turn');
            });
        });

        describe('applyCompactionParams', () => {
            function baseParams(): Anthropic.MessageCreateParams {
                return { max_tokens: DEFAULT_MAX_TOKENS, model: 'claude-opus-4-6', messages: [] };
            }

            it('adds the beta flag and context_management when compaction is enabled by default (capable model)', () => {
                // claude-opus-4-6 is capable; serverSideCompactionEnabledByDefault=true, no session override.
                const model = createCompactionModel(true);
                const params = model.callApplyCompactionParams(baseParams(), {
                    messages: []
                });
                const beta = params as Anthropic.MessageCreateParams & Anthropic.Beta.Messages.MessageCreateParams;

                expect(beta.betas).to.deep.equal(['compact-2026-01-12']);
                expect(beta.context_management).to.deep.equal({ edits: [{ type: 'compact_20260112' }] });
            });

            it('leaves params unchanged when compaction is disabled by default', () => {
                const model = createCompactionModel(false);
                const params = model.callApplyCompactionParams(baseParams(), {
                    messages: []
                });
                const beta = params as Anthropic.MessageCreateParams & Partial<Anthropic.Beta.Messages.MessageCreateParams>;

                expect(beta.betas).to.equal(undefined);
                expect(beta.context_management).to.equal(undefined);
            });

            it('session enables compaction over a false default (capable model)', () => {
                const model = createCompactionModel(false);

                const enabled = model.callApplyCompactionParams(baseParams(), {
                    messages: [],
                    compaction: { enabled: true }
                }) as Anthropic.MessageCreateParams & Partial<Anthropic.Beta.Messages.MessageCreateParams>;
                expect(enabled.betas).to.deep.equal(['compact-2026-01-12']);
            });

            it('session disables compaction over a true default', () => {
                const model = createCompactionModel(true);

                // compaction.enabled=false wins even when serverSideCompactionEnabledByDefault is true
                const forcedOff = model.callApplyCompactionParams(baseParams(), {
                    messages: [],
                    compaction: { enabled: false }
                }) as Anthropic.MessageCreateParams & Partial<Anthropic.Beta.Messages.MessageCreateParams>;
                expect(forcedOff.betas).to.equal(undefined);
            });

            it('leaves params unchanged when the model is incapable (e.g. claude-haiku-4-5), regardless of activation', () => {
                const incapableModel = new TestableAnthropicModel(
                    'test-id', 'claude-haiku-4-5', { status: 'ready' }, true, false, () => 'test-key', undefined,
                    DEFAULT_MAX_TOKENS, 3, undefined, undefined, undefined, undefined, undefined, undefined, true
                );
                const params = incapableModel.callApplyCompactionParams(baseParams(), {
                    messages: [],
                    compaction: { enabled: true }
                });
                const beta = params as Anthropic.MessageCreateParams & Partial<Anthropic.Beta.Messages.MessageCreateParams>;

                expect(beta.betas).to.equal(undefined);
                expect(beta.context_management).to.equal(undefined);
            });

            it('leaves params unchanged when no compaction request settings are provided and default is false', () => {
                const model = createCompactionModel(false);
                const params = model.callApplyCompactionParams(baseParams(), { messages: [] });
                const beta = params as Anthropic.MessageCreateParams & Partial<Anthropic.Beta.Messages.MessageCreateParams>;

                expect(beta.betas).to.equal(undefined);
                expect(beta.context_management).to.equal(undefined);
            });
        });

        describe('computeServerSideCompactionSupport', () => {
            function capabilityFor(modelId: string): boolean {
                return new TestableAnthropicModel(
                    'test-id', modelId, { status: 'ready' }, true, false, () => 'test-key', undefined
                ).callComputeServerSideCompactionSupport();
            }

            it('returns true for claude-opus-4-6', () => {
                expect(capabilityFor('claude-opus-4-6')).to.equal(true);
            });
            it('returns true for claude-sonnet-4-6', () => {
                expect(capabilityFor('claude-sonnet-4-6')).to.equal(true);
            });
            it('returns true for claude-opus-4-7 (newer minor version)', () => {
                expect(capabilityFor('claude-opus-4-7')).to.equal(true);
            });
            it('returns false for claude-haiku-4-5 (haiku variant)', () => {
                expect(capabilityFor('claude-haiku-4-5')).to.equal(false);
            });
            it('returns false for claude-opus-4-5 (older minor version)', () => {
                expect(capabilityFor('claude-opus-4-5')).to.equal(false);
            });
            it('returns false for claude-sonnet-4-5 (older minor version, sonnet variant)', () => {
                expect(capabilityFor('claude-sonnet-4-5')).to.equal(false);
            });
            it('returns true for claude-opus-5-0 (newer major version)', () => {
                expect(capabilityFor('claude-opus-5-0')).to.equal(true);
            });
            it('returns false for claude-3-opus-20240229 (old date-style id)', () => {
                expect(capabilityFor('claude-3-opus-20240229')).to.equal(false);
            });
            it('returns false for claude-sonnet-4-20250514 (4.0 with a date suffix, not minor 20250514)', () => {
                expect(capabilityFor('claude-sonnet-4-20250514')).to.equal(false);
            });
            it('returns true for claude-opus-4-6-20250101 (4.6 with a date suffix)', () => {
                expect(capabilityFor('claude-opus-4-6-20250101')).to.equal(true);
            });
            it('returns false for an unrecognized model id', () => {
                expect(capabilityFor('gpt-4o')).to.equal(false);
            });
        });
    });
});

/** Builds a mock Anthropic client whose messages.stream() yields the supplied raw events. */
function buildMockAnthropicStream(anthropicEvents: object[]): Anthropic {
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

async function collectParts(model: AnthropicModel, text: string): Promise<LanguageModelStreamResponsePart[]> {
    const request: UserRequest = {
        messages: [{ actor: 'user', type: 'text', text }],
        serverTools: ['web_fetch'],
        agentId: 'test', sessionId: 'session', requestId: 'req'
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
