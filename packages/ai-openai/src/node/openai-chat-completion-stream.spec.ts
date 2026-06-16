// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { CancellationTokenSource } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    createToolCallError,
    isTextResponsePart,
    isToolCallResponsePart,
    isUsageResponsePart,
    LanguageModelStreamResponsePart,
    ToolInvocation,
    ToolCallExecutionOptions,
    ToolCallOutcome,
    ToolCallExecutorImpl,
    ToolRequest,
    UserRequest
} from '@theia/ai-core';
import { ChatCompletionStreamingAsyncIterator, ChatCompletionToolLoopOptions } from './openai-chat-completion-stream';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A fake of the OpenAI chat-completion stream: async-iterable over chunks and an abortable controller. */
class FakeStream {
    readonly controller = { abort: sinon.spy() } as unknown as AbortController;
    constructor(protected readonly chunks: any[], protected readonly gate?: Promise<void>) { }
    async *[Symbol.asyncIterator](): AsyncIterator<any> {
        if (this.gate) {
            await this.gate;
        }
        for (const chunk of this.chunks) {
            yield chunk;
        }
    }
}

function textChunk(content: string): any {
    return { choices: [{ delta: { content } }] };
}

function toolChunk(index: number, id: string, name: string, args: string): any {
    return { choices: [{ delta: { tool_calls: [{ index, id, function: { name, arguments: args } }] } }] };
}

function usageChunk(inputTokens: number, outputTokens: number): any {
    return { choices: [{ delta: {} }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } };
}

interface FakeOpenAi {
    readonly calls: any[];
    readonly chat: { completions: { create: (body: any, options?: any) => Promise<FakeStream> } };
}

/** Returns the queued streams in order; records the request bodies passed to `create`. */
function fakeOpenAi(streams: FakeStream[]): FakeOpenAi {
    const calls: any[] = [];
    return {
        calls,
        chat: {
            completions: {
                create: async (body: any) => {
                    calls.push(body);
                    return streams.shift()!;
                }
            }
        }
    };
}

function toolRequest(name: string, handler: ToolRequest['handler']): ToolRequest {
    return { id: name, name, parameters: { type: 'object', properties: {} }, handler };
}

function makeIterator(openai: FakeOpenAi, overrides: Partial<ChatCompletionToolLoopOptions> = {}): ChatCompletionStreamingAsyncIterator {
    const defaultRequest: UserRequest = {
        sessionId: 'session',
        requestId: 'request',
        messages: [{ actor: 'user', type: 'text', text: 'hi' }]
    };
    return new ChatCompletionStreamingAsyncIterator({
        openai: openai as any,
        model: 'gpt-test',
        request: overrides.request ?? defaultRequest,
        messages: overrides.messages ?? [{ role: 'user', content: 'hi' }],
        settings: overrides.settings ?? {},
        tools: overrides.tools ?? [{ type: 'function', function: { name: 'a' } } as any],
        maxChatCompletions: overrides.maxChatCompletions ?? 100,
        maxRetries: overrides.maxRetries ?? 0,
        toolCallExecutor: overrides.toolCallExecutor ?? new ToolCallExecutorImpl(),
        cancellationToken: overrides.cancellationToken
    });
}

async function drain(iterator: AsyncIterableIterator<LanguageModelStreamResponsePart>): Promise<LanguageModelStreamResponsePart[]> {
    const parts: LanguageModelStreamResponsePart[] = [];
    for await (const part of iterator) {
        parts.push(part);
    }
    return parts;
}

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/** Captures the batches of tool calls passed to the executor, to assert single-turn batching. */
class RecordingExecutor extends ToolCallExecutorImpl {
    readonly batches: ToolInvocation[][] = [];
    override executeToolCalls(
        toolCalls: readonly ToolInvocation[],
        tools: readonly ToolRequest[] | undefined,
        options?: ToolCallExecutionOptions
    ): Promise<ToolCallOutcome[]> {
        this.batches.push([...toolCalls]);
        return super.executeToolCalls(toolCalls, tools, options);
    }
}

