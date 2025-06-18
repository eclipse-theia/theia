// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    ToolCall,
    ToolRequest,
    ToolRequestParametersProperties,
    ImageContent,
    TokenUsageService
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { ChatRequest, Message, Ollama, Options, Tool, ToolCall as OllamaToolCall, ChatResponse } from 'ollama';

export const OllamaModelIdentifier = Symbol('OllamaModelIdentifier');

export class OllamaModel implements LanguageModel {

    protected readonly DEFAULT_REQUEST_SETTINGS: Partial<Omit<ChatRequest, 'stream' | 'model'>> = {
        keep_alive: '15m',
        // options see: https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
        options: {}
    };

    readonly providerId = 'ollama';
    readonly vendor: string = 'Ollama';

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the unique model name as used in the Ollama environment.
     * @param hostProvider a function to provide the host URL for the Ollama server.
     */
    constructor(
        public readonly id: string,
        protected readonly model: string,
        protected host: () => string | undefined,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const ollama = this.initializeOllama();
        const stream = !(request.settings?.stream === false); // true by default, false only if explicitly specified
        const ollamaRequest: ExtendedChatRequest = {
            model: this.model,
            ...this.DEFAULT_REQUEST_SETTINGS,
            ...settings,
            messages: request.messages.map(m => this.toOllamaMessage(m)).filter(m => m !== undefined) as Message[],
            tools: request.tools?.map(t => this.toOllamaTool(t)),
            stream
        };
        const structured = request.response_format?.type === 'json_schema';
        return this.dispatchRequest(ollama, ollamaRequest, structured, cancellationToken);
    }

    /**
     * Retrieves the settings for the chat request, merging the request-specific settings with the default settings.
     * @param request The language model request containing specific settings.
     * @returns A partial ChatRequest object containing the merged settings.
     */
    protected getSettings(request: LanguageModelRequest): Partial<ChatRequest> {
        const settings = request.settings ?? {};
        return {
            options: settings as Partial<Options>
        };
    }

    protected async dispatchRequest(ollama: Ollama, ollamaRequest: ExtendedChatRequest, structured: boolean, cancellation?: CancellationToken): Promise<LanguageModelResponse> {

        // Handle structured output request
        if (structured) {
            return this.handleStructuredOutputRequest(ollama, ollamaRequest);
        }

        if (isNonStreaming(ollamaRequest)) {
            // handle non-streaming request
            return this.handleNonStreamingRequest(ollama, ollamaRequest, cancellation);
        }

        // handle streaming request
        return this.handleStreamingRequest(ollama, ollamaRequest, cancellation);
    }

