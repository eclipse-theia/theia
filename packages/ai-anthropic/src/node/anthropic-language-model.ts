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

const emptyInputSchema = {
    type: 'object',
    properties: {},
    required: []
};
interface ToolCallback { name: string, args: string, id: string, index: number }

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

export const AnthropicModelIdentifier = Symbol('AnthropicModelIdentifier');
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
        cancellationToken?: CancellationToken,
        toolMessages?: Anthropic.Messages.MessageParam[]
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const { messages, systemMessage } = transformToAnthropicParams(request.messages);
        const tools = this.createTools(request);
        const params: Anthropic.MessageCreateParams = {
            max_tokens: 2048, // Setting max_tokens is mandatory for Anthropic, settings can override this default
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
                        }
                    } else if (event.type === 'content_block_delta') {
                        const delta = event.delta;

                        if (delta.type === 'text_delta') {
                            yield { content: delta.text };
                        }
                        if (toolCall && delta.type === 'input_json_delta') {
                            toolCall.args += delta.partial_json;
                        }
                    } else if (event.type === 'content_block_stop') {
                        if (toolCall && toolCall.index === event.index) {
                            toolCalls.push(toolCall);
                            yield { tool_calls: [{ finished: false, id: toolCall.id, function: { name: toolCall.name, arguments: toolCall.args } }] };
                            toolCall = undefined;
                        }
                    }
                }
                if (toolCalls.length > 0) {
                    const toolResult = await Promise.all(toolCalls.map(async tc => {
                        const tool = request.tools?.find(t => t.name === tc.name);
                        return { name: tc.name, result: (await tool?.handler(tc.args)) as string, id: tc.id };

                    }));
                    const calls = toolResult.map(tr => ({ finished: true, id: tr.id, result: tr.result as string }));
                    yield { tool_calls: calls };

                    const toolRequestMessage: Anthropic.Messages.MessageParam = {
                        role: 'assistant',
                        content: toolCalls.map(call => ({

                            type: 'tool_use',
                            id: call.id,
                            name: call.name,
                            input: JSON.parse(call.args)
                        }))
                    };

                    const toolResponseMessage: Anthropic.Messages.MessageParam = {
                        role: 'user',
                        content: toolResult.map(call => ({
                            type: 'tool_result',
                            tool_use_id: call.id!,
                            content: isArray(call.result!) ? call.result.map(r => ({ type: 'text', text: r as string })) : call.result
                        }))
                    };
                    const result = await that.handleStreamingRequest(anthropic, request, cancellationToken, [toolRequestMessage, toolResponseMessage]);
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
            input_schema: tool.parameters ?? emptyInputSchema
        } as Anthropic.Messages.Tool));
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
}
