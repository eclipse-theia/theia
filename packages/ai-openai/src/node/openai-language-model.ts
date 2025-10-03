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
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    TextMessage,
    TokenUsageService,
    UserRequest,
    ToolRequest,
    ImageContent,
    LanguageModelStatus
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
import type { ResponseInputItem, FunctionTool, ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { ResponsesModel } from 'openai/resources/shared';

export class MistralFixedOpenAI extends OpenAI {
    protected override async prepareOptions(options: FinalRequestOptions): Promise<void> {
        const messages = (options.body as { messages: Array<ChatCompletionMessageParam> }).messages;
        if (Array.isArray(messages)) {
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
        }
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
     * @param useResponseApi whether to use the newer OpenAI Response API instead of the Chat Completion API
     */
    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public apiVersion: () => string | undefined,
        public supportsStructuredOutput: boolean,
        public url: string | undefined,
        public deployment: string | undefined,
        public openAiModelUtils: OpenAiModelUtils,
        public developerMessageSettings: DeveloperMessageSettings = 'developer',
        public maxRetries: number = 3,
        public useResponseApi: boolean = false,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        return request.settings ?? {};
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const openai = this.initializeOpenAi();

        if (this.useResponseApi) {
            return this.handleResponseApiRequest(openai, request, cancellationToken);
        }

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
            return new AzureOpenAI({ apiKey: key, baseURL: this.url, apiVersion: apiVersion, deployment: this.deployment });
        } else {
            return new MistralFixedOpenAI({ apiKey: key, baseURL: this.url });
        }
    }

    protected async handleResponseApiRequest(openai: OpenAI, request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);

        // Convert messages directly to Response API format without going through chat completion types
        const { instructions, input } = this.openAiModelUtils.processMessagesForResponseApi(request.messages, this.developerMessageSettings, this.model);
        const tools = this.convertToolsForResponseApi(request.tools);

        const isStreamingRequest = this.enableStreaming && !(typeof settings.stream === 'boolean' && !settings.stream);

        if (isStreamingRequest) {
            if (cancellationToken?.isCancellationRequested) {
                return { text: '' };
            }

            const stream = openai.responses.stream({
                model: this.model as ResponsesModel,
                instructions,
                input,
                tools,
                ...settings
            });

            return { stream: this.createResponseApiStreamIterator(stream, request.requestId, cancellationToken) };
        } else {
            const response = await openai.responses.create({
                model: this.model as ResponsesModel,
                instructions,
                input,
                tools,
                ...settings
            });

            // Record token usage if available
            if (this.tokenUsageService && response.usage) {
                await this.tokenUsageService.recordTokenUsage(
                    this.id,
                    {
                        inputTokens: response.usage.input_tokens,
                        outputTokens: response.usage.output_tokens,
                        requestId: request.requestId
                    }
                );
            }

            return {
                text: response.output_text || ''
            };
        }
    }

    protected convertToolsForResponseApi(tools?: ToolRequest[]): FunctionTool[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        return tools.map(tool => ({
            type: 'function',
            name: tool.name,
            description: tool.description || '',
            // The Response API is very strict re: JSON schema: all properties must be listed as required, and additional properties must be disallowed.
            parameters: { ...tool.parameters, additionalProperties: false, required: tool.parameters.properties ? Object.keys(tool.parameters.properties) : [] },
            strict: true
        }));
    }

    protected createResponseApiStreamIterator(
        stream: AsyncIterable<ResponseStreamEvent>,
        requestId: string,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const self = this;
        return {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                try {
                    for await (const event of stream) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }

                        // Handle text content streaming
                        if (event.type === 'response.output_text.delta') {
                            yield {
                                content: event.delta
                            };
                        } else if (event.type === 'response.function_call_arguments.delta') {
                            // For now, we'll accumulate function call arguments
                            // This could be enhanced to stream tool calls progressively
                        } else if (event.type === 'response.function_call_arguments.done') {
                            // Tool call completed - this could trigger tool execution
                            // For now, we don't yield anything as the tool execution happens elsewhere
                        } else if (event.type === 'response.completed') {
                            // Record final token usage if available
                            if (self.tokenUsageService && event.response?.usage) {
                                await self.tokenUsageService.recordTokenUsage(
                                    self.id,
                                    {
                                        inputTokens: event.response.usage.input_tokens,
                                        outputTokens: event.response.usage.output_tokens,
                                        requestId
                                    }
                                );
                            }
                        } else if (event.type === 'error') {
                            console.error('Response API error:', event.message);
                            throw new Error(`Response API error: ${event.message}`);
                        }
                    }
                } catch (error) {
                    console.error('Error in Response API stream:', error);
                    throw error;
                }
            }
        };
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
        return processed.filter(m => m.type !== 'thinking').map(m => this.toOpenAIMessage(m, developerMessageSettings));
    }

    /**
     * Processes the provided list of messages by applying system message adjustments and converting
     * them directly to the format expected by the OpenAI Response API.
     *
     * This method converts messages directly without going through ChatCompletionMessageParam types.
     *
     * @param messages the list of messages to process.
     * @param developerMessageSettings how system and developer messages are handled during processing.
     * @param model the OpenAI model identifier. Currently not used, but allows subclasses to implement model-specific behavior.
     * @returns an object containing instructions and input formatted for the Response API.
     */
    processMessagesForResponseApi(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): { instructions?: string; input: ResponseInputItem[] } {
        const processed = this.processSystemMessages(messages, developerMessageSettings)
            .filter(m => m.type !== 'thinking');

        // Extract system/developer messages for instructions
        const systemMessages = processed.filter((m): m is TextMessage => m.type === 'text' && m.actor === 'system');
        const instructions = systemMessages.length > 0
            ? systemMessages.map(m => m.text).join('\n')
            : undefined;

        // Convert non-system messages to Response API input items
        const nonSystemMessages = processed.filter(m => m.actor !== 'system');
        const input: ResponseInputItem[] = [];

        for (const message of nonSystemMessages) {
            if (LanguageModelMessage.isTextMessage(message)) {
                const responseRole = message.actor === 'ai' ? 'assistant' as const : 'user' as const;
                input.push({
                    type: 'message',
                    role: responseRole,
                    content: [{
                        type: 'input_text',
                        text: message.text
                    }]
                });
            } else if (LanguageModelMessage.isToolUseMessage(message)) {
                input.push({
                    type: 'function_call',
                    call_id: message.id,
                    name: message.name,
                    arguments: JSON.stringify(message.input)
                });
            } else if (LanguageModelMessage.isToolResultMessage(message)) {
                const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
                input.push({
                    type: 'function_call_output',
                    call_id: message.tool_use_id,
                    output: content
                });
            } else if (LanguageModelMessage.isImageMessage(message) && message.actor === 'user') {
                input.push({
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_image',
                        detail: 'auto',
                        image_url: ImageContent.isBase64(message.image) ?
                            `data:${message.image.mimeType};base64,${message.image.base64data}` :
                            message.image.url
                    }]
                });
            } else {
                throw new Error(`Unknown message type for Response API: '${JSON.stringify(message)}'`);
            }
        }

        return { instructions, input };
    }
}
