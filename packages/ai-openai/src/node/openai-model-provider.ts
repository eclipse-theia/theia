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

import { LanguageModel, LanguageModelRequest, LanguageModelRequestMessage, LanguageModelResponse, LanguageModelStreamResponsePart } from '@theia/ai-core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import OpenAI from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { BaseFunctionsArgs, RunnableToolFunctionWithoutParse, RunnableTools } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

@injectable()
export class OpenAiModel implements LanguageModel {

    readonly providerId = 'openai';
    readonly vendor: string = 'OpenAI';

    @inject(OpenAiModelIdentifier)
    protected readonly model: string;

    private openai: OpenAI;

    @postConstruct()
    init(): void {
        this.openai = new OpenAI();
    }

    get id(): string {
        return this.providerId + '/' + this.model;
    }

    get name(): string {
        return this.model;
    }

    async request(request: LanguageModelRequest): Promise<LanguageModelResponse> {
        const tools: RunnableTools<BaseFunctionsArgs> | undefined = request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                function: (args_string: string) => tool.handler(args_string)
            }
        } as RunnableToolFunctionWithoutParse
        ));
        let runner: ChatCompletionStream;
        if (tools) {
            runner = this.openai.beta.chat.completions.runTools({
                model: this.model,
                messages: request.messages.map(this.toOpenAIMessage),
                stream: true,
                tools: tools,
                tool_choice: 'auto'
            });
        } else {
            runner = this.openai.beta.chat.completions.stream({
                model: this.model,
                messages: request.messages.map(this.toOpenAIMessage),
                stream: true
            });
        }

        let runnerEnd = false;

        let resolve: (part: LanguageModelStreamResponsePart) => void;
        runner.on('error', error => {
            console.error('Error in OpenAI chat completion stream:', error);
            runnerEnd = true;
            resolve({ content: error.message });
        });
        runner.on('message', message => {
            if (message.role === 'tool') {
                resolve({ tool_calls: [{ id: message.tool_call_id, finished: true, result: message.content }] });
            }
            console.log('Message:', JSON.stringify(message));
        });
        runner.once('end', () => {
            runnerEnd = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(runner.finalChatCompletion as any);
        });
        // eslint-disable-next-line @typescript-eslint/tslint/config
        const asyncIterator = (async function* () {
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
        })();
        return { stream: asyncIterator };
    }

    private toOpenAIMessage(message: LanguageModelRequestMessage): ChatCompletionMessageParam {
        if (message.actor === 'ai') {
            return { role: 'assistant', content: message.query };
        }
        if (message.actor === 'user') {
            return { role: 'user', content: message.query };
        }
        if (message.actor === 'system') {
            return { role: 'system', content: message.query };
        }
        return { role: 'system', content: '' };
    }

}
