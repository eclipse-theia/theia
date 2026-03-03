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
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    MessageActor,
    LanguageModelStatus
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { InferenceClient } from '@huggingface/inference';

export const HuggingFaceModelIdentifier = Symbol('HuggingFaceModelIdentifier');

function toRole(actor: MessageActor): 'user' | 'assistant' | 'system' {
    switch (actor) {
        case 'user':
            return 'user';
        case 'ai':
            return 'assistant';
        case 'system':
            return 'system';
        default:
            return 'user';
    }
}

function toChatMessages(messages: LanguageModelMessage[]): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return messages
        .filter(LanguageModelMessage.isTextMessage)
        .map(message => ({
            role: toRole(message.actor),
            content: message.text
        }));
}

export class HuggingFaceModel implements LanguageModel {

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the Hugging Face API
     * @param apiKey function to retrieve the API key for Hugging Face
     */
    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public apiKey: () => string | undefined,
        public readonly name?: string,
        public readonly vendor?: string,
        public readonly version?: string,
        public readonly family?: string,
        public readonly maxInputTokens?: number,
        public readonly maxOutputTokens?: number
    ) { }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const hfInference = this.initializeInferenceClient();
        if (this.isStreamingSupported(this.model)) {
            return this.handleStreamingRequest(hfInference, request, cancellationToken);
        } else {
            return this.handleNonStreamingRequest(hfInference, request);
        }
    }

    protected getSettings(request: LanguageModelRequest): Record<string, unknown> {
        return request.settings ?? {};
    }

    protected async handleNonStreamingRequest(hfInference: InferenceClient, request: LanguageModelRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);

        const response = await hfInference.chatCompletion({
            model: this.model,
            messages: toChatMessages(request.messages),
            ...settings
        });

        const text = response.choices[0]?.message?.content ?? '';

        return {
            text
        };
    }

    protected async handleStreamingRequest(
        hfInference: InferenceClient,
        request: LanguageModelRequest,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponse> {

        const settings = this.getSettings(request);

        const stream = hfInference.chatCompletionStream({
            model: this.model,
            messages: toChatMessages(request.messages),
            ...settings
        });

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content;

                    if (content !== undefined) {
                        yield { content };
                    }

                    if (cancellationToken?.isCancellationRequested) {
                        break;
                    }
                }
            }
        };

        return { stream: asyncIterator };
    }

    protected isStreamingSupported(model: string): boolean {
        // Assuming all models support streaming for now; can be refined if needed
        return true;
    }

    private initializeInferenceClient(): InferenceClient {
        const token = this.apiKey();
        if (!token) {
            throw new Error('Please provide a Hugging Face API token.');
        }
        return new InferenceClient(token);
    }
}
