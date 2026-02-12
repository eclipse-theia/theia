// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
    ImageContent,
    LanguageModel,
    LanguageModelMessage,
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelStatus,
    LanguageModelTextResponse,
    TokenUsageService,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import OpenAI from 'openai';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';
import { StreamingAsyncIterator } from '@theia/ai-openai/lib/node/openai-streaming-iterator';
import { COPILOT_PROVIDER_ID } from '../common';
import type { RunnerOptions } from 'openai/lib/AbstractChatCompletionRunner';
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';

const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
const USER_AGENT = 'Theia-Copilot/1.0.0';

/**
 * Language model implementation for GitHub Copilot.
 * Uses the OpenAI SDK to communicate with the Copilot API.
 */
export class CopilotLanguageModel implements LanguageModel {

    protected runnerOptions: RunnerOptions = {
        maxChatCompletions: 100
    };

    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public enableStreaming: boolean,
        public supportsStructuredOutput: boolean,
        public maxRetries: number,
        protected readonly accessTokenProvider: () => Promise<string | undefined>,
        protected readonly enterpriseUrlProvider: () => string | undefined,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        return request.settings ?? {};
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const openai = await this.initializeCopilotClient();

        if (request.response_format?.type === 'json_schema' && this.supportsStructuredOutput) {
            return this.handleStructuredOutputRequest(openai, request);
        }

        const settings = this.getSettings(request);

        if (!this.enableStreaming || (typeof settings.stream === 'boolean' && !settings.stream)) {
            return this.handleNonStreamingRequest(openai, request);
        }

        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }

        if (this.id.startsWith(`${COPILOT_PROVIDER_ID}/`)) {
            settings['stream_options'] = { include_usage: true };
        }

        let runner: ChatCompletionStream;
        const tools = this.createTools(request);

        if (tools) {
            runner = openai.chat.completions.runTools({
                model: this.model,
                messages: this.processMessages(request.messages),
                stream: true,
                tools: tools,
                tool_choice: 'auto',
                ...settings
            }, {
                ...this.runnerOptions,
                maxRetries: this.maxRetries
            });
        } else {
            runner = openai.chat.completions.stream({
                model: this.model,
                messages: this.processMessages(request.messages),
                stream: true,
                ...settings
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { stream: new StreamingAsyncIterator(runner as any, request.requestId, cancellationToken, this.tokenUsageService, this.id) };
    }

    protected async handleNonStreamingRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: this.processMessages(request.messages),
            ...settings
        });

        const message = response.choices[0].message;

        if (this.tokenUsageService && response.usage) {
            await this.tokenUsageService.recordTokenUsage(
                this.id,
                {
                    inputTokens: response.usage.prompt_tokens,
                    outputTokens: response.usage.completion_tokens,
                    requestId: request.requestId
                }
            );
        }

        return {
            text: message.content ?? ''
        };
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelParsedResponse> {
        const settings = this.getSettings(request);
        const result = await openai.chat.completions.parse({
            model: this.model,
            messages: this.processMessages(request.messages),
            response_format: request.response_format,
            ...settings
        });

        const message = result.choices[0].message;
        if (message.refusal || message.parsed === undefined) {
            console.error('Error in Copilot chat completion:', JSON.stringify(message));
        }

        if (this.tokenUsageService && result.usage) {
            await this.tokenUsageService.recordTokenUsage(
                this.id,
                {
                    inputTokens: result.usage.prompt_tokens,
                    outputTokens: result.usage.completion_tokens,
                    requestId: request.requestId
                }
            );
        }

        return {
            content: message.content ?? '',
            parsed: message.parsed
        };
    }

    protected createTools(request: LanguageModelRequest): RunnableToolFunctionWithoutParse[] | undefined {
        return request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                function: (args_string: string) => tool.handler(args_string)
            }
        } as RunnableToolFunctionWithoutParse));
    }

    protected async initializeCopilotClient(): Promise<OpenAI> {
        const accessToken = await this.accessTokenProvider();
        if (!accessToken) {
            throw new Error('Not authenticated with GitHub Copilot. Please sign in first.');
        }

        const enterpriseUrl = this.enterpriseUrlProvider();
        const baseURL = enterpriseUrl
            ? `https://copilot-api.${enterpriseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
            : COPILOT_API_BASE_URL;

        return new OpenAI({
            apiKey: accessToken,
            baseURL,
            defaultHeaders: {
                'User-Agent': USER_AGENT,
                'Openai-Intent': 'conversation-edits',
                'X-Initiator': 'user'
            }
        });
    }

    protected processMessages(messages: LanguageModelMessage[]): ChatCompletionMessageParam[] {
        return messages.filter(m => m.type !== 'thinking').map(m => this.toOpenAIMessage(m));
    }

    protected toOpenAIMessage(message: LanguageModelMessage): ChatCompletionMessageParam {
        if (LanguageModelMessage.isTextMessage(message)) {
            return {
                role: this.toOpenAiRole(message),
                content: message.text
            };
        }
        if (LanguageModelMessage.isToolUseMessage(message)) {
            return {
                role: 'assistant',
                tool_calls: [{
                    id: message.id,
                    function: {
                        name: message.name,
                        arguments: JSON.stringify(message.input)
                    },
                    type: 'function'
                }]
            };
        }
        if (LanguageModelMessage.isToolResultMessage(message)) {
            return {
                role: 'tool',
                tool_call_id: message.tool_use_id,
                content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            };
        }
        if (LanguageModelMessage.isImageMessage(message) && message.actor === 'user') {
            return {
                role: 'user',
                content: [{
                    type: 'image_url',
                    image_url: {
                        url: ImageContent.isBase64(message.image)
                            ? `data:${message.image.mimeType};base64,${message.image.base64data}`
                            : message.image.url
                    }
                }]
            };
        }
        throw new Error(`Unknown message type: '${JSON.stringify(message)}'`);
    }

    protected toOpenAiRole(message: LanguageModelMessage): 'developer' | 'user' | 'assistant' | 'system' {
        if (message.actor === 'system') {
            return 'developer';
        } else if (message.actor === 'ai') {
            return 'assistant';
        }
        return 'user';
    }
}
