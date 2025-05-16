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
    ToolRequestParametersProperties
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { ChatRequest, ChatResponse, Message, Ollama, Options, Tool } from 'ollama';

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
        protected host: () => string | undefined
    ) { }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const ollama = this.initializeOllama();

        const ollamaRequest: ExtendedChatRequest = {
            model: this.model,
            ...this.DEFAULT_REQUEST_SETTINGS,
            ...settings,
            messages: request.messages.map(m => this.toOllamaMessage(m)).filter(m => m !== undefined) as Message[],
            tools: request.tools?.map(t => this.toOllamaTool(t))
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

        // Handle tool request - response may call tools
        if (ollamaRequest.tools && ollamaRequest.tools?.length > 0) {
            return this.handleToolsRequest(ollama, ollamaRequest);
        }

        // Handle standard chat request
        const response = await ollama.chat({
            ...ollamaRequest,
            stream: true
        });
        return this.handleCancellationAndWrapIterator(response, cancellation);
    }

    protected async handleToolsRequest(ollama: Ollama, chatRequest: ExtendedChatRequest, prevResponse?: ChatResponse): Promise<LanguageModelResponse> {
        const response = prevResponse || await ollama.chat({
            ...chatRequest,
            stream: false
        });
        if (response.message.tool_calls) {
            const tools: ToolWithHandler[] = chatRequest.tools ?? [];
            // Add response message to chat history
            chatRequest.messages.push(response.message);
            const tool_calls: ToolCall[] = [];
            for (const [idx, toolCall] of response.message.tool_calls.entries()) {
                const functionToCall = tools.find(tool => tool.function.name === toolCall.function.name);
                if (functionToCall) {
                    const args = JSON.stringify(toolCall.function?.arguments);
                    const funcResult = await functionToCall.handler(args);
                    chatRequest.messages.push({
                        role: 'tool',
                        content: `Tool call ${functionToCall.function.name} returned: ${String(funcResult)}`,
                    });
                    let resultString = String(funcResult);
                    if (resultString.length > 1000) {
                        // truncate result string if it is too long
                        resultString = resultString.substring(0, 1000) + '...';
                    }
                    tool_calls.push({
                        id: `ollama_${response.created_at}_${idx}`,
                        function: {
                            name: functionToCall.function.name,
                            arguments: Object.values(toolCall.function?.arguments ?? {}).join(', ')
                        },
                        result: resultString,
                        finished: true
                    });
                }
            }
            // Get final response from model with function outputs
            const finalResponse = await ollama.chat({ ...chatRequest, stream: false });
            if (finalResponse.message.tool_calls) {
                // If the final response also calls tools, recursively handle them
                return this.handleToolsRequest(ollama, chatRequest, finalResponse);
            }
            return { stream: this.createAsyncIterable([{ tool_calls }, { content: finalResponse.message.content }]) };
        }
        return { text: response.message.content };
    }

    protected createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
        return {
            [Symbol.asyncIterator]: async function* (): AsyncIterableIterator<T> {
                for (const item of items) {
                    yield item;
                }
            }
        };
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

    protected initializeOllama(): Ollama {
        const host = this.host();
        if (!host) {
            throw new Error('Please provide OLLAMA_HOST in preferences or via environment variable');
        }
        return new Ollama({ host: host });
    }

    protected handleCancellationAndWrapIterator(response: AbortableAsyncIterable<ChatResponse>, token?: CancellationToken): LanguageModelStreamResponse {
        token?.onCancellationRequested(() => {
            // maybe it is better to use ollama.abort() as we are using one client per request
            response.abort();
        });
        async function* wrapAsyncIterator<T>(inputIterable: AsyncIterable<ChatResponse>): AsyncIterable<LanguageModelStreamResponsePart> {
            for await (const item of inputIterable) {
                yield { content: item.message.content };
            }
        }
        return { stream: wrapAsyncIterator(response) };
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

    private createMessageContent(message: LanguageModelMessage): string {
        if (LanguageModelMessage.isTextMessage(message)) {
            return message.text;
        }
        return '';
    };

    protected toOllamaMessage(message: LanguageModelMessage): Message | undefined {
        const content = this.createMessageContent(message);
        if (content === undefined) {
            return undefined;
        }
        if (message.actor === 'ai') {
            return { role: 'assistant', content };
        }
        if (message.actor === 'user') {
            return { role: 'user', content };
        }
        if (message.actor === 'system') {
            return { role: 'system', content };
        }
        return undefined;
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

// Ollama doesn't export this type, so we have to define it here
type AbortableAsyncIterable<T> = AsyncIterable<T> & { abort: () => void };
