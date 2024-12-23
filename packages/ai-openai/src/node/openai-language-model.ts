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
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import OpenAI from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

function toOpenAIMessage(message: LanguageModelRequestMessage): ChatCompletionMessageParam {
    return {
        role: toOpenAiRole(message),
        content: message.query || ''
    };
}

function toOpenAiRole(message: LanguageModelRequestMessage): 'system' | 'user' | 'assistant' {
    switch (message.actor) {
        case 'system':
            return 'system';
        case 'ai':
            return 'assistant';
        default:
            return 'user';
    }
}

export class OpenAiModel implements LanguageModel {

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the OpenAI API
     * @param enableStreaming whether the streaming API shall be used
     * @param apiKey a function that returns the API key to use for this model, called on each request
     * @param url the OpenAI API compatible endpoint where the model is hosted. If not provided the default OpenAI endpoint will be used.
     * @param defaultRequestSettings optional default settings for requests made using this model.
     */
    constructor(
        public readonly id: string,
        public model: string,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public url: string | undefined,
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
        const settings = this.getSettings(request);
        const openai = this.initializeOpenAi();

        if (this.isNonStreamingModel(this.model)) {
            return this.handleNonStreamingRequest(openai, request);
        }

        if (request.response_format?.type === 'json_schema' && this.supportsStructuredOutput()) {
            return this.handleStructuredOutputRequest(openai, request);
        }

        let runner: ChatCompletionStream;
        const tools = this.createTools(request);
        if (tools) {
            runner = openai.beta.chat.completions.runTools({
                model: this.model,
                messages: request.messages.map(toOpenAIMessage),
                stream: true,
                tools: tools,
                tool_choice: 'auto',
                ...settings
            });
        } else {
            runner = openai.beta.chat.completions.stream({
                model: this.model,
                messages: request.messages.map(toOpenAIMessage),
                stream: true,
                ...settings
            });
        }
        cancellationToken?.onCancellationRequested(() => {
            runner.abort();
        });

        let runnerEnd = false;

        let resolve: (part: LanguageModelStreamResponsePart) => void;
        runner.on('error', error => {
            console.error('Error in OpenAI chat completion stream:', error);
            runnerEnd = true;
            resolve({ content: error.message });
        });
        // we need to also listen for the emitted errors, as otherwise any error actually thrown by the API will not be caught
        runner.emitted('error').then(error => {
            console.error('Error in OpenAI chat completion stream:', error);
            runnerEnd = true;
            resolve({ content: error.message });
        });
        runner.emitted('abort').then(() => {
            // do nothing, as the abort event is only emitted when the runner is aborted by us
        });
        runner.on('message', message => {
            if (message.role === 'tool') {
                resolve({ tool_calls: [{ id: message.tool_call_id, finished: true, result: this.getCompletionContent(message) }] });
            }
            console.debug('Received Open AI message', JSON.stringify(message));
        });
        runner.once('end', () => {
            runnerEnd = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(runner.finalChatCompletion as any);
        });
        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                runner.on('chunk', chunk => {
                    if (chunk.choices[0]?.delta) {
                        resolve({ ...chunk.choices[0]?.delta });
                    }
                });
                while (!runnerEnd) {
                    const promise = new Promise<LanguageModelStreamResponsePart>((res, rej) => {
                        resolve = res;
                    });
                    yield promise;
                }
            }
        };
        return { stream: asyncIterator };
    }

    protected async handleNonStreamingRequest(openai: OpenAI, request: LanguageModelRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: request.messages.map(toOpenAIMessage),
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

    protected supportsStructuredOutput(): boolean {
        // see https://platform.openai.com/docs/models/gpt-4o
        return [
            'gpt-4o',
            'gpt-4o-2024-08-06',
            'gpt-4o-mini'
        ].includes(this.model);
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: LanguageModelRequest): Promise<LanguageModelParsedResponse> {
        const settings = this.getSettings(request);
        // TODO implement tool support for structured output (parse() seems to require different tool format)
        const result = await openai.beta.chat.completions.parse({
            model: this.model,
            messages: request.messages.map(toOpenAIMessage),
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

    private getCompletionContent(message: OpenAI.Chat.Completions.ChatCompletionToolMessageParam): string {
        if (Array.isArray(message.content)) {
            return message.content.join('');
        }
        return message.content;
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
        // We need to hand over "some" key, even if a custom url is not key protected as otherwise the OpenAI client will throw an error
        return new OpenAI({ apiKey: apiKey ?? 'no-key', baseURL: this.url });
    }
}
