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
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    TokenUsageService,
    TokenUsageParams,
    UserRequest,
    LLMImageData
} from '@theia/ai-core';
import { CancellationToken, isArray } from '@theia/core';
import { Anthropic } from '@anthropic-ai/sdk';
import { Message, MessageParam } from '@anthropic-ai/sdk/resources';

export const DEFAULT_MAX_TOKENS = 4096;

interface ToolCallback {
    readonly name: string;
    readonly id: string;
    readonly index: number;
    args: string;
}

const createMessageContent = (message: LanguageModelMessage): MessageParam['content'] => {
    if (LanguageModelMessage.isTextMessage(message)) {
        return message.text;
    } else if (LanguageModelMessage.isThinkingMessage(message)) {
        return [{ signature: message.signature, thinking: message.thinking, type: 'thinking' }];
    } else if (LanguageModelMessage.isToolUseMessage(message)) {
        return [{ id: message.id, input: message.input, name: message.name, type: 'tool_use' }];
    } else if (LanguageModelMessage.isToolResultMessage(message)) {
        return [{ type: 'tool_result', tool_use_id: message.tool_use_id }];
    } else if (LanguageModelMessage.isImageMessage(message)) {
        if (LLMImageData.isBase64ImageData(message.image)) {
            return [{ type: 'image', source: { type: 'base64', media_type: message.image.mediaType, data: message.image.imageData } }];
        }
    }
    throw new Error(`Unknown message type:'${JSON.stringify(message)}'`);
};

/**
 * Transforms Theia language model messages to Anthropic API format
 * @param messages Array of LanguageModelRequestMessage to transform
 * @returns Object containing transformed messages and optional system message
 */
function transformToAnthropicParams(
    messages: readonly LanguageModelMessage[]
): { messages: MessageParam[]; systemMessage?: string } {
    // Extract the system message (if any), as it is a separate parameter in the Anthropic API.
    const systemMessageObj = messages.find(message => message.actor === 'system');
    const systemMessage = systemMessageObj && LanguageModelMessage.isTextMessage(systemMessageObj) && systemMessageObj.text || undefined;

    const convertedMessages = messages
        .filter(message => message.actor !== 'system')
        .map(message => ({
            role: toAnthropicRole(message),
            content: createMessageContent(message)
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
function toAnthropicRole(message: LanguageModelMessage): 'user' | 'assistant' {
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
        public maxTokens: number = DEFAULT_MAX_TOKENS,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    protected getSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return request.settings ?? {};
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
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
        request: UserRequest,
        cancellationToken?: CancellationToken,
        toolMessages?: readonly Anthropic.Messages.MessageParam[]
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const { messages, systemMessage } = transformToAnthropicParams(request.messages);
        const tools = this.createTools(request);
        const params: Anthropic.MessageCreateParams = {
            max_tokens: this.maxTokens,
            messages: [...messages, ...(toolMessages ?? [])],
            tools,
            tool_choice: tools ? { type: 'auto' } : undefined,
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
                const currentMessages: Message[] = [];
                let currentMessage: Message | undefined = undefined;

                for await (const event of stream) {
                    if (event.type === 'content_block_start') {
                        const contentBlock = event.content_block;

                        if (contentBlock.type === 'thinking') {
                            yield { thought: contentBlock.thinking, signature: contentBlock.signature ?? '' };
                        }
                        if (contentBlock.type === 'text') {
                            yield { content: contentBlock.text };
                        }
                        if (contentBlock.type === 'tool_use') {
                            toolCall = { name: contentBlock.name!, args: '', id: contentBlock.id!, index: event.index };
                            yield { tool_calls: [{ finished: false, id: toolCall.id, function: { name: toolCall.name, arguments: toolCall.args } }] };
                        }
                    } else if (event.type === 'content_block_delta') {
                        const delta = event.delta;
                        if (delta.type === 'thinking_delta') {
                            yield { thought: delta.thinking, signature: '' };
                        }
                        if (delta.type === 'signature_delta') {
                            yield { thought: '', signature: delta.signature };
                        }
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
                    } else if (event.type === 'message_start') {
                        currentMessages.push(event.message);
                        currentMessage = event.message;
                    } else if (event.type === 'message_stop') {
                        if (currentMessage) {
                            yield { input_tokens: currentMessage.usage.input_tokens, output_tokens: currentMessage.usage.output_tokens };
                            // Record token usage if token usage service is available
                            if (that.tokenUsageService && currentMessage.usage) {
                                const tokenUsageParams: TokenUsageParams = {
                                    inputTokens: currentMessage.usage.input_tokens,
                                    outputTokens: currentMessage.usage.output_tokens,
                                    requestId: request.requestId
                                };
                                await that.tokenUsageService.recordTokenUsage(that.id, tokenUsageParams);
                            }
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

                    const toolResponseMessage: Anthropic.Messages.MessageParam = {
                        role: 'user',
                        content: toolResult.map(call => ({
                            type: 'tool_result',
                            tool_use_id: call.id!,
                            content: that.formatToolCallResult(call.result)
                        }))
                    };
                    const result = await that.handleStreamingRequest(
                        anthropic,
                        request,
                        cancellationToken,
                        [
                            ...(toolMessages ?? []),
                            ...currentMessages.map(m => ({ role: m.role, content: m.content })),
                            toolResponseMessage
                        ]);
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
        if (request.tools?.length === 0) {
            return undefined;
        }
        return request.tools?.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
        } as Anthropic.Messages.Tool));
    }

    protected async handleNonStreamingRequest(
        anthropic: Anthropic,
        request: UserRequest
    ): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const { messages, systemMessage } = transformToAnthropicParams(request.messages);

        const params: Anthropic.MessageCreateParams = {
            max_tokens: this.maxTokens,
            messages,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings,
        };

        try {
            const response = await anthropic.messages.create(params);
            const textContent = response.content[0];

            // Record token usage if token usage service is available
            if (this.tokenUsageService && response.usage) {
                const tokenUsageParams: TokenUsageParams = {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                    requestId: request.requestId
                };
                await this.tokenUsageService.recordTokenUsage(this.id, tokenUsageParams);
            }

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
