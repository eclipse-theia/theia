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
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelTextResponse,
    TextMessage,
    TokenUsageService,
    UserRequest,
    ImageContent
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { OpenAI, AzureOpenAI } from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';
import { StreamingAsyncIterator } from './openai-streaming-iterator';
import { OPENAI_PROVIDER_ID } from '../common';
import type { FinalRequestOptions } from 'openai/internal/request-options';
import type { RunnerOptions } from 'openai/lib/AbstractChatCompletionRunner';

export class MistralFixedOpenAI extends OpenAI {
    protected override async prepareOptions(options: FinalRequestOptions): Promise<void> {
        (options.body as { messages: Array<ChatCompletionMessageParam> }).messages.forEach(m => {
            if (m.role === 'assistant' && m.tool_calls) {
                // Mistral OpenAI Endpoint expects refusal to be undefined and not null for optional properties
                // eslint-disable-next-line no-null/no-null
                if (m.refusal === null) {
                    m.refusal = undefined;
                }
                // Mistral OpenAI Endpoint expects parsed to be undefined and not null for optional properties
                // eslint-disable-next-line no-null/no-null
                if ((m as unknown as { parsed: null | undefined }).parsed === null) {
                    (m as unknown as { parsed: null | undefined }).parsed = undefined;
                }
            }
        });
        return super.prepareOptions(options);
    };
}

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

export type DeveloperMessageSettings = 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip';

export class OpenAiModel implements LanguageModel {