    protected async handleStreamingRequest(ollama: Ollama, chatRequest: ExtendedChatRequest, cancellation?: CancellationToken): Promise<LanguageModelStreamResponse> {
        const responseStream = await ollama.chat({
            ...chatRequest,
            stream: true,
            think: await this.checkThinkingSupport(ollama, chatRequest.model)
        });

        cancellation?.onCancellationRequested(() => {
            responseStream.abort();
        });

        const that = this;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                // Process the response stream and collect thinking, content messages, and tool calls.
                // Tool calls are handled when the response stream is done.
                const toolCalls: OllamaToolCall[] = [];
                let currentContent = '';
                let currentThought = '';

                // Ollama does not have ids, so we use the most recent chunk.created_at timestamp as repalcement
                let lastUpdated: Date = new Date();

                try {
                    for await (const chunk of responseStream) {
                        lastUpdated = chunk.created_at;

                        const thought = chunk.message.thinking;
                        if (thought) {
                            currentThought += thought;
                            yield { thought, signature: '' };
                        }
                        const textContent = chunk.message.content;
                        if (textContent) {
                            currentContent += textContent;
                            yield { content: textContent };
                        }

                        if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
                            toolCalls.push(...chunk.message.tool_calls);
                        }

                        if (chunk.done) {
                            that.recordTokenUsage(chunk);

                            if (chunk.done_reason && chunk.done_reason !== 'stop') {
                                throw new Error('Ollama stopped unexpectedly. Reason: ' + chunk.done_reason);
                            }
                        }
                    }

                    if (toolCalls && toolCalls.length > 0) {
                        chatRequest.messages.push({
                            role: 'assistant',
                            content: currentContent,
                            thinking: currentThought,
                            tool_calls: toolCalls
                        });

                        const toolCallsForResponse = await that.processToolCalls(toolCalls, chatRequest, lastUpdated);
                        yield { tool_calls: toolCallsForResponse };

                        // Continue the conversation with tool results
                        const continuedResponse = await that.handleStreamingRequest(
                            ollama,
                            chatRequest,
                            cancellation
                        );

                        // Stream the continued response
                        for await (const nestedEvent of continuedResponse.stream) {
                            yield nestedEvent;
                        }
                    }
                } catch (error) {
                    console.error('Error in Ollama streaming:', error.message);
                    throw error;
                }
            }
        };

        return { stream: asyncIterator };
    }

    /**
     * Check if the Ollama server supports thinking.
     *
     * Use the Ollama 'show' request to get information about the model, so we can check the capabilities for the 'thinking' capability.
     *
     * @param ollama The Ollama client instance.
     * @param model The name of the Ollama model.
     * @returns A boolean indicating whether the Ollama model supports thinking.
     */
    protected async checkThinkingSupport(ollama: Ollama, model: string): Promise<boolean> {
        const result = await ollama.show({ model });
        return result.capabilities.includes('thinking');
    }

    protected async handleStructuredOutputRequest(ollama: Ollama, chatRequest: ChatRequest): Promise<LanguageModelParsedResponse> {
        const response = await ollama.chat({
            ...chatRequest,
            format: 'json',
            stream: false,
        });
        try {
            return {
                content: response.message.content,
                parsed: JSON.parse(response.message.content)
            };
        } catch (error) {
            // TODO use ILogger
            console.log('Failed to parse structured response from the language model.', error);
            return {
                content: response.message.content,
                parsed: {}
            };
        }
    }

    protected async handleNonStreamingRequest(ollama: Ollama, chatRequest: ExtendedNonStreamingChatRequest, cancellation?: CancellationToken): Promise<LanguageModelResponse> {
        try {
            // even though we have a non-streaming request, we still use the streaming version for two reasons:
            // 1. we can abort the stream if the request is cancelled instead of having to wait for the entire response
            // 2. we can use think: true so the Ollama API separates thinking from content and we can filter out the thoughts in the response
            const responseStream = await ollama.chat({ ...chatRequest, stream: true, think: await this.checkThinkingSupport(ollama, chatRequest.model) });
            cancellation?.onCancellationRequested(() => {
                responseStream.abort();
            });

            const toolCalls: OllamaToolCall[] = [];
            let content = '';
            let lastUpdated: Date = new Date();

            // process the response stream
            for await (const chunk of responseStream) {
                // if the response contains content, append it to the result
                const textContent = chunk.message.content;
                if (textContent) {
                    content += textContent;
                }

                // record requested tool calls so we can process them later
                if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
                    toolCalls.push(...chunk.message.tool_calls);
                }

                // if the response is done, record the token usage and check the done reason
                if (chunk.done) {
                    this.recordTokenUsage(chunk);
                    lastUpdated = chunk.created_at;
                    if (chunk.done_reason && chunk.done_reason !== 'stop') {
                        throw new Error('Ollama stopped unexpectedly. Reason: ' + chunk.done_reason);
                    }
                }
            }

            // process any tool calls by adding all of them to the messages of the conversation
            if (toolCalls && toolCalls.length > 0) {
                chatRequest.messages.push({
                    role: 'assistant',
                    content: content,
                    tool_calls: toolCalls
                });

                await this.processToolCalls(toolCalls, chatRequest, lastUpdated);
                if (cancellation?.isCancellationRequested) {
                    return { text: '' };
                }

                // recurse to get the final response content (the intermediate content remains hidden, it is only part of the conversation)
                return this.handleNonStreamingRequest(ollama, chatRequest);
            }

            // if no tool calls are necessary, return the final response content
            return { text: content };
        } catch (error) {
            console.error('Error in ollama call:', error.message);
            throw error;
        }
    }

    private async processToolCalls(toolCalls: OllamaToolCall[], chatRequest: ExtendedChatRequest, lastUpdated: Date): Promise<ToolCall[]> {
        const tools: ToolWithHandler[] = chatRequest.tools ?? [];
        const toolCallsForResponse: ToolCall[] = [];
        for (const [idx, toolCall] of toolCalls.entries()) {
            const functionToCall = tools.find(tool => tool.function.name === toolCall.function.name);
            const args = JSON.stringify(toolCall.function?.arguments);
            let funcResult: string;
            if (functionToCall) {
                const rawResult = await functionToCall.handler(args);
                funcResult = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            } else {
                funcResult = 'error: Tool not found';
            }

            chatRequest.messages.push({
                role: 'tool',
                content: `Tool call ${toolCall.function.name} returned: ${String(funcResult)}`,
            });
            toolCallsForResponse.push({
                id: `ollama_${lastUpdated}_${idx}`,
                function: {
                    name: toolCall.function.name,
                    arguments: args
                },
                result: String(funcResult),
                finished: true
            });
        }
        return toolCallsForResponse;
    }

    private recordTokenUsage(response: ChatResponse): void {
        if (this.tokenUsageService && response.prompt_eval_count && response.eval_count) {
            this.tokenUsageService.recordTokenUsage(this.id, {
                inputTokens: response.prompt_eval_count,
                outputTokens: response.eval_count,
                requestId: `ollama_${response.created_at}`
            }).catch(error => console.error('Error recording token usage:', error));
        }
    }

    protected initializeOllama(): Ollama {
        const host = this.host();
        if (!host) {
            throw new Error('Please provide OLLAMA_HOST in preferences or via environment variable');
        }
        return new Ollama({ host: host });
    }

    protected toOllamaTool(tool: ToolRequest): ToolWithHandler {
        const transform = (props: ToolRequestParametersProperties | undefined) => {
            if (!props) {
                return undefined;
            }

            const result: Record<string, { type: string, description: string, enum?: string[] }> = {};
            for (const [key, prop] of Object.entries(props)) {
                const type = prop.type;
                if (type) {
                    const description = typeof prop.description == 'string' ? prop.description : '';
                    result[key] = {
                        type: type,
                        description: description
                    };
                } else {
                    // TODO: Should handle anyOf, but this is not supported by the Ollama type yet
                }
            }
            return result;
        };
        return {
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description ?? 'Tool named ' + tool.name,
                parameters: {
                    type: tool.parameters?.type ?? 'object',
                    required: tool.parameters?.required ?? [],
                    properties: transform(tool.parameters?.properties) ?? {}
                },
            },
            handler: tool.handler
        };
    }

    protected toOllamaMessage(message: LanguageModelMessage): Message | undefined {
        const result: Message = {
            role: this.toOllamaMessageRole(message),
            content: ''
        };

        if (LanguageModelMessage.isTextMessage(message) && message.text.length > 0) {
            result.content = message.text;
        } else if (LanguageModelMessage.isToolUseMessage(message)) {
            result.tool_calls = [{ function: { name: message.name, arguments: message.input as Record<string, unknown> } }];
        } else if (LanguageModelMessage.isToolResultMessage(message)) {
            result.content = `Tool call ${message.name} returned: ${message.content}`;
        } else if (LanguageModelMessage.isThinkingMessage(message)) {
            result.thinking = message.thinking;
        } else if (LanguageModelMessage.isImageMessage(message) && ImageContent.isBase64(message.image)) {
            result.images = [message.image.base64data];
        } else {
            console.log(`Unknown message type encountered when converting message to Ollama format: ${JSON.stringify(message)}. Ignoring message.`);
            return undefined;
        }

        return result;
    }

    protected toOllamaMessageRole(message: LanguageModelMessage): string {
        if (LanguageModelMessage.isToolResultMessage(message)) {
            return 'tool';
        }
        const actor = message.actor;
        if (actor === 'ai') {
            return 'assistant';
        }
        if (actor === 'user') {
            return 'user';
        }
        if (actor === 'system') {
            return 'system';
        }
        console.log(`Unknown actor encountered when converting message to Ollama format: ${actor}. Falling back to 'user'.`);
        return 'user'; // default fallback
    }
}

/**
 * Extended Tool containing a handler
 * @see Tool
 */
type ToolWithHandler = Tool & { handler: (arg_string: string) => Promise<unknown> };

/**
 * Extended chat request with mandatory messages and ToolWithHandler tools
 *
 * @see ChatRequest
 * @see ToolWithHandler
 */
type ExtendedChatRequest = ChatRequest & {
    messages: Message[]
    tools?: ToolWithHandler[]
};

type ExtendedNonStreamingChatRequest = ExtendedChatRequest & { stream: false };

function isNonStreaming(request: ExtendedChatRequest): request is ExtendedNonStreamingChatRequest {
    return !request.stream;
}
