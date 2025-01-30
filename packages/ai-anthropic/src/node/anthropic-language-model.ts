// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import {
    LanguageModel,
    LanguageModelRequest,
    LanguageModelRequestMessage,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse
} from '@theia/ai-core';
import { CancellationToken, isArray } from '@theia/core';
import { Anthropic } from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';

const DEFAULT_MAX_TOKENS_STREAMING = 4096;
const DEFAULT_MAX_TOKENS_NON_STREAMING = 2048;
const EMPTY_INPUT_SCHEMA = {
    type: 'object',
    properties: {},
    required: []
} as const;

interface ToolCallback {
    readonly name: string;
    readonly id: string;
    readonly index: number;
    args: string;
}

/**
 * Transforms Theia language model messages to Anthropic API format
 * @param messages Array of LanguageModelRequestMessage to transform
 * @returns Object containing transformed messages and optional system message
 */
function transformToAnthropicParams(
    messages: readonly LanguageModelRequestMessage[]
): { messages: MessageParam[]; systemMessage?: string } {
    // Extract the system message (if any), as it is a separate parameter in the Anthropic API.
    const systemMessageObj = messages.find(message => message.actor === 'system');
    const systemMessage = systemMessageObj?.query;

    const convertedMessages = messages
        .filter(message => message.actor !== 'system')
        .map(message => ({
            role: toAnthropicRole(message),
            content: message.query || '',
        }));

    return {
        messages: convertedMessages,
        systemMessage,
    };
}

export const AnthropicModelIdentifier = Symbol('AnthropicModelIdentifier');

/**
 * Converts Theia message actor to Anthropic role
 * @param message The message to convert
 * @returns Anthropic role ('user' or 'assistant')
 */
function toAnthropicRole(message: LanguageModelRequestMessage): 'user' | 'assistant' {
    switch (message.actor) {
        case 'ai':
            return 'assistant';
        default:
            return 'user';
    }
}

/**
 * Implements the Anthropic language model integration for Theia
 */
export class AnthropicModel implements LanguageModel {

    constructor(
        public readonly id: string,
        public model: string,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public defaultRequestSettings?: Readonly<Record<string, unknown>>
    ) { }

