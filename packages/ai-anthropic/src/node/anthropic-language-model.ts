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
    LanguageModelTextResponse,
    ToolRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { Anthropic } from '@anthropic-ai/sdk';
import { MessageParam, Tool, ToolChoiceAuto } from '@anthropic-ai/sdk/resources';

export const AnthropicModelIdentifier = Symbol('AnthropicModelIdentifier');

function transformToAnthropicParams(
    messages: LanguageModelRequestMessage[]
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

function toAnthropicRole(message: LanguageModelRequestMessage): 'user' | 'assistant' {
    switch (message.actor) {
        case 'ai':
            return 'assistant';
        default:
            return 'user';
    }
}

export class AnthropicModel implements LanguageModel {

    constructor(
        public readonly id: string,
        public model: string,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public defaultRequestSettings?: { [key: string]: unknown }
    ) { }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        const settings = request.settings ? request.settings : this.defaultRequestSettings;
        if (!settings) {
            return {};
        }
        return settings;
    }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const anthropic = this.initializeAnthropic();
        if (this.enableStreaming) {
            return this.handleStreamingRequest(anthropic, request, cancellationToken);
        }
        return this.handleNonStreamingRequest(anthropic, request);
    }

    protected async handleStreamingRequest(
        anthropic: Anthropic,
        request: LanguageModelRequest,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const { messages, systemMessage } = transformToAnthropicParams(request.messages);

        const tools = this.createTools(request.tools);

        const params: Anthropic.MessageCreateParams = {
            max_tokens: 2048, // Setting max_tokens is mandatory for Anthropic, settings can override this default
            messages,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings,
            ...(tools.length > 0 && {
                tools,
                tool_choice: { type: 'auto' } as ToolChoiceAuto,
            }),
        };

        const stream = anthropic.messages.stream(params);

        cancellationToken?.onCancellationRequested(() => {
            stream.abort();
        });

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                for await (const event of stream) {
                    if (event.type === 'content_block_start') {
                        const contentBlock = event.content_block;

                        if (contentBlock.type === 'text') {
                            yield { content: contentBlock.text };
                        } else if (contentBlock.type === 'tool_use') {
                            yield {
                                tool_calls: [
                                    {
                                        id: contentBlock.id,
                                        function: {
                                            arguments: JSON.stringify(contentBlock.input),
                                            name: contentBlock.name,
                                        },
                                        finished: false,
                                    },
                                ],
                            };
                        }
                    } else if (event.type === 'content_block_delta') {
                        const delta = event.delta;

                        if (delta.type === 'text_delta') {
                            yield { content: delta.text };
                        } else if (delta.type === 'input_json_delta') {
                            yield {
                                tool_calls: [
                                    {
                                        id: event.index.toString(),
                                        function: {
                                            arguments: delta.partial_json,
                                        },
                                        finished: false,
                                    },
                                ],
                            };
                        }
                    }
                }
            },
        };

        stream.on('error', (error: Error) => {
            console.error('Error in Anthropic streaming:', error);
        });

        return { stream: asyncIterator };
    }

    protected async handleNonStreamingRequest(
        anthropic: Anthropic,
        request: LanguageModelRequest
    ): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);

        const { messages, systemMessage } = transformToAnthropicParams(request.messages);

        const params: Anthropic.MessageCreateParams = {
            max_tokens: 2048,
            messages,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings,
        };

        const response: Anthropic.Message = await anthropic.messages.create(params);

        if (response.content[0] && response.content[0].type === 'text') {
            return {
                text: response.content[0].text,
            };
        }
        return {
            text: '',
        };
    }

    protected initializeAnthropic(): Anthropic {
        const apiKey = this.apiKey();
        if (!apiKey) {
            throw new Error('Please provide ANTHROPIC_API_KEY in preferences or via environment variable');
        }

        return new Anthropic({ apiKey: apiKey });
    }

    protected createTools(toolRequests: ToolRequest[] | undefined): Tool[] {
        if (!toolRequests) {
            return [];
        }
        return toolRequests.map(toolRequest => ({
            name: toolRequest.name,
            description: toolRequest.description,
            input_schema: {
                type: 'object',
                properties: toolRequest.parameters?.properties || undefined,
                ...(toolRequest.parameters?.type && { type: toolRequest.parameters.type }),
            },
        }));
    }

}