    /**
     * The options for the OpenAI runner.
     */
    protected runnerOptions: RunnerOptions = {
        // The maximum number of chat completions to return in a single request.
        // Each function call counts as a chat completion.
        // To support use cases with many function calls (e.g. @Coder), we set this to a high value.
        maxChatCompletions: 100,
    };

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the OpenAI API
     * @param enableStreaming whether the streaming API shall be used
     * @param apiKey a function that returns the API key to use for this model, called on each request
     * @param apiVersion a function that returns the OpenAPI version to use for this model, called on each request
     * @param developerMessageSettings how to handle system messages
     * @param url the OpenAI API compatible endpoint where the model is hosted. If not provided the default OpenAI endpoint will be used.
     * @param maxRetries the maximum number of retry attempts when a request fails
     */
    constructor(
        public readonly id: string,
        public model: string,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public apiVersion: () => string | undefined,
        public supportsStructuredOutput: boolean,
        public url: string | undefined,
        public openAiModelUtils: OpenAiModelUtils,
        public developerMessageSettings: DeveloperMessageSettings = 'developer',
        public maxRetries: number = 3,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        return request.settings ?? {};
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const openai = this.initializeOpenAi();

        if (request.response_format?.type === 'json_schema' && this.supportsStructuredOutput) {
            return this.handleStructuredOutputRequest(openai, request);
        }

        if (this.isNonStreamingModel(this.model) || (typeof settings.stream === 'boolean' && !settings.stream)) {
            return this.handleNonStreamingRequest(openai, request);
        }

        if (this.id.startsWith(`${OPENAI_PROVIDER_ID}/`)) {
            settings['stream_options'] = { include_usage: true };
        }

        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
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
                ...this.runnerOptions, maxRetries: this.maxRetries
            });
        } else {
            runner = openai.chat.completions.stream({
                model: this.model,
                messages: this.processMessages(request.messages),
                stream: true,
                ...settings
            });
        }

        return { stream: new StreamingAsyncIterator(runner, request.requestId, cancellationToken, this.tokenUsageService, this.id) };
    }

    protected async handleNonStreamingRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: this.processMessages(request.messages),
            ...settings
        });

        const message = response.choices[0].message;

        // Record token usage if token usage service is available
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

    protected isNonStreamingModel(_model: string): boolean {
        return !this.enableStreaming;
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelParsedResponse> {
        const settings = this.getSettings(request);
        // TODO implement tool support for structured output (parse() seems to require different tool format)
        const result = await openai.chat.completions.parse({
            model: this.model,
            messages: this.processMessages(request.messages),
            response_format: request.response_format,
            ...settings
        });
        const message = result.choices[0].message;
        if (message.refusal || message.parsed === undefined) {
            console.error('Error in OpenAI chat completion stream:', JSON.stringify(message));
        }

        // Record token usage if token usage service is available
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

    protected initializeOpenAi(): OpenAI {
        const apiKey = this.apiKey();
        if (!apiKey && !(this.url)) {
            throw new Error('Please provide OPENAI_API_KEY in preferences or via environment variable');
        }

        const apiVersion = this.apiVersion();
        // We need to hand over "some" key, even if a custom url is not key protected as otherwise the OpenAI client will throw an error
        const key = apiKey ?? 'no-key';

        if (apiVersion) {
            return new AzureOpenAI({ apiKey: key, baseURL: this.url, apiVersion: apiVersion });
        } else {
            return new MistralFixedOpenAI({ apiKey: key, baseURL: this.url });
        }
    }

    protected processMessages(messages: LanguageModelMessage[]): ChatCompletionMessageParam[] {
        return this.openAiModelUtils.processMessages(messages, this.developerMessageSettings, this.model);
    }
}

/**
 * Utility class for processing messages for the OpenAI language model.
 *
 * Adopters can rebind this class to implement custom message processing behavior.
 */
@injectable()
export class OpenAiModelUtils {

    protected processSystemMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings
    ): LanguageModelMessage[] {
        if (developerMessageSettings === 'skip') {
            return messages.filter(message => message.actor !== 'system');
        } else if (developerMessageSettings === 'mergeWithFollowingUserMessage') {
            const updated = messages.slice();
            for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].actor === 'system') {
                    const systemMessage = updated[i] as TextMessage;
                    if (i + 1 < updated.length && updated[i + 1].actor === 'user') {
                        // Merge system message with the next user message
                        const userMessage = updated[i + 1] as TextMessage;
                        updated[i + 1] = {
                            ...updated[i + 1],
                            text: systemMessage.text + '\n' + userMessage.text
                        } as TextMessage;
                        updated.splice(i, 1);
                    } else {
                        // The message directly after is not a user message (or none exists), so create a new user message right after
                        updated.splice(i + 1, 0, { actor: 'user', type: 'text', text: systemMessage.text });
                        updated.splice(i, 1);
                    }
                }
            }
            return updated;
        }
        return messages;
    }

    protected toOpenAiRole(
        message: LanguageModelMessage,
        developerMessageSettings: DeveloperMessageSettings
    ): 'developer' | 'user' | 'assistant' | 'system' {
        if (message.actor === 'system') {
            if (developerMessageSettings === 'user' || developerMessageSettings === 'system' || developerMessageSettings === 'developer') {
                return developerMessageSettings;
            } else {
                return 'developer';
            }
        } else if (message.actor === 'ai') {
            return 'assistant';
        }
        return 'user';
    }

    protected toOpenAIMessage(
        message: LanguageModelMessage,
        developerMessageSettings: DeveloperMessageSettings
    ): ChatCompletionMessageParam {
        if (LanguageModelMessage.isTextMessage(message)) {
            return {
                role: this.toOpenAiRole(message, developerMessageSettings),
                content: message.text
            };
        }
        if (LanguageModelMessage.isToolUseMessage(message)) {
            return {
                role: 'assistant',
                tool_calls: [{ id: message.id, function: { name: message.name, arguments: JSON.stringify(message.input) }, type: 'function' }]
            };
        }
        if (LanguageModelMessage.isToolResultMessage(message)) {
            return {
                role: 'tool',
                tool_call_id: message.tool_use_id,
                // content only supports text content so we need to stringify any potential data we have, e.g., images
                content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            };
        }
        if (LanguageModelMessage.isImageMessage(message) && message.actor === 'user') {
            return {
                role: 'user',
                content: [{
                    type: 'image_url',
                    image_url: {
                        url:
                            ImageContent.isBase64(message.image) ?
                                `data:${message.image.mimeType};base64,${message.image.base64data}` :
                                message.image.url
                    }
                }]
            };
        }
        throw new Error(`Unknown message type:'${JSON.stringify(message)}'`);
    }

    /**
     * Processes the provided list of messages by applying system message adjustments and converting
     * them to the format expected by the OpenAI API.
     *
     * Adopters can rebind this processing to implement custom behavior.
     *
     * @param messages the list of messages to process.
     * @param developerMessageSettings how system and developer messages are handled during processing.
     * @param model the OpenAI model identifier. Currently not used, but allows subclasses to implement model-specific behavior.
     * @returns an array of messages formatted for the OpenAI API.
     */
    processMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): ChatCompletionMessageParam[] {
        const processed = this.processSystemMessages(messages, developerMessageSettings);
        return processed.map(m => this.toOpenAIMessage(m, developerMessageSettings));
    }
}
