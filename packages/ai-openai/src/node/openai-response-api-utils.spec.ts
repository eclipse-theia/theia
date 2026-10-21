// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import {
    CompactionMessage, isCompactionResponsePart, isServerToolCallResponsePart, isTextResponsePart, isThinkingResponsePart, isToolCallResponsePart,
    isUsageResponsePart, LanguageModelMessage, LanguageModelResponse, LanguageModelStreamResponsePart, ToolCallExecutor, ToolCallExecutorImpl, UserRequest
} from '@theia/ai-core';
import { CancellationError, CancellationTokenSource, ILogger } from '@theia/core';
import { Container } from '@theia/core/shared/inversify';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { OpenAiModelUtils } from './openai-model-utils';
import { OpenAI } from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { OPENAI_FUNCTION_CALL_REASONING_DATA_KEY, OpenAiResponseApiUtils } from './openai-response-api-utils';
import { OPENAI_WEB_SEARCH, OPENAI_WEB_SEARCH_REPLAY_DATA_KEY } from './openai-server-tools';

async function* toStream(events: unknown[]): AsyncIterable<unknown> {
    for (const event of events) {
        yield event;
    }
}

function outputItemEvents(item: Record<string, unknown>, outputIndex: number): unknown[] {
    return [
        { type: 'response.output_item.added', output_index: outputIndex, item: item.type === 'function_call' ? { ...item, arguments: '' } : item },
        ...(item.type === 'function_call' ? [{
            type: 'response.function_call_arguments.done', item_id: item.id, name: item.name, arguments: item.arguments
        }] : []),
        { type: 'response.output_item.done', output_index: outputIndex, item }
    ];
}

function createTestUtils(): OpenAiResponseApiUtils {
    const container = new Container();
    container.bind(ILogger).to(MockLogger);
    container.bind(ToolCallExecutor).to(ToolCallExecutorImpl).inSingletonScope();
    container.bind(OpenAiResponseApiUtils).toSelf();
    return container.get(OpenAiResponseApiUtils);
}

