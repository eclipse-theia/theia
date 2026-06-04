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

import { LanguageModelStreamResponsePart, ToolCallExecutor, ToolCallResult, UserRequest } from '@theia/ai-core';
import { CancellationError, CancellationToken, Disposable, DisposableCollection } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { OpenAI } from 'openai';
import {
    ChatCompletionAssistantMessageParam,
    ChatCompletionChunk,
    ChatCompletionCreateParamsStreaming,
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources';

type IterResult = IteratorResult<LanguageModelStreamResponsePart>;

/** A chat completion stream as returned by `chat.completions.create({ stream: true })`. */
type ChatCompletionChunkStream = AsyncIterable<ChatCompletionChunk> & { controller: AbortController };

/** Accumulator for a single tool call streamed across multiple chunk deltas (keyed by `index`). */
interface CollectedToolCall {
    index: number;
    id: string;
    name: string;
    arguments: string;
    /** Whether the `finished: false` "open" part has already been emitted for this call. */
    opened: boolean;
}

export interface ChatCompletionToolLoopOptions {
    readonly openai: OpenAI;
    readonly model: string;
    /** The originating request; its `tools` carry the actual handlers to invoke. */
    readonly request: UserRequest;
    /** The already-processed messages that seed the conversation. */
    readonly messages: ChatCompletionMessageParam[];
    /** Additional request settings (may include `stream_options`, temperature, etc.). */
    readonly settings: Record<string, unknown>;
    readonly tools: ChatCompletionTool[];
    /** Maximum number of chat completions (turns); each tool round counts as one. */
    readonly maxChatCompletions: number;
    readonly maxRetries: number;
    readonly toolCallExecutor: ToolCallExecutor;
    readonly cancellationToken?: CancellationToken;
}

/**
 * Drives a multi-turn OpenAI Chat Completions conversation with tool calling, executing the tool
 * calls of each turn **concurrently** via {@link ToolCallExecutor}.
 *
 * This replaces the OpenAI SDK's `chat.completions.runTools(...)` runner, whose built-in tool loop
 * executes tool calls strictly sequentially. By driving the raw chunk stream
 * (`chat.completions.create({ stream: true })`) ourselves, multiple tool calls emitted in a single
 * model turn (e.g. parallel agent delegations) run in parallel.
 */
export class ChatCompletionStreamingAsyncIterator implements AsyncIterableIterator<LanguageModelStreamResponsePart>, Disposable {
    protected readonly requestQueue = new Array<Deferred<IterResult>>();
    protected readonly messageCache = new Array<LanguageModelStreamResponsePart>();
    protected done = false;
    protected terminalError: Error | undefined = undefined;
    protected readonly toDispose = new DisposableCollection();

    protected readonly messages: ChatCompletionMessageParam[];
    protected iteration = 0;
    protected currentStream?: ChatCompletionChunkStream;

    constructor(protected readonly options: ChatCompletionToolLoopOptions) {
        this.messages = [...options.messages];
        if (options.cancellationToken) {
            this.toDispose.push(options.cancellationToken.onCancellationRequested(() => this.currentStream?.controller.abort()));
        }
        this.startIteration();
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<LanguageModelStreamResponsePart> {
        return this;
    }

    next(): Promise<IterResult> {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        // Deliver all the messages we got, even if we've since terminated.
        if (this.messageCache.length) {
            return Promise.resolve({ done: false, value: this.messageCache.shift()! });
        } else if (this.terminalError) {
            return Promise.reject(this.terminalError);
        } else if (this.done) {
            return Promise.resolve({ done: true, value: undefined });
        } else {
            const toQueue = new Deferred<IterResult>();
            this.requestQueue.push(toQueue);
            return toQueue.promise;
        }
    }

    protected get cancellationRequested(): boolean {
        return !!this.options.cancellationToken?.isCancellationRequested;
    }

    protected async startIteration(): Promise<void> {
        try {
            while (this.iteration < this.options.maxChatCompletions && !this.cancellationRequested) {
                const { assistantText, toolCalls } = await this.processStream();
                if (toolCalls.length === 0) {
                    // No tool calls: the conversation is complete.
                    this.dispose();
                    return;
                }
                await this.executeAndAppendToolCalls(assistantText, toolCalls);
                this.iteration++;
            }
            // Reached the maximum number of completions (or was cancelled).
            this.dispose();
        } catch (error) {
            if (this.cancellationRequested) {
                this.terminalError = new CancellationError();
            } else {
                console.error('Error in OpenAI chat completion stream:', error);
                this.terminalError = error instanceof Error ? error : new Error(String(error));
            }
            this.dispose();
        }
    }

    /** Streams a single completion, emitting text/tool-call parts and collecting the turn's tool calls. */
    protected async processStream(): Promise<{ assistantText: string; toolCalls: CollectedToolCall[] }> {
        const collected = new Map<number, CollectedToolCall>();
        let assistantText = '';

        const body = {
            model: this.options.model,
            messages: this.messages,
            stream: true,
            tools: this.options.tools,
            tool_choice: 'auto',
            ...this.options.settings
        } as ChatCompletionCreateParamsStreaming;
        const stream = await this.options.openai.chat.completions.create(body, { maxRetries: this.options.maxRetries }) as unknown as ChatCompletionChunkStream;
        this.currentStream = stream;

        for await (const chunk of stream) {
            if (this.cancellationRequested) {
                break;
            }
            if (chunk.usage) {
                const inputTokens = chunk.usage.prompt_tokens || 0;
                const outputTokens = chunk.usage.completion_tokens || 0;
                if (inputTokens > 0 || outputTokens > 0) {
                    this.handleIncoming({ input_tokens: inputTokens, output_tokens: outputTokens });
                }
            }
            const delta = chunk.choices[0]?.delta;
            if (!delta) {
                continue;
            }
            // Some providers stream reasoning tokens on the delta; surface them as thoughts.
            const reasoning = (delta as { reasoning?: string; reasoning_content?: string }).reasoning
                ?? (delta as { reasoning_content?: string }).reasoning_content;
            if (reasoning) {
                this.handleIncoming({ thought: reasoning, signature: '' });
            }
            if (delta.content) {
                assistantText += delta.content;
                this.handleIncoming({ content: delta.content });
            }
            for (const toolCallDelta of delta.tool_calls ?? []) {
                this.collectToolCallDelta(collected, toolCallDelta);
            }
        }

        return { assistantText, toolCalls: [...collected.values()].sort((a, b) => a.index - b.index) };
    }

    protected collectToolCallDelta(collected: Map<number, CollectedToolCall>, toolCallDelta: ChatCompletionChunk.Choice.Delta.ToolCall): void {
        let slot = collected.get(toolCallDelta.index);
        if (!slot) {
            slot = { index: toolCallDelta.index, id: toolCallDelta.id ?? '', name: '', arguments: '', opened: false };
            collected.set(toolCallDelta.index, slot);
        }
        if (toolCallDelta.id && !slot.id) {
            slot.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
            slot.name += toolCallDelta.function.name;
        }
        // Open the tool call (emit a `finished: false` part) as soon as we know its ID.
        if (!slot.opened && slot.id) {
            slot.opened = true;
            this.handleIncoming({ tool_calls: [{ id: slot.id, finished: false, function: { name: slot.name, arguments: '' } }] });
        }
        if (toolCallDelta.function?.arguments) {
            slot.arguments += toolCallDelta.function.arguments;
            if (slot.opened) {
                this.handleIncoming({ tool_calls: [{ id: slot.id, argumentsDelta: true, function: { arguments: toolCallDelta.function.arguments } }] });
            }
        }
    }

    protected async executeAndAppendToolCalls(assistantText: string, toolCalls: CollectedToolCall[]): Promise<void> {
        // Tool calls of a single turn are executed concurrently; see ToolCallExecutor.
        const results = await this.options.toolCallExecutor.executeToolCalls(
            toolCalls.map(toolCall => ({ id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments || '{}' })),
            this.options.request.tools,
            { cancellationToken: this.options.cancellationToken }
        );

        // Emit the finished tool calls (in stable input order).
        for (const result of results) {
            this.handleIncoming({
                tool_calls: [{ id: result.id, finished: true, function: { name: result.name, arguments: result.arguments }, result: result.result }]
            });
        }

        // Append the assistant turn and the tool results so the next completion sees them.
        // Every assistant tool_call must be paired with a tool message that has the same ID.
        const assistantMessage: ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            tool_calls: toolCalls.map(toolCall => ({
                id: toolCall.id,
                type: 'function',
                function: { name: toolCall.name, arguments: toolCall.arguments || '{}' }
            }))
        };
        if (assistantText) {
            assistantMessage.content = assistantText;
        }
        this.messages.push(assistantMessage);
        for (const result of results) {
            this.messages.push({ role: 'tool', tool_call_id: result.id, content: this.formatToolResult(result.result) });
        }
    }

    protected formatToolResult(result: ToolCallResult): string {
        if (result === undefined) {
            return '';
        }
        return typeof result === 'string' ? result : JSON.stringify(result);
    }

    protected handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        if (this.requestQueue.length) {
            this.requestQueue.shift()!.resolve({ done: false, value: message });
        } else {
            this.messageCache.push(message);
        }
    }

    dispose(): void {
        this.done = true;
        this.toDispose.dispose();
        // No more messages will arrive; resolve or reject any outstanding requests.
        if (this.terminalError) {
            this.requestQueue.forEach(request => request.reject(this.terminalError));
        } else {
            this.requestQueue.forEach(request => request.resolve({ done: true, value: undefined }));
        }
        // Leave the message cache intact: if it is populated the request queue was empty, and we
        // still want to deliver those messages when asked.
        this.requestQueue.length = 0;
    }
}
