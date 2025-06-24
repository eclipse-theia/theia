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

import { LanguageModelStreamResponsePart, TokenUsageService, TokenUsageParams, ToolCallResult, ToolCallTextResult } from '@theia/ai-core';
import { CancellationError, CancellationToken, Disposable, DisposableCollection } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ChatCompletionStream, ChatCompletionStreamEvents } from 'openai/lib/ChatCompletionStream';
import { ChatCompletionContentPartText } from 'openai/resources';

type IterResult = IteratorResult<LanguageModelStreamResponsePart>;

export class StreamingAsyncIterator implements AsyncIterableIterator<LanguageModelStreamResponsePart>, Disposable {
    protected readonly requestQueue = new Array<Deferred<IterResult>>();
    protected readonly messageCache = new Array<LanguageModelStreamResponsePart>();
    protected done = false;
    protected terminalError: Error | undefined = undefined;
    protected readonly toDispose = new DisposableCollection();

    constructor(
        protected readonly stream: ChatCompletionStream,
        protected readonly requestId: string,
        cancellationToken?: CancellationToken,
        protected readonly tokenUsageService?: TokenUsageService,
        protected readonly model?: string,
    ) {
        this.registerStreamListener('error', error => {
            console.error('Error in OpenAI chat completion stream:', error);
            this.terminalError = error;
            this.dispose();
        });
        this.registerStreamListener('abort', () => {
            this.terminalError = new CancellationError();
            this.dispose();
        }, true);
        this.registerStreamListener('message', message => {
            if (message.role === 'tool') {
                this.handleIncoming({
                    tool_calls: [{
                        id: message.tool_call_id,
                        finished: true,
                        result: tryParseToolResult(message.content)
                    }]
                });
            }
            console.debug('Received Open AI message', JSON.stringify(message));
        });
        this.registerStreamListener('end', () => {
            this.dispose();
        }, true);
        this.registerStreamListener('chunk', (chunk, snapshot) => {
            // Handle token usage reporting
            if (chunk.usage && this.tokenUsageService && this.model) {
                const inputTokens = chunk.usage.prompt_tokens || 0;
                const outputTokens = chunk.usage.completion_tokens || 0;
                if (inputTokens > 0 || outputTokens > 0) {
                    const tokenUsageParams: TokenUsageParams = {
                        inputTokens,
                        outputTokens,
                        requestId
                    };
                    this.tokenUsageService.recordTokenUsage(this.model, tokenUsageParams)
                        .catch(error => console.error('Error recording token usage:', error));
                }
            }
            // OpenAI API defines the type of a tool_call as optional but fails if it is not set
            if (snapshot?.choices[0]?.message?.tool_calls) {
                snapshot.choices[0].message.tool_calls.forEach(call => {
                    if (call.type === undefined) {
                        call.type = 'function';
                    }
                });
            }
            this.handleIncoming({ ...chunk.choices[0]?.delta as LanguageModelStreamResponsePart });
        });
        if (cancellationToken) {
            this.toDispose.push(cancellationToken.onCancellationRequested(() => stream.abort()));
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<LanguageModelStreamResponsePart> { return this; }

    next(): Promise<IterResult> {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        // Deliver all the messages we got, even if we've since terminated.
        if (this.messageCache.length) {
            return Promise.resolve({
                done: false,
                value: this.messageCache.shift()!
            });
        } else if (this.terminalError) {
            return Promise.reject(this.terminalError);
        } else if (this.done) {
            return Promise.resolve({
                done: true,
                value: undefined
            });
        } else {
            const toQueue = new Deferred<IterResult>();
            this.requestQueue.push(toQueue);
            return toQueue.promise;
        }
    }

    protected handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }
        if (this.requestQueue.length) {
            this.requestQueue.shift()!.resolve({
                done: false,
                value: message
            });
        } else {
            this.messageCache.push(message);
        }
    }

    protected registerStreamListener<Event extends keyof ChatCompletionStreamEvents>(eventType: Event, handler: ChatCompletionStreamEvents[Event], once?: boolean): void {
        if (once) {
            this.stream.once(eventType, handler);
        } else {
            this.stream.on(eventType, handler);
        }
        this.toDispose.push({ dispose: () => this.stream.off(eventType, handler) });
    }

    dispose(): void {
        this.done = true;
        this.toDispose.dispose();
        // We will be receiving no more messages. Any outstanding requests have to be handled.
        if (this.terminalError) {
            this.requestQueue.forEach(request => request.reject(this.terminalError));
        } else {
            this.requestQueue.forEach(request => request.resolve({ done: true, value: undefined }));
        }
        // Leave the message cache alone - if it was populated, then the request queue was empty, but we'll still try to deliver the messages if asked.
        this.requestQueue.length = 0;
    }
}

function tryParseToolResult(result: string | ChatCompletionContentPartText[]): ToolCallResult {
    try {
        if (typeof result === 'string') {
            return JSON.parse(result);
        }
        return {
            content: result.map<ToolCallTextResult>(part => ({
                type: 'text',
                text: part.text
            }))
        };
    } catch (error) {
        return result;
    }
}
