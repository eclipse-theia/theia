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
    LanguageModelRequestMessage,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    ToolRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { ChatRequest, ChatResponse, Message, Ollama, Options, Tool } from 'ollama';

export const OllamaModelIdentifier = Symbol('OllamaModelIdentifier');

export class OllamaModel implements LanguageModel {

    protected readonly DEFAULT_REQUEST_SETTINGS: Partial<Omit<ChatRequest, 'stream' | 'model'>> = {
        keep_alive: '15m'
    };

    readonly providerId = 'ollama';
    readonly vendor: string = 'Ollama';

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the unique model name as used in the Ollama environment.
     * @param hostProvider a function to provide the host URL for the Ollama server.
     * @param defaultRequestSettings optional default settings for requests made using this model.
     */
    constructor(
        public readonly id: string,
        protected readonly model: string,
        protected host: () => string | undefined,
        public defaultRequestSettings?: { [key: string]: unknown }
    ) { }

    protected getSettings(request: LanguageModelRequest): Partial<ChatRequest> {
        const settings = request.settings ?? this.defaultRequestSettings ?? {};
        return {
            options: settings as Partial<Options>
        };
    }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const ollama = this.initializeOllama();

        const ollamaRequest: ExtendedChatRequest = {
            model: this.model,
            ...this.DEFAULT_REQUEST_SETTINGS,
            ...settings,
            messages: request.messages.map(this.toOllamaMessage),
            tools: request.tools?.map(this.toOllamaTool)
        };
        const structured = request.response_format?.type === 'json_schema';
        return this.dispatchRequest(ollama, ollamaRequest, structured, cancellationToken);
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

    protected async handleToolsRequest(ollama: Ollama, chatRequest: ExtendedChatRequest): Promise<LanguageModelResponse> {
        const response = await ollama.chat({
            ...chatRequest,
            stream: false
        });

        const tools: ToolWithHandler[] = chatRequest.tools ?? [];
        if (response.message.tool_calls) {
            for (const toolCall of response.message.tool_calls) {
                const functionToCall = tools.find(tool => tool.function.name === toolCall.function?.name);
                if (functionToCall) {
                    const args = JSON.stringify(toolCall.function?.arguments);
                    const funcResult = await functionToCall.handler(args);
                    chatRequest.messages.push(response.message);
                    chatRequest.messages.push({
                        role: 'tool',
                        content: String(funcResult),
                    });
                }
            }
            // Get final response from model with function outputs
            const finalResponse = await ollama.chat({ ...chatRequest, stream: false });
            if (finalResponse.message.tool_calls) {
                // Recursive tools call
                return this.handleToolsRequest(ollama, chatRequest);
            }
            return { text: finalResponse.message.content };
        }
        return { text: response.message.content };
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
        const transform = (props: Record<string, { [key: string]: unknown; type: string; }> | undefined) => {
            if (!props) {
                return undefined;
            }
            const result: Record<string, { type: string, description: string }> = {};
            for (const key in props) {
                if (Object.prototype.hasOwnProperty.call(props, key)) {
                    result[key] = {
                        type: props[key].type,
                        description: key
                    };
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
                    required: Object.keys(tool.parameters?.properties ?? {}),
                    properties: transform(tool.parameters?.properties) ?? {}
                },
            },
            handler: tool.handler
        };
    }

    protected toOllamaMessage(message: LanguageModelRequestMessage): Message {
        if (message.actor === 'ai') {
            return { role: 'assistant', content: message.query || '' };
        }
        if (message.actor === 'user') {
            return { role: 'user', content: message.query || '' };
        }
        if (message.actor === 'system') {
            return { role: 'system', content: message.query || '' };
        }
        return { role: 'system', content: '' };
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