    protected getSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return request.settings ?? this.defaultRequestSettings ?? {};
    }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        if (!request.messages?.length) {
            throw new Error('Request must contain at least one message');
        }

        const anthropic = this.initializeAnthropic();

        try {
            if (this.enableStreaming) {
                return this.handleStreamingRequest(anthropic, request, cancellationToken);
            }
            return this.handleNonStreamingRequest(anthropic, request);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Anthropic API request failed: ${errorMessage}`);
        }
    }

    protected formatToolCallResult(result: unknown): string | Array<{ type: 'text', text: string }> {
        if (typeof result === 'object' && result && 'content' in result && Array.isArray(result.content) &&
            result.content.every(item => typeof item === 'object' && item && 'type' in item && 'text' in item)) {
            return result.content;
        }

        if (isArray(result)) {
            return result.map(r => ({ type: 'text', text: r as string }));
        }

        if (typeof result === 'object') {
            return JSON.stringify(result);
        }

        return result as string;
    }

    protected async handleStreamingRequest(
        anthropic: Anthropic,
        request: LanguageModelRequest,
        cancellationToken?: CancellationToken,
        toolMessages?: readonly Anthropic.Messages.MessageParam[]
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const { messages, systemMessage } = transformToAnthropicParams(request.messages);
        const tools = this.createTools(request);
        const params: Anthropic.MessageCreateParams = {
            max_tokens: DEFAULT_MAX_TOKENS_STREAMING,
            messages: [...messages, ...(toolMessages ?? [])],
            tools,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings
        };

        const stream = anthropic.messages.stream(params);

        cancellationToken?.onCancellationRequested(() => {
            stream.abort();
        });
        const that = this;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {

                const toolCalls: ToolCallback[] = [];
                let toolCall: ToolCallback | undefined;

                for await (const event of stream) {
                    if (event.type === 'content_block_start') {
                        const contentBlock = event.content_block;

                        if (contentBlock.type === 'text') {
                            yield { content: contentBlock.text };
                        }
                        if (contentBlock.type === 'tool_use') {
                            toolCall = { name: contentBlock.name!, args: '', id: contentBlock.id!, index: event.index };
                            yield { tool_calls: [{ finished: false, id: toolCall.id, function: { name: toolCall.name, arguments: toolCall.args } }] };
                        }
                    } else if (event.type === 'content_block_delta') {
                        const delta = event.delta;

                        if (delta.type === 'text_delta') {
                            yield { content: delta.text };
                        }
                        if (toolCall && delta.type === 'input_json_delta') {
                            toolCall.args += delta.partial_json;
                            yield { tool_calls: [{ function: { arguments: delta.partial_json } }] };
                        }
                    } else if (event.type === 'content_block_stop') {
                        if (toolCall && toolCall.index === event.index) {
                            toolCalls.push(toolCall);
                            toolCall = undefined;
                        }
                    } else if (event.type === 'message_delta') {
                        if (event.delta.stop_reason === 'max_tokens') {
                            if (toolCall) {
                                yield { tool_calls: [{ finished: true, id: toolCall.id }] };
                            }
                            throw new Error(`The response was stopped because it exceeded the max token limit of ${event.usage.output_tokens}.`);
                        }
                    }
                }
                if (toolCalls.length > 0) {
                    const toolResult = await Promise.all(toolCalls.map(async tc => {
                        const tool = request.tools?.find(t => t.name === tc.name);
                        const argsObject = tc.args.length === 0 ? '{}' : tc.args;

                        return { name: tc.name, result: (await tool?.handler(argsObject)), id: tc.id, arguments: argsObject };

                    }));

                    const calls = toolResult.map(tr => {
                        const resultAsString = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
                        return { finished: true, id: tr.id, result: resultAsString, function: { name: tr.name, arguments: tr.arguments } };
                    });
                    yield { tool_calls: calls };

                    const toolRequestMessage: Anthropic.Messages.MessageParam = {
                        role: 'assistant',
                        content: toolResult.map(call => ({

                            type: 'tool_use',
                            id: call.id,
                            name: call.name,
                            input: JSON.parse(call.arguments)
                        }))
                    };

                    const toolResponseMessage: Anthropic.Messages.MessageParam = {
                        role: 'user',
                        content: toolResult.map(call => ({
                            type: 'tool_result',
                            tool_use_id: call.id!,
                            content: that.formatToolCallResult(call.result)
                        }))
                    };
                    const result = await that.handleStreamingRequest(anthropic, request, cancellationToken, [...(toolMessages ?? []), toolRequestMessage, toolResponseMessage]);
                    for await (const nestedEvent of result.stream) {
                        yield nestedEvent;
                    }
                }
            },
        };

        stream.on('error', (error: Error) => {
            console.error('Error in Anthropic streaming:', error);
        });

        return { stream: asyncIterator };
    }

    private createTools(request: LanguageModelRequest): Anthropic.Messages.Tool[] | undefined {
        return request.tools?.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters ?? EMPTY_INPUT_SCHEMA
        } as Anthropic.Messages.Tool));
    }

    protected async handleNonStreamingRequest(
        anthropic: Anthropic,
        request: LanguageModelRequest
    ): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);

        const { messages, systemMessage } = transformToAnthropicParams(request.messages);

        const params: Anthropic.MessageCreateParams = {
            max_tokens: DEFAULT_MAX_TOKENS_NON_STREAMING,
            messages,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings,
        };

        try {
            const response = await anthropic.messages.create(params);
            const textContent = response.content[0];

            if (textContent?.type === 'text') {
                return { text: textContent.text };
            }

            return { text: '' };
        } catch (error) {
            throw new Error(`Failed to get response from Anthropic API: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected initializeAnthropic(): Anthropic {
        const apiKey = this.apiKey();
        if (!apiKey) {
            throw new Error('Please provide ANTHROPIC_API_KEY in preferences or via environment variable');
        }

        return new Anthropic({ apiKey });
    }
}