describe('OpenAiResponseApiUtils', () => {
    let utils: OpenAiResponseApiUtils;

    beforeEach(() => {
        utils = createTestUtils();
    });

    it('passes tool parameters through unchanged in non-strict mode', () => {
        const parameters = {
            type: 'object' as const,
            properties: {
                metadata: {
                    type: 'object' as const,
                    additionalProperties: { type: 'string' }
                }
            }
        };

        const converted = utils.convertToolsForResponseApi([{
            id: 'lookup',
            name: 'lookup',
            parameters,
            handler: async () => 'result'
        }]);

        expect(converted).to.have.lengthOf(1);
        const convertedTool = converted?.[0];
        expect(convertedTool).to.include({
            type: 'function',
            name: 'lookup',
            parameters,
            strict: false
        });
        if (convertedTool?.type !== 'function') {
            throw new Error('Expected a function tool');
        }
        expect(convertedTool.parameters).to.equal(parameters);
    });

    it('adds native web search without requiring client tools', () => {
        expect(utils.convertToolsForResponseApi(undefined, undefined, [OPENAI_WEB_SEARCH])).to.deep.equal([
            { type: 'web_search' }
        ]);
        expect(utils.convertToolsForResponseApi()).to.equal(undefined);
    });

    it('combines native web search with function and deferred-tool search tools', () => {
        const tools = utils.convertToolsForResponseApi([{
            id: 'lookup',
            name: 'lookup',
            parameters: { type: 'object', properties: {} },
            handler: async () => 'result'
        }], ['lookup'], [OPENAI_WEB_SEARCH]);

        expect(tools?.map(tool => tool.type)).to.deep.equal(['function', 'tool_search', 'web_search']);
    });

    it('preserves required output fields when serializing historical empty tool results', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'tool_result', tool_use_id: 'missing', name: 'lookup' },
            { actor: 'user', type: 'tool_result', tool_use_id: 'undefined', name: 'lookup', content: undefined },
            { actor: 'user', type: 'tool_result', tool_use_id: 'empty', name: 'lookup', content: '' },
            { actor: 'user', type: 'tool_result', tool_use_id: 'text', name: 'lookup', content: 'result' },
            { actor: 'user', type: 'tool_result', tool_use_id: 'object', name: 'lookup', content: { value: 1 } },
            { actor: 'user', type: 'tool_result', tool_use_id: 'to-json', name: 'lookup', content: { toJSON: () => undefined } }
        ];
        const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

        // Assert the wire representation: JSON serialization must not drop the required output property.
        expect(JSON.parse(JSON.stringify(input))).to.deep.equal([
            { type: 'function_call_output', call_id: 'missing', output: '' },
            { type: 'function_call_output', call_id: 'undefined', output: '' },
            { type: 'function_call_output', call_id: 'empty', output: '' },
            { type: 'function_call_output', call_id: 'text', output: 'result' },
            { type: 'function_call_output', call_id: 'object', output: '{"value":1}' },
            { type: 'function_call_output', call_id: 'to-json', output: '' }
        ]);
    });

    for (const isStreaming of [true, false]) {
        it(`emits one output per tool call including empty results (${isStreaming ? 'streaming' : 'non-streaming'})`, async () => {
            const functionCalls = ['void', 'empty', 'object', 'to-json', 'failed', 'missing'].map((name, index) => ({
                id: `item-${index}`,
                call_id: `call-${index}`,
                type: 'function_call',
                name,
                arguments: '{}'
            }));
            const payloads: Record<string, unknown>[] = [];
            const recordRequest = (payload: Record<string, unknown>): void => {
                payloads.push(JSON.parse(JSON.stringify(payload)));
            };
            const openai = {
                responses: {
                    create: async (payload: Record<string, unknown>) => {
                        recordRequest(payload);
                        return payload.stream ? toStream(payloads.length === 1
                            ? functionCalls.flatMap((item, index) => outputItemEvents(item, index))
                            : [{ type: 'response.output_text.delta', delta: 'done' }])
                            : { output: payloads.length === 1 ? functionCalls : [], output_text: payloads.length === 1 ? '' : 'done' };
                    }
                }
            };
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }],
                tools: [
                    { id: 'void', name: 'void', parameters: { type: 'object', properties: {} }, handler: async () => undefined },
                    { id: 'empty', name: 'empty', parameters: { type: 'object', properties: {} }, handler: async () => '' },
                    { id: 'object', name: 'object', parameters: { type: 'object', properties: {} }, handler: async () => ({ value: 1 }) },
                    { id: 'to-json', name: 'to-json', parameters: { type: 'object', properties: {} }, handler: async () => ({ toJSON: () => undefined }) },
                    { id: 'failed', name: 'failed', parameters: { type: 'object', properties: {} }, handler: async () => { throw new Error('failed'); } }
                ]
            };
            const response = await utils.handleRequest(
                openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', isStreaming
            );
            if (!('stream' in response)) {
                throw new Error('Expected the tool loop to return a stream');
            }
            const parts: LanguageModelStreamResponsePart[] = [];
            for await (const part of response.stream) {
                parts.push(part);
            }

            expect(parts.filter(isTextResponsePart)).to.deep.equal([{ content: 'done' }]);
            expect(payloads).to.have.length(2);
            const input = payloads[1].input as { type?: string; call_id?: string; output?: string }[];
            expect(input.filter(item => item.type === 'function_call')).to.deep.equal(functionCalls);
            expect(input.filter(item => item.type === 'function_call_output')).to.deep.equal([
                { type: 'function_call_output', call_id: 'call-0', output: '' },
                { type: 'function_call_output', call_id: 'call-1', output: '' },
                { type: 'function_call_output', call_id: 'call-2', output: '{"value":1}' },
                { type: 'function_call_output', call_id: 'call-3', output: '' },
                { type: 'function_call_output', call_id: 'call-4', output: 'Error: failed' },
                { type: 'function_call_output', call_id: 'call-5', output: 'Error: Tool missing not found' }
            ]);
        });
    }

    it('emits per-iteration usage for Response API tool calls instead of accumulated usage', async () => {
        const streams = [
            [
                ...outputItemEvents({
                    id: 'item-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{"query":"test"}'
                }, 0),
                {
                    type: 'response.completed',
                    response: {
                        usage: {
                            input_tokens: 100,
                            output_tokens: 10
                        }
                    }
                }
            ],
            [
                {
                    type: 'response.output_text.delta',
                    delta: 'done'
                },
                {
                    type: 'response.completed',
                    response: {
                        usage: {
                            input_tokens: 200,
                            output_tokens: 20
                        }
                    }
                }
            ]
        ];
        const streamRequests: Record<string, unknown>[] = [];
        const openai = {
            responses: {
                create: async (responseRequest: Record<string, unknown>) => {
                    streamRequests.push(responseRequest);
                    return toStream(streams.shift() ?? []);
                }
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            serverTools: [OPENAI_WEB_SEARCH],
            tools: [{
                id: 'lookup',
                name: 'lookup',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
                handler: async () => 'result'
            }]
        };

        const response = await utils.handleRequest(
            openai as never,
            request,
            {},
            'gpt-5',
            new OpenAiModelUtils(),
            'developer',
            'openai/gpt-5',
            true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        expect(parts.filter(isUsageResponsePart)).to.deep.equal([
            { input_tokens: 100, output_tokens: 10 },
            { input_tokens: 200, output_tokens: 20 }
        ]);
        expect(streamRequests).to.have.length(2);
        expect(streamRequests.every(streamRequest =>
            JSON.stringify(streamRequest.include) === JSON.stringify(['web_search_call.action.sources', 'reasoning.encrypted_content'])
        )).to.equal(true);
    });

    it('preserves reasoning and web search items for the next function-tool iteration', async () => {
        const reasoningItem = { id: 'rs-1', type: 'reasoning', summary: [], encrypted_content: 'encrypted-reasoning' };
        const searchCall = {
            id: 'ws-1',
            type: 'web_search_call',
            status: 'completed',
            action: { type: 'search', query: 'news' }
        };
        const streams = [
            [
                ...outputItemEvents(reasoningItem, 0),
                ...outputItemEvents(searchCall, 1),
                ...outputItemEvents({ id: 'item-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{"query":"test"}' }, 2)
            ],
            [{ type: 'response.output_text.delta', delta: 'done' }]
        ];
        const streamRequests: Record<string, unknown>[] = [];
        const openai = {
            responses: {
                create: async (responseRequest: Record<string, unknown>) => {
                    streamRequests.push(responseRequest);
                    return toStream(streams.shift() ?? []);
                }
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            serverTools: [OPENAI_WEB_SEARCH],
            tools: [{
                id: 'lookup',
                name: 'lookup',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
                handler: async () => 'result'
            }]
        };

        const response = await utils.handleRequest(
            openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer',
            'openai/gpt-5', true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        expect(parts).to.not.be.empty;

        expect(streamRequests).to.have.length(2);
        expect(streamRequests[1].input).to.deep.include.members([reasoningItem, searchCall]);
        const input = streamRequests[1].input as unknown[];
        expect(input.indexOf(reasoningItem)).to.be.lessThan(input.indexOf(searchCall));
    });

    for (const withTools of [false, true]) {
        it(`emits and replays OpenAI compaction ${withTools ? 'with client tools' : 'without tools'}`, async () => {
            const payloads: Record<string, unknown>[] = [];
            const openai = {
                responses: {
                    create: async (payload: Record<string, unknown>) => {
                        payloads.push(payload);
                        return toStream(payloads.length === 1 ? [
                            { type: 'response.output_item.done', output_index: 0, item: { type: 'compaction', id: 'c1', encrypted_content: 'enc1' } },
                            { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } }
                        ] : [{ type: 'response.output_text.delta', delta: 'Continued answer' }]);
                    }
                }
            };
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }],
                tools: withTools ? [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }] : undefined
            };

            const response = await utils.handleRequest(
                openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true
            );
            const parts: LanguageModelStreamResponsePart[] = [];
            expect('stream' in response).to.equal(true);
            if ('stream' in response) {
                for await (const part of response.stream) {
                    parts.push(part);
                }
            }

            const compactionParts = parts.filter(isCompactionResponsePart);
            expect(compactionParts).to.deep.equal([{
                compaction: { provider: 'openai-responses', data: { id: 'c1', encrypted_content: 'enc1' } }
            }]);
            const replayRequest: UserRequest = {
                ...request,
                messages: [
                    ...request.messages,
                    { actor: 'ai', type: 'compaction', ...compactionParts[0].compaction },
                    { actor: 'user', type: 'text', text: 'Next turn' }
                ]
            };
            const replay = await utils.handleRequest(
                openai as never, replayRequest, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true
            );
            const replayParts: LanguageModelStreamResponsePart[] = [];
            expect('stream' in replay).to.equal(true);
            if ('stream' in replay) {
                for await (const part of replay.stream) {
                    replayParts.push(part);
                }
            }
            expect(replayParts.filter(isTextResponsePart)).to.deep.equal([{ content: 'Continued answer' }]);
            expect(payloads).to.have.lengthOf(2);
            expect(payloads[1].input).to.deep.equal([
                { type: 'compaction', id: 'c1', encrypted_content: 'enc1' },
                { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Next turn' }] }
            ]);
        });
    }

    it('surfaces and replays the native deferred-tool search output', async () => {
        const searchCall = { id: 'ts-item-1', call_id: 'ts-1', type: 'tool_search_call', execution: 'server', status: 'completed', arguments: { query: 'file' } };
        const searchOutput = { id: 'ts-out-1', call_id: 'ts-1', type: 'tool_search_output', execution: 'server', status: 'completed', tools: [{}, {}] };
        const functionCall = { id: 'item-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{"query":"test"}' };
        const streams = [
            [
                ...outputItemEvents(searchCall, 0),
                ...outputItemEvents(searchOutput, 1),
                ...outputItemEvents(functionCall, 2),
                { type: 'response.completed', response: { usage: { input_tokens: 100, output_tokens: 10 } } }
            ],
            [
                { type: 'response.output_text.delta', delta: 'done' },
                { type: 'response.completed', response: { usage: { input_tokens: 200, output_tokens: 20 } } }
            ]
        ];
        const payloads: Record<string, unknown>[] = [];
        const openai = {
            responses: {
                create: async (payload: Record<string, unknown>) => {
                    payloads.push(payload);
                    return toStream(streams.shift() ?? []);
                }
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            deferredToolIds: ['lookup'],
            tools: [{
                id: 'lookup',
                name: 'lookup',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
                handler: async () => 'result'
            }]
        };

        const response = await utils.handleRequest(
            openai as never,
            request,
            {},
            'gpt-5',
            new OpenAiModelUtils(),
            'developer',
            'openai/gpt-5',
            true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        const calls = parts.filter(isServerToolCallResponsePart).flatMap(p => p.server_tool_calls);
        const running = calls.find(c => !c.finished);
        expect(running).to.not.be.undefined;
        expect(running!.id).to.equal('ts-1');
        expect(running!.name).to.equal('tool_search');

        const finished = calls.find(c => c.finished);
        expect(finished).to.not.be.undefined;
        expect(finished!.id).to.equal('ts-1');
        expect(finished!.name).to.equal('tool_search');
        expect(finished!.result).to.deep.equal({ content: [{ type: 'text', text: 'Found 2 tools.' }] });
        expect(payloads[1].input).to.deep.equal([
            ...payloads[0].input as unknown[], searchCall, searchOutput, functionCall,
            { type: 'function_call_output', call_id: 'call-1', output: 'result' }
        ]);
    });

    it('surfaces web search as a running then finished server tool call', async () => {
        const reasoningItem = {
            id: 'rs-1',
            type: 'reasoning',
            summary: [],
            encrypted_content: 'encrypted-reasoning'
        };
        const searchCall = {
            id: 'ws-1',
            type: 'web_search_call',
            status: 'failed',
            action: { type: 'search', query: 'latest AI news' }
        };
        const openai = {
            responses: {
                create: async () => toStream([
                    { type: 'response.output_item.done', output_index: 0, item: reasoningItem },
                    { type: 'response.output_item.added', output_index: 1, item: { ...searchCall, status: 'in_progress' } },
                    { type: 'response.output_item.done', output_index: 1, item: searchCall },
                    { type: 'response.output_text.delta', delta: 'Latest news.' },
                    { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } }
                ])
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'What is new?' }],
            serverTools: [OPENAI_WEB_SEARCH]
        };

        const response = await utils.handleRequest(
            openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer',
            'openai/gpt-5', true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        const calls = parts.filter(isServerToolCallResponsePart).flatMap(part => part.server_tool_calls);
        expect(calls).to.have.length(2);
        expect(calls[0]).to.deep.include({ id: 'ws-1', name: OPENAI_WEB_SEARCH, finished: false });
        expect(calls[1]).to.deep.include({ id: 'ws-1', name: OPENAI_WEB_SEARCH, finished: true });
        expect(calls[1].result).to.deep.equal({ content: [{ type: 'text', text: 'Web search failed.' }] });
        expect(calls[1].data).to.deep.equal({
            [OPENAI_WEB_SEARCH_REPLAY_DATA_KEY]: JSON.stringify([reasoningItem, searchCall])
        });
    });

    it('surfaces web search from a non-streaming response and requests sources', async () => {
        let createRequest: Record<string, unknown> | undefined;
        const openai = {
            responses: {
                create: async (responseRequest: Record<string, unknown>) => {
                    createRequest = responseRequest;
                    return {
                        output_text: 'Answer',
                        output: [{ id: 'ws-1', type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'news' } }]
                    };
                }
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'Search' }],
            serverTools: [OPENAI_WEB_SEARCH]
        };

        const response = await utils.handleRequest(
            openai as never, request, { include: ['file_search_call.results', 'web_search_call.action.sources'] },
            'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', false
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        const calls = parts.filter(isServerToolCallResponsePart).flatMap(part => part.server_tool_calls);
        expect(calls).to.have.length(1);
        expect(calls[0]).to.deep.include({ id: 'ws-1', name: OPENAI_WEB_SEARCH, finished: true });
        expect(createRequest?.include).to.deep.equal(['file_search_call.results', 'web_search_call.action.sources', 'reasoning.encrypted_content']);
    });

    it('replays persisted OpenAI reasoning before its web search call', () => {
        const reasoningItem = {
            id: 'rs-1',
            type: 'reasoning',
            summary: [],
            encrypted_content: 'encrypted-reasoning'
        };
        const searchCall = {
            id: 'ws-1',
            type: 'web_search_call',
            status: 'completed',
            action: {
                type: 'search',
                query: 'news',
                sources: [{ type: 'url', url: 'https://example.com', title: 'Example' }]
            }
        };
        const messages: LanguageModelMessage[] = [{
            actor: 'ai',
            type: 'server_tool_use',
            id: 'ws-1',
            name: OPENAI_WEB_SEARCH,
            input: searchCall.action,
            result: { content: [{ type: 'text', text: 'Web search completed.' }] },
            data: {
                [OPENAI_WEB_SEARCH_REPLAY_DATA_KEY]: JSON.stringify([reasoningItem, searchCall])
            }
        }];

        const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

        expect(input).to.deep.equal([reasoningItem, searchCall]);
    });

    it('persists and replays reasoning before a function call', async () => {
        const reasoningItem = { id: 'rs-1', type: 'reasoning', summary: [], encrypted_content: 'encrypted-reasoning' };
        const functionCall = {
            id: 'fc-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{"query":"test"}'
        };
        const requests: Record<string, unknown>[] = [];
        const streams = [
            [
                ...outputItemEvents(reasoningItem, 0),
                ...outputItemEvents(functionCall, 1)
            ],
            [{ type: 'response.output_text.delta', delta: 'done' }]
        ];
        const openai = {
            responses: {
                create: async (responseRequest: Record<string, unknown>) => {
                    requests.push(responseRequest);
                    return toStream(streams.shift() ?? []);
                }
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            tools: [{
                id: 'lookup',
                name: 'lookup',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
                handler: async () => 'result'
            }]
        };

        const response = await utils.handleRequest(
            openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer',
            'openai/gpt-5', true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        expect(requests[0].include).to.deep.equal(['reasoning.encrypted_content']);
        const completedCall = parts.flatMap(part => 'tool_calls' in part ? part.tool_calls : []).find(call => call.finished);
        expect(completedCall?.data).to.deep.equal({
            [OPENAI_FUNCTION_CALL_REASONING_DATA_KEY]: JSON.stringify([reasoningItem])
        });
        expect(requests[1].input).to.deep.include.members([reasoningItem]);
        const nextInput = requests[1].input as unknown[];
        const replayedCall = nextInput.find(item => (item as { type?: string }).type === 'function_call');
        expect(nextInput.indexOf(reasoningItem)).to.be.lessThan(nextInput.indexOf(replayedCall));

        const { input } = utils.processMessages([{
            actor: 'ai',
            type: 'tool_use',
            id: 'call-1',
            name: 'lookup',
            input: { query: 'test' },
            data: completedCall?.data
        }], 'developer', 'gpt-5');
        expect(input).to.deep.equal([reasoningItem, {
            type: 'function_call',
            call_id: 'call-1',
            name: 'lookup',
            arguments: '{"query":"test"}'
        }]);
    });

    describe('transient stream failures', () => {
        let clock: sinon.SinonFakeTimers;
        const busy = { type: 'response.failed', response: { error: { code: 'server_error', message: 'The server is too busy.' } } };
        const request: UserRequest = { sessionId: 's', requestId: 'r', messages: [{ actor: 'user', type: 'text', text: 'hello' }] };

        beforeEach(() => { clock = sinon.useFakeTimers(); });
        afterEach(() => sinon.restore());

        for (const withTools of [false, true]) {
            it(`retries quietly after lifecycle events ${withTools ? 'with tools' : 'without tools'}`, async () => {
                const payloads: unknown[] = [];
                const openai = {
                    maxRetries: 1,
                    responses: {
                        create: async (payload: unknown) => {
                            payloads.push(payload);
                            return toStream(payloads.length === 1
                                ? [{ type: 'response.created' }, { type: 'response.in_progress' }, busy]
                                : [{ type: 'response.output_text.delta', delta: 'done' }]);
                        }
                    }
                };
                const response = await utils.handleRequest(openai as never, {
                    ...request,
                    tools: withTools ? [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }] : undefined
                }, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true);
                const parts: LanguageModelStreamResponsePart[] = [];
                const consume = (async () => {
                    if ('stream' in response) {
                        for await (const part of response.stream) { parts.push(part); }
                    }
                })();
                await clock.runAllAsync();
                await consume;
                expect(parts).to.deep.equal([{ content: 'done' }]);
                expect(payloads).to.have.length(2);
                expect(payloads[1]).to.deep.equal(payloads[0]);
            });

            it(`cancels during backoff ${withTools ? 'with tools' : 'without tools'}`, async () => {
                const source = new CancellationTokenSource();
                const create = sinon.stub().callsFake(async () => toStream([busy]));
                const response = await utils.handleRequest({ maxRetries: 3, responses: { create } } as never, {
                    ...request,
                    tools: withTools ? [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }] : undefined
                }, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true, source.token);
                const consume = (async () => {
                    try {
                        if ('stream' in response) {
                            for await (const part of response.stream) { expect.fail(`Unexpected output ${JSON.stringify(part)}`); }
                        }
                    } catch (error) {
                        return error;
                    }
                    return undefined;
                })();
                await clock.tickAsync(0);
                source.cancel();
                expect(await consume).to.be.instanceOf(CancellationError);
                await clock.runAllAsync();
                expect(create.callCount).to.equal(1);
                expect(create.firstCall.args[1].signal.aborted).to.equal(true);
                source.dispose();
            });
        }

        it('reports cancellation when a simple upstream stream ends normally on abort', async () => {
            const source = new CancellationTokenSource();
            const create = sinon.stub().callsFake(async (_payload: unknown, options: { signal: AbortSignal }) => (async function* (): AsyncIterable<unknown> {
                yield { type: 'response.created' };
                await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true }));
            })());
            const response = await utils.handleRequest({ maxRetries: 3, responses: { create } } as never, request,
                {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true, source.token);
            const consume = (async () => {
                try {
                    if ('stream' in response) {
                        for await (const part of response.stream) { expect.fail(`Unexpected output ${JSON.stringify(part)}`); }
                    }
                } catch (error) {
                    return error;
                }
                return undefined;
            })();
            await clock.tickAsync(0);
            source.cancel();
            expect(await consume).to.be.instanceOf(CancellationError);
            expect(create.callCount).to.equal(1);
            source.dispose();
        });

        it('retries the next model turn without repeating completed tools', async () => {
            const handler = sinon.stub().resolves('result');
            const payloads: { input: unknown[] }[] = [];
            const openai = {
                maxRetries: 1,
                responses: {
                    create: async (payload: { input: unknown[] }) => {
                        payloads.push(payload);
                        return toStream(payloads.length === 1
                            ? outputItemEvents({ id: 'call-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{}' }, 0)
                            : payloads.length === 2 ? [busy] : [{ type: 'response.output_text.delta', delta: 'done' }]);
                    }
                }
            };
            const response = await utils.handleRequest(openai as never, {
                ...request, tools: [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler }]
            }, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true);
            const parts: LanguageModelStreamResponsePart[] = [];
            const consume = (async () => {
                if ('stream' in response) {
                    for await (const part of response.stream) { parts.push(part); }
                }
            })();
            await clock.runAllAsync();
            await consume;
            expect(handler.callCount).to.equal(1);
            expect(parts.filter(isTextResponsePart)).to.deep.equal([{ content: 'done' }]);
            expect(payloads).to.have.length(3);
            expect(payloads[2]).to.deep.equal(payloads[1]);
            expect(payloads[2].input).to.deep.include({ type: 'function_call_output', call_id: 'call-1', output: 'result' });
        });
    });

    describe('reasoning summaries', () => {
        // Two summary parts of one reasoning item, as the Responses API streams them with `reasoning.summary` set.
        const summaryEvents = [
            { type: 'response.reasoning_summary_part.added', item_id: 'rs-1', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } },
            { type: 'response.reasoning_summary_text.delta', item_id: 'rs-1', output_index: 0, summary_index: 0, delta: 'Weighing ' },
            { type: 'response.reasoning_summary_text.delta', item_id: 'rs-1', output_index: 0, summary_index: 0, delta: 'options' },
            { type: 'response.reasoning_summary_part.added', item_id: 'rs-1', output_index: 0, summary_index: 1, part: { type: 'summary_text', text: '' } },
            { type: 'response.reasoning_summary_text.delta', item_id: 'rs-1', output_index: 0, summary_index: 1, delta: 'Deciding' }
        ];

        async function drain(response: LanguageModelResponse): Promise<LanguageModelStreamResponsePart[]> {
            const parts: LanguageModelStreamResponsePart[] = [];
            if ('stream' in response) {
                for await (const part of response.stream) {
                    parts.push(part);
                }
            }
            return parts;
        }

        function thoughts(parts: LanguageModelStreamResponsePart[]): string {
            return parts.filter(isThinkingResponsePart).map(part => part.thought).join('');
        }

        it('streams reasoning summaries as thoughts, separating summary parts', async () => {
            const openai = {
                responses: {
                    create: async () => toStream([...summaryEvents, { type: 'response.output_text.delta', delta: 'Answer' }])
                }
            };
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }]
            };

            const parts = await drain(await utils.handleRequest(
                openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer',
                'openai/gpt-5', true
            ));

            expect(thoughts(parts)).to.equal('Weighing options\n\nDeciding');
            expect(parts.filter(isTextResponsePart).map(part => part.content).join('')).to.equal('Answer');
        });

        it('streams reasoning summaries as thoughts while tool calling', async () => {
            const streams = [
                [
                    ...summaryEvents,
                    {
                        type: 'response.output_item.done', output_index: 0,
                        item: {
                            id: 'rs-1', type: 'reasoning', summary: [
                                { type: 'summary_text', text: 'Weighing options' }, { type: 'summary_text', text: 'Deciding' }
                            ], encrypted_content: 'encrypted-reasoning'
                        }
                    },
                    ...outputItemEvents({ id: 'item-1', call_id: 'call-1', type: 'function_call', name: 'lookup', arguments: '{}' }, 1)
                ],
                [{ type: 'response.output_text.delta', delta: 'done' }]
            ];
            const openai = {
                responses: {
                    create: async () => toStream(streams.shift() ?? [])
                }
            };
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }],
                tools: [{
                    id: 'lookup',
                    name: 'lookup',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }]
            };

            const parts = await drain(await utils.handleRequest(
                openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer',
                'openai/gpt-5', true
            ));

            expect(thoughts(parts)).to.equal('Weighing options\n\nDeciding');
        });

        describe('unverified organizations', () => {
            const summarySettings = { reasoning: { effort: 'medium', summary: 'auto' } };
            const request: UserRequest = {
                sessionId: 'session-1',
                requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }]
            };

            function badRequest(param: string): Error {
                const message = `400 Your organization must be verified to generate reasoning summaries (param: ${param})`;
                return new OpenAI.BadRequestError(400, { message, param }, message, new Headers());
            }

            async function* rejectingStream(error: Error): AsyncIterable<unknown> {
                throw error;
            }

            function summaryOf(params: { reasoning?: { summary?: string } }): string | undefined {
                return params.reasoning?.summary;
            }

            it('retries a stream without the summary and omits it for later requests', async () => {
                const sent: { reasoning?: { effort?: string; summary?: string } }[] = [];
                const openai = {
                    responses: {
                        create: async (params: { reasoning?: { summary?: string } }) => {
                            sent.push(params);
                            return summaryOf(params)
                                ? rejectingStream(badRequest('reasoning.summary'))
                                : toStream([{ type: 'response.output_text.delta', delta: 'Answer' }]);
                        }
                    }
                };
                const send = async () => drain(await utils.handleRequest(
                    openai as never, request, summarySettings, 'gpt-5', new OpenAiModelUtils(), 'developer',
                    'openai/gpt-5', true
                ));

                const parts = await send();
                await send();

                expect(parts.filter(isTextResponsePart).map(part => part.content).join('')).to.equal('Answer');
                expect(sent.map(summaryOf)).to.deep.equal(['auto', undefined, undefined]);
                expect(sent[1].reasoning?.effort).to.equal('medium');
            });

            it('retries a non-streaming tool-calling request without the summary', async () => {
                const sent: { reasoning?: { summary?: string } }[] = [];
                const openai = {
                    responses: {
                        create: async (params: { reasoning?: { summary?: string } }) => {
                            sent.push(params);
                            if (summaryOf(params)) {
                                throw badRequest('reasoning.summary');
                            }
                            return { output_text: 'done', output: [] };
                        }
                    }
                };
                const toolRequest: UserRequest = {
                    ...request,
                    tools: [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }]
                };

                const parts = await drain(await utils.handleRequest(
                    openai as never, toolRequest, summarySettings, 'gpt-5', new OpenAiModelUtils(), 'developer',
                    'openai/gpt-5', false
                ));

                expect(parts.filter(isTextResponsePart).map(part => part.content).join('')).to.equal('done');
                expect(sent.map(summaryOf)).to.deep.equal(['auto', undefined]);
            });

            it('does not retry other bad requests', async () => {
                let calls = 0;
                const openai = {
                    responses: {
                        create: async () => {
                            calls++;
                            throw badRequest('reasoning.effort');
                        }
                    }
                };

                let error: unknown;
                try {
                    await utils.handleRequest(
                        openai as never, request, summarySettings, 'gpt-5', new OpenAiModelUtils(), 'developer',
                        'openai/gpt-5', false
                    );
                } catch (e) {
                    error = e;
                }

                expect(error).to.be.instanceOf(OpenAI.BadRequestError);
                expect(calls).to.equal(1);
            });
        });
    });

    describe('native output replay within a tool loop', () => {
        const compaction = { type: 'compaction', id: 'cmp-latest', encrypted_content: 'encrypted' };
        const reasoning = { type: 'reasoning', id: 'reasoning', summary: [], encrypted_content: 'reasoning-data' };
        const search = { type: 'web_search_call', id: 'search', status: 'completed', action: { type: 'search', query: 'test' } };
        const message = (text: string) => ({
            type: 'message', id: `msg-${text}`, role: 'assistant', status: 'completed',
            content: [{ type: 'output_text', text, annotations: [] }]
        });
        const call = (id: string) => ({ type: 'function_call', id: `item-${id}`, call_id: id, name: 'lookup', arguments: '{"query":"test"}' });
        const callA = call('a');
        const callB = call('b');
        const suffix = [reasoning, search, message('after'), callB];
        const cases = [
            { name: 'without compaction', output: [callA, ...suffix], replay: [callA, ...suffix] },
            { name: 'with compaction before calls', output: [message('before'), compaction, callA, ...suffix], replay: [compaction, callA, ...suffix] },
            { name: 'with compaction between calls', output: [callA, message('before'), compaction, ...suffix], replay: [compaction, ...suffix] },
            { name: 'with compaction after calls', output: [callA, ...suffix, compaction], replay: [compaction] },
            {
                name: 'with output requiring SDK conversion',
                output: [{ ...callA, created_by: 'provider' }, { type: 'additional_tools', id: 'tools', role: 'assistant', tools: [] }, ...suffix],
                replay: [callA, ...suffix]
            },
            {
                name: 'with multiple compactions',
                output: [{ ...compaction, id: 'cmp-old' }, callA, { ...reasoning, id: 'reasoning-before' },
                { ...search, id: 'search-before' }, message('before'), compaction, ...suffix],
                replay: [compaction, ...suffix]
            }
        ];

        for (const isStreaming of [true, false]) {
            for (const { name, output, replay } of cases) {
                it(`replays input ${name} and paired tool results (${isStreaming ? 'streaming' : 'non-streaming'})`, async () => {
                    const payloads: Record<string, unknown>[] = [];
                    let executions = 0;
                    const responses = [output, [call('c')], [message('done')]];
                    const nextOutput = (payload: Record<string, unknown>) => {
                        payloads.push(JSON.parse(JSON.stringify(payload)));
                        return responses.shift() ?? [];
                    };
                    const openai = {
                        responses: {
                            create: async (payload: Record<string, unknown>) => {
                                const items = nextOutput(payload);
                                if (!payload.stream) {
                                    return { output: items, output_text: '' };
                                }
                                return toStream([
                                    ...items.flatMap((item, output_index) => [
                                        { type: 'response.output_item.added', output_index, item },
                                        ...(item.type === 'function_call' ? [{
                                            type: 'response.function_call_arguments.done', item_id: item.id, name: 'lookup', arguments: '{"query":"test"}'
                                        }] : [])
                                    ]),
                                    // Completion arrival order must not change replay order.
                                    ...items.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item })).reverse(),
                                    { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } }
                                ]);
                            }
                        }
                    };
                    const request: UserRequest = {
                        sessionId: 'session', requestId: 'request',
                        messages: [
                            { actor: 'system', type: 'text', text: 'Instructions' },
                            { actor: 'user', type: 'text', text: 'Old history' }
                        ],
                        tools: [{
                            id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} },
                            handler: async () => { executions++; return executions === 2 ? undefined : 'result'; }
                        }]
                    };
                    const response = await utils.handleRequest(
                        openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', isStreaming
                    );
                    if (!('stream' in response)) {
                        throw new Error('Expected the tool loop to return a stream');
                    }
                    const parts: LanguageModelStreamResponsePart[] = [];
                    for await (const part of response.stream) {
                        parts.push(part);
                    }

                    expect(executions).to.equal(3);
                    expect(parts.filter(isCompactionResponsePart).map(part => part.compaction.data)).to.have.deep.members(
                        output.filter(item => item.type === 'compaction').map(item => ({ id: item.id, encrypted_content: 'encrypted' }))
                    );
                    expect(payloads).to.have.lengthOf(3);
                    expect(payloads[1].instructions).to.equal('Instructions');
                    expect(payloads[1].input).to.deep.equal([
                        ...(output.some(item => item.type === 'compaction') ? [] : payloads[0].input as unknown[]),
                        ...replay,
                        { type: 'function_call_output', call_id: 'a', output: 'result' },
                        { type: 'function_call_output', call_id: 'b', output: '' }
                    ]);
                    expect(payloads[2].input).to.deep.equal([
                        ...payloads[1].input as unknown[],
                        call('c'),
                        { type: 'function_call_output', call_id: 'c', output: 'result' }
                    ]);
                });
            }
        }
    });

    describe('processMessages server-side compaction replay', () => {

        function userMessage(text: string): LanguageModelMessage {
            return { actor: 'user', type: 'text', text };
        }

        function aiMessage(text: string): LanguageModelMessage {
            return { actor: 'ai', type: 'text', text };
        }

        function compactionMessage(provider: string, encrypted: string, id?: string): CompactionMessage {
            return { actor: 'ai', type: 'compaction', provider, data: { encrypted_content: encrypted, id } };
        }

        function textOf(input: ReturnType<OpenAiResponseApiUtils['processMessages']>['input']): string {
            return JSON.stringify(input);
        }

        function findCompactionItem(input: ReturnType<OpenAiResponseApiUtils['processMessages']>['input']): { type: string; encrypted_content: string } | undefined {
            return input.find((item): item is { type: 'compaction'; encrypted_content: string } =>
                (item as { type?: string }).type === 'compaction') as { type: string; encrypted_content: string } | undefined;
        }

        it('replays the openai-responses compaction marker and drops the prefix before it', () => {
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                aiMessage('ai B'),
                compactionMessage('openai-responses', 'enc1'),
                userMessage('user C')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            const compaction = findCompactionItem(input);
            expect(compaction, 'compaction item present').to.not.equal(undefined);
            expect(compaction!.encrypted_content).to.equal('enc1');
            expect(input[0]).to.deep.include({ type: 'compaction', encrypted_content: 'enc1' });

            const serialized = textOf(input);
            expect(serialized).to.contain('user C');
            expect(serialized).to.not.contain('user A');
            expect(serialized).to.not.contain('ai B');
        });

        it('only replays the LAST openai-responses marker and drops everything before it', () => {
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                compactionMessage('openai-responses', 'enc1'),
                compactionMessage('chatgpt-responses', 'foreign1'),
                userMessage('user B'),
                compactionMessage('openai-responses', 'enc2'),
                compactionMessage('chatgpt-responses', 'foreign2'),
                userMessage('user C')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            const compactionItems = input.filter(item => (item as { type?: string }).type === 'compaction');
            expect(compactionItems).to.have.length(1);
            expect((compactionItems[0] as { encrypted_content: string }).encrypted_content).to.equal('enc2');

            const serialized = textOf(input);
            expect(serialized).to.contain('user C');
            expect(serialized).to.not.contain('user A');
            expect(serialized).to.not.contain('user B');
            expect(serialized).to.not.contain('enc1');
            expect(serialized).to.not.contain('foreign');
        });

        it('skips a foreign-provider compaction marker without dropping the prefix', () => {
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                compactionMessage('chatgpt-responses', 'enc1'),
                userMessage('user B')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            expect(findCompactionItem(input), 'no compaction item for foreign provider').to.equal(undefined);
            const serialized = textOf(input);
            expect(serialized).to.contain('user A');
            expect(serialized).to.contain('user B');
            expect(serialized).to.not.contain('enc1');
        });

        it('converts all messages unchanged when there is no compaction marker', () => {
            const messages: LanguageModelMessage[] = [userMessage('user A'), aiMessage('ai B'), userMessage('user C')];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            expect(findCompactionItem(input)).to.equal(undefined);
            const serialized = textOf(input);
            expect(serialized).to.contain('user A');
            expect(serialized).to.contain('ai B');
            expect(serialized).to.contain('user C');
        });
    });

    for (const nameSource of ['added', 'done', 'arguments'] as const) {
        it(`preserves the streamed function name from the ${nameSource} event`, async () => {
            const item = { id: 'item-1', call_id: 'call-1', type: 'function_call' as const, name: 'lookup', arguments: '{"query":"test"}' };
            const argumentsDone = {
                type: 'response.function_call_arguments.done', item_id: item.id,
                arguments: item.arguments, output_index: 0, sequence_number: 1
            } satisfies ResponseStreamEvent;
            const payloads: Record<string, unknown>[] = [];
            const streams = [
                [
                    ...(nameSource === 'added' ? [{ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } }] : []),
                    nameSource === 'arguments' ? { ...argumentsDone, name: item.name } : argumentsDone,
                    { type: 'response.output_item.done', output_index: 0, item },
                    { type: 'response.completed', response: {} }
                ],
                [{ type: 'response.completed', response: {} }]
            ];
            const openai = {
                responses: {
                    create: async (payload: Record<string, unknown>) => {
                        payloads.push(payload);
                        return toStream(streams.shift() ?? []);
                    }
                }
            };
            const handler = sinon.stub().resolves('found');
            const request: UserRequest = {
                sessionId: 'session-1', requestId: 'request-1',
                messages: [{ actor: 'user', type: 'text', text: 'hello' }],
                tools: [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler }]
            };
            const response = await utils.handleRequest(openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true);
            const parts: LanguageModelStreamResponsePart[] = [];
            if ('stream' in response) {
                for await (const part of response.stream) {
                    parts.push(part);
                }
            }
            sinon.assert.calledOnce(handler);
            expect(handler.firstCall.args[0]).to.equal(item.arguments);
            const finished = parts.filter(isToolCallResponsePart).flatMap(part => part.tool_calls).find(call => call.finished);
            expect(finished?.function?.name).to.equal('lookup');
            expect(finished?.result).to.equal('found');
            expect(payloads).to.have.lengthOf(2);
            expect(payloads[1].input).to.deep.include(item);
            expect(payloads[1].input).to.deep.include({ type: 'function_call_output', call_id: item.call_id, output: 'found' });
        });
    }

    it('executes the tool calls of a single turn concurrently', async () => {
        const streams = [
            [
                ...outputItemEvents({ id: 'call-a', call_id: 'call-a', type: 'function_call', name: 'a', arguments: '{}' }, 0),
                ...outputItemEvents({ id: 'call-b', call_id: 'call-b', type: 'function_call', name: 'b', arguments: '{}' }, 1),
                { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } }
            ],
            [
                { type: 'response.output_text.delta', delta: 'done' },
                { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 2 } } }
            ]
        ];
        const openai = {
            responses: {
                create: async () => toStream(streams.shift() ?? [])
            }
        };
        // `a` only resolves once `b` has started: a sequential implementation would deadlock here.
        const bStarted = new Deferred<void>();
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            tools: [
                { id: 'a', name: 'a', parameters: { type: 'object', properties: {} }, handler: async () => { await bStarted.promise; return 'a-result'; } },
                { id: 'b', name: 'b', parameters: { type: 'object', properties: {} }, handler: async () => { bStarted.resolve(); return 'b-result'; } }
            ]
        };

        const response = await utils.handleRequest(openai as never, request, {}, 'gpt-5', new OpenAiModelUtils(), 'developer', 'openai/gpt-5', true);
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        const finishedResults = parts
            .filter(isToolCallResponsePart)
            .flatMap(part => part.tool_calls)
            .filter(call => call.finished)
            .map(call => call.result);
        expect(finishedResults).to.have.members(['a-result', 'b-result']);
    });
});