describe('ChatCompletionStreamingAsyncIterator', () => {

    it('streams a plain text turn with no tool calls', async () => {
        const openai = fakeOpenAi([new FakeStream([textChunk('Hello '), textChunk('world')])]);
        const parts = await drain(makeIterator(openai));

        expect(parts.filter(isTextResponsePart).map(p => p.content)).to.deep.equal(['Hello ', 'world']);
        expect(openai.calls).to.have.lengthOf(1);
    });

    it('emits token usage parts', async () => {
        const openai = fakeOpenAi([new FakeStream([textChunk('hi'), usageChunk(10, 4)])]);
        const parts = await drain(makeIterator(openai));

        expect(parts.filter(isUsageResponsePart)).to.deep.equal([{ input_tokens: 10, output_tokens: 4 }]);
    });

    it('executes the tool calls of a single turn concurrently and in one batch', async () => {
        // `a` only completes once `b` has started: a sequential loop would deadlock here.
        const bStarted = new Deferred<void>();
        const request: UserRequest = {
            sessionId: 'session',
            requestId: 'request',
            messages: [{ actor: 'user', type: 'text', text: 'hi' }],
            tools: [
                toolRequest('a', async () => { await bStarted.promise; return 'a-result'; }),
                toolRequest('b', async () => { bStarted.resolve(); return 'b-result'; })
            ]
        };
        const executor = new RecordingExecutor();
        const openai = fakeOpenAi([
            new FakeStream([toolChunk(0, 'call-a', 'a', '{}'), toolChunk(1, 'call-b', 'b', '{}')]),
            new FakeStream([textChunk('done')])
        ]);

        const parts = await drain(makeIterator(openai, { request, toolCallExecutor: executor }));

        // Both tool calls were handed to the executor together (single turn => single batch).
        expect(executor.batches).to.have.lengthOf(1);
        expect(executor.batches[0].map(c => c.name)).to.deep.equal(['a', 'b']);

        const finished = parts.filter(isToolCallResponsePart).flatMap(p => p.tool_calls).filter(c => c.finished);
        expect(finished.map(c => c.result)).to.have.members(['a-result', 'b-result']);
        expect(parts.filter(isTextResponsePart).map(p => p.content)).to.deep.equal(['done']);
        expect(openai.calls).to.have.lengthOf(2);
    });

    it('emits open / arguments-delta / finished parts for a tool call', async () => {
        const request: UserRequest = {
            sessionId: 'session',
            requestId: 'request',
            messages: [{ actor: 'user', type: 'text', text: 'hi' }],
            tools: [toolRequest('a', async () => 'a-result')]
        };
        const openai = fakeOpenAi([
            new FakeStream([toolChunk(0, 'call-a', 'a', '{"x":1}')]),
            new FakeStream([textChunk('done')])
        ]);

        const parts = await drain(makeIterator(openai, { request }));
        const toolParts = parts.filter(isToolCallResponsePart).flatMap(p => p.tool_calls);

        const open = toolParts.find(c => c.finished === false);
        const delta = toolParts.find(c => c.argumentsDelta);
        const finished = toolParts.find(c => c.finished);
        expect(open?.function?.name).to.equal('a');
        expect(delta?.function?.arguments).to.equal('{"x":1}');
        expect(finished?.result).to.equal('a-result');
    });

    it('threads the assistant tool_calls and a matching tool message into the next turn', async () => {
        const request: UserRequest = {
            sessionId: 'session',
            requestId: 'request',
            messages: [{ actor: 'user', type: 'text', text: 'hi' }],
            tools: [toolRequest('a', async () => 'a-result')]
        };
        const openai = fakeOpenAi([
            new FakeStream([toolChunk(0, 'call-a', 'a', '{}')]),
            new FakeStream([textChunk('done')])
        ]);

        await drain(makeIterator(openai, { request }));

        const secondTurnMessages = openai.calls[1].messages;
        const assistant = secondTurnMessages[secondTurnMessages.length - 2];
        const toolMessage = secondTurnMessages[secondTurnMessages.length - 1];
        expect(assistant.role).to.equal('assistant');
        expect(assistant.tool_calls[0].id).to.equal('call-a');
        expect(assistant.tool_calls[0].function.name).to.equal('a');
        expect(toolMessage.role).to.equal('tool');
        expect(toolMessage.tool_call_id).to.equal('call-a');
        expect(toolMessage.content).to.equal('a-result');
    });

    it('surfaces a tool error and still appends a tool message so the model can continue', async () => {
        const request: UserRequest = {
            sessionId: 'session',
            requestId: 'request',
            messages: [{ actor: 'user', type: 'text', text: 'hi' }],
            tools: [toolRequest('a', async () => { throw new Error('boom'); })]
        };
        const openai = fakeOpenAi([
            new FakeStream([toolChunk(0, 'call-a', 'a', '{}')]),
            new FakeStream([textChunk('recovered')])
        ]);

        const parts = await drain(makeIterator(openai, { request }));

        const finished = parts.filter(isToolCallResponsePart).flatMap(p => p.tool_calls).find(c => c.finished);
        expect(JSON.stringify(finished?.result)).to.equal(JSON.stringify(createToolCallError('boom')));
        // The tool message must still be present for the follow-up turn.
        const secondTurnMessages = openai.calls[1].messages;
        expect(secondTurnMessages[secondTurnMessages.length - 1].role).to.equal('tool');
        expect(parts.filter(isTextResponsePart).map(p => p.content)).to.deep.equal(['recovered']);
    });

    it('stops after maxChatCompletions turns even if the model keeps requesting tools', async () => {
        const request: UserRequest = {
            sessionId: 'session',
            requestId: 'request',
            messages: [{ actor: 'user', type: 'text', text: 'hi' }],
            tools: [toolRequest('a', async () => 'a-result')]
        };
        // Every turn returns another tool call, so only the maxChatCompletions guard ends the loop.
        const openai: FakeOpenAi = {
            calls: [],
            chat: {
                completions: {
                    create: async (body: any) => {
                        openai.calls.push(body);
                        return new FakeStream([toolChunk(0, `call-${openai.calls.length}`, 'a', '{}')]);
                    }
                }
            }
        };

        await drain(makeIterator(openai, { request, maxChatCompletions: 3 }));

        expect(openai.calls).to.have.lengthOf(3);
    });

    it('does not start a request when already cancelled', async () => {
        const source = new CancellationTokenSource();
        source.cancel();
        const openai = fakeOpenAi([new FakeStream([textChunk('unused')])]);

        const parts = await drain(makeIterator(openai, { cancellationToken: source.token }));

        expect(openai.calls).to.have.lengthOf(0);
        expect(parts).to.deep.equal([]);
    });

    it('aborts the in-flight stream when cancelled mid-turn', async () => {
        const gate = new Deferred<void>();
        const stream = new FakeStream([textChunk('partial')], gate.promise);
        const openai = fakeOpenAi([stream]);
        const source = new CancellationTokenSource();

        const drained = drain(makeIterator(openai, { cancellationToken: source.token })).catch(error => error);
        await flush(); // allow create() to resolve and the stream to be awaited
        source.cancel();

        expect((stream.controller.abort as sinon.SinonSpy).called).to.equal(true);
        gate.resolve();
        await drained;
    });
});
