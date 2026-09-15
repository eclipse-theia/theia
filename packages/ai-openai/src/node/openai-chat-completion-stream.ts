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
import { CancellationError, CancellationToken, Disposable, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { OpenAI } from 'openai';
import { AbstractStreamingResponseIterator } from './streaming-response-iterator';
import {
    ChatCompletionAssistantMessageParam,
    ChatCompletionChunk,
    ChatCompletionCreateParamsStreaming,
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources';

/** A chat completion stream as returned by `chat.completions.create({ stream: true })`. */
type ChatCompletionChunkStream = AsyncIterable<ChatCompletionChunk>;

/** Accumulator for a single tool call streamed across multiple chunk deltas (keyed by `index`). */
interface CollectedToolCall {
    index: number;
    id: string;
    name: string;
    arguments: string;
    /** Whether the `finished: false` "open" part has already been emitted for this call. */
    opened: boolean;
}

export const ChatCompletionToolLoopOptions = Symbol('ChatCompletionToolLoopOptions');

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
    readonly maxRetries: number;
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
@injectable()
export class ChatCompletionStreamingAsyncIterator extends AbstractStreamingResponseIterator {

    protected messages: ChatCompletionMessageParam[];

    /**
     * Aborts the provider request. Its signal is handed to every `create()` call, so that it covers the
     * request while it is still in flight just as well as the chunk stream that it eventually yields.
     * The OpenAI SDK forwards the abort to the stream's own controller.
     */
    protected readonly abortController = new AbortController();

    @inject(ChatCompletionToolLoopOptions)
    protected readonly options: ChatCompletionToolLoopOptions;

    @inject(ToolCallExecutor)
    protected readonly toolCallExecutor: ToolCallExecutor;

    @inject(ILogger) @named('ai-openai:ChatCompletionStreamingAsyncIterator')
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.messages = [...this.options.messages];
        // Abort the provider request whenever the iterator terminates, including when the consumer
        // abandons it (`return()`), so that we never leave a request running for nobody.
        this.toDispose.push(Disposable.create(() => this.abortController.abort()));
        if (this.options.cancellationToken) {
            this.toDispose.push(this.options.cancellationToken.onCancellationRequested(() => this.cancel()));
        }
        this.startIteration();
    }

    protected get cancellationRequested(): boolean {
        return !!this.options.cancellationToken?.isCancellationRequested;
    }

    /**
     * Aborts the active provider stream and immediately terminates the iterator, so a `next()` call pending on
     * tool execution (which is only cooperatively cancelled via the token forwarded to handlers) settles promptly
     * instead of stalling until an uninterruptible handler eventually finishes.
     */
    protected cancel(): void {
        if (this.done) {
            // Already terminated: `dispose()` has aborted the request.
            return;
        }
        this.terminalError = new CancellationError();
        this.dispose();
    }

    protected async startIteration(): Promise<void> {
        try {
            while (!this.done && !this.cancellationRequested) {
                const { assistantText, toolCalls } = await this.processStream();
                if (this.done || this.cancellationRequested) {
                    // Cancelled or abandoned while the stream was wrapping up: don't start executing the
                    // collected tool calls.
                    break;
                }
                if (toolCalls.length === 0) {
                    // No tool calls: the conversation is complete.
                    this.dispose();
                    return;
                }
                await this.executeAndAppendToolCalls(assistantText, toolCalls);
            }
            // Cancelled or abandoned before the model stopped requesting tools. `cancel()` (via the cancellation
            // listener) or `return()` has already disposed the iterator; this is a no-op unless cancellation was
            // observed some other way.
            this.dispose();
        } catch (error) {
            if (this.cancellationRequested) {
                this.terminalError = new CancellationError();
            } else if (!this.done) {
                this.logger.error('Error in OpenAI chat completion stream:', error);
                this.terminalError = error instanceof Error ? error : new Error(String(error));
            }
            // Otherwise the iterator was already terminated and the error is just the fall-out of the
            // abort that `dispose()` triggered, so there is nobody left to report it to.
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
        const stream = await this.options.openai.chat.completions.create(body, {
            maxRetries: this.options.maxRetries,
            signal: this.abortController.signal
        }) as unknown as ChatCompletionChunkStream;

        for await (const chunk of stream) {
            if (this.done || this.cancellationRequested) {
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
        // Open the tool call (emit a `finished: false` part) once we know both its ID and name. `merge` on the
        // receiving `ToolCallChatResponseContentImpl` never updates the name afterwards, so opening early with an
        // empty name would leave the call nameless for good.
        if (!slot.opened && slot.id && slot.name) {
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

    /**
     * Drops parts arriving after the iterator is done (in particular after {@link cancel} disposed it while tool
     * execution was still in flight), so an uninterruptible handler that finishes late cannot surface a
     * finished tool-call part - or any other part - as if it were still part of the live turn.
     */
    protected override handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.done) {
            return;
        }
        super.handleIncoming(message);
    }

    protected async executeAndAppendToolCalls(assistantText: string, toolCalls: CollectedToolCall[]): Promise<void> {
        const results = await this.toolCallExecutor.executeToolCalls(
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

}

export const ChatCompletionStreamingAsyncIteratorFactory = Symbol('ChatCompletionStreamingAsyncIteratorFactory');
/**
 * Creates the iterator that drives a tool-calling chat-completion turn. Rebind in the DI container
 * to substitute a customized {@link ChatCompletionStreamingAsyncIterator} implementation.
 */
export type ChatCompletionStreamingAsyncIteratorFactory =
    (options: ChatCompletionToolLoopOptions) => ChatCompletionStreamingAsyncIterator;
