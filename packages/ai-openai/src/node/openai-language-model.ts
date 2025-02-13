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
    LanguageModelRequestMessage,
    LanguageModelResponse,
    LanguageModelTextResponse
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { OpenAI, AzureOpenAI } from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';
import { StreamingAsyncIterator } from './openai-streaming-iterator';

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

export type DeveloperMessageSettings = 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip';

export class OpenAiModel implements LanguageModel {

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the OpenAI API
     * @param enableStreaming whether the streaming API shall be used
     * @param apiKey a function that returns the API key to use for this model, called on each request
     * @param apiVersion a function that returns the OpenAPI version to use for this model, called on each request
     * @param developerMessageSettings how to handle system messages
     * @param url the OpenAI API compatible endpoint where the model is hosted. If not provided the default OpenAI endpoint will be used.
     * @param defaultRequestSettings optional default settings for requests made using this model.
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
        public defaultRequestSettings?: { [key: string]: unknown },
    ) { }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        const settings = request.settings ? request.settings : this.defaultRequestSettings;
        if (!settings) {
            return {};
        }
        return settings;
    }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);
        const openai = this.initializeOpenAi();

        if (request.response_format?.type === 'json_schema' && this.supportsStructuredOutput) {
            return this.handleStructuredOutputRequest(openai, request);
        }

        if (this.isNonStreamingModel(this.model) || (typeof settings.stream === 'boolean' && !settings.stream)) {
            return this.handleNonStreamingRequest(openai, request);
        }

        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }
        let runner: ChatCompletionStream;
        const tools = this.createTools(request);
        if (tools) {
            runner = openai.beta.chat.completions.runTools({
                model: this.model,
                messages: this.processMessages(request.messages),
                stream: true,
                tools: tools,
                tool_choice: 'auto',
                ...settings
            });
        } else {
            runner = openai.beta.chat.completions.stream({
                model: this.model,
                messages: this.processMessages(request.messages),
                stream: true,
                ...settings
            });
        }

        return { stream: new StreamingAsyncIterator(runner, cancellationToken) };
    }

    protected async handleNonStreamingRequest(openai: OpenAI, request: LanguageModelRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: this.processMessages(request.messages),
            ...settings
        });

        const message = response.choices[0].message;

        return {
            text: message.content ?? ''
        };
    }

    protected isNonStreamingModel(_model: string): boolean {
        return !this.enableStreaming;
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: LanguageModelRequest): Promise<LanguageModelParsedResponse> {
        const settings = this.getSettings(request);
        // TODO implement tool support for structured output (parse() seems to require different tool format)
        const result = await openai.beta.chat.completions.parse({
            model: this.model,
            messages: this.processMessages(request.messages),
            response_format: request.response_format,
            ...settings
        });
        const message = result.choices[0].message;
        if (message.refusal || message.parsed === undefined) {
            console.error('Error in OpenAI chat completion stream:', JSON.stringify(message));
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
        if (apiVersion) {
            // We need to hand over "some" key, even if a custom url is not key protected as otherwise the OpenAI client will throw an error
            return new AzureOpenAI({ apiKey: apiKey ?? 'no-key', baseURL: this.url, apiVersion: apiVersion });
        } else {
            // We need to hand over "some" key, even if a custom url is not key protected as otherwise the OpenAI client will throw an error
            return new OpenAI({ apiKey: apiKey ?? 'no-key', baseURL: this.url });
        }
    }

    protected processMessages(messages: LanguageModelRequestMessage[]): ChatCompletionMessageParam[] {
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
        messages: LanguageModelRequestMessage[],
        developerMessageSettings: DeveloperMessageSettings
    ): LanguageModelRequestMessage[] {
        if (developerMessageSettings === 'skip') {
            return messages.filter(message => message.actor !== 'system');
        } else if (developerMessageSettings === 'mergeWithFollowingUserMessage') {
            const updated = messages.slice();
            for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].actor === 'system') {
                    if (i + 1 < updated.length && updated[i + 1].actor === 'user') {
                        // Merge system message with the next user message
                        updated[i + 1] = {
                            ...updated[i + 1],
                            query: updated[i].query + '\n' + updated[i + 1].query
                        };
                        updated.splice(i, 1);
                    } else {
                        // The message directly after is not a user message (or none exists), so create a new user message right after
                        updated.splice(i + 1, 0, { actor: 'user', type: 'text', query: updated[i].query });
                        updated.splice(i, 1);
                    }
                }
            }
            return updated;
        }
        return messages;
    }

    protected toOpenAiRole(
        message: LanguageModelRequestMessage,
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
        message: LanguageModelRequestMessage,
        developerMessageSettings: DeveloperMessageSettings
    ): ChatCompletionMessageParam {
        return {
            role: this.toOpenAiRole(message, developerMessageSettings),
            content: message.query || ''
        };
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
        messages: LanguageModelRequestMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): ChatCompletionMessageParam[] {
        const processed = this.processSystemMessages(messages, developerMessageSettings);
        return processed.map(m => this.toOpenAIMessage(m, developerMessageSettings));
    }
}
