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
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    MessageActor
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { HfInference } from '@huggingface/inference';

export const HuggingFaceModelIdentifier = Symbol('HuggingFaceModelIdentifier');

function toHuggingFacePrompt(messages: LanguageModelRequestMessage[]): string {
    if (messages.length === 1) {
        return messages[0].query;
    }
    return messages.map(message => `${toRoleLabel(message.actor)}: ${message.query}`).join('\n');
}

function toRoleLabel(actor: MessageActor): string {
    switch (actor) {
        case 'user':
            return 'User';
        case 'ai':
            return 'Assistant';
        case 'system':
            return 'System';
        default:
            return '';
    }
}

export class HuggingFaceModel implements LanguageModel {

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the Hugging Face API
     * @param apiKey function to retrieve the API key for Hugging Face
     */
    constructor(public readonly id: string, public model: string, public apiKey: () => string | undefined) {
    }

    async request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const hfInference = this.initializeHfInference();
        if (this.isStreamingSupported(this.model)) {
            return this.handleStreamingRequest(hfInference, request, cancellationToken);
        } else {
            return this.handleNonStreamingRequest(hfInference, request);
        }
    }

    protected getDefaultSettings(): Record<string, unknown> {
        return {
            max_new_tokens: 2024,
            stop: ['<|endoftext|>', '<eos>']
        };
    }

    protected async handleNonStreamingRequest(hfInference: HfInference, request: LanguageModelRequest): Promise<LanguageModelTextResponse> {
        const settings = request.settings || this.getDefaultSettings();

        const response = await hfInference.textGeneration({
            model: this.model,
            inputs: toHuggingFacePrompt(request.messages),
            parameters: {
                ...settings
            }
        });

        const stopWords = Array.isArray(settings.stop) ? settings.stop : [];
        let cleanText = response.generated_text;

        stopWords.forEach(stopWord => {
            if (cleanText.endsWith(stopWord)) {
                cleanText = cleanText.slice(0, -stopWord.length).trim();
            }
        });

        return {
            text: cleanText
        };
    }

    protected async handleStreamingRequest(
        hfInference: HfInference,
        request: LanguageModelRequest,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponse> {
        const settings = request.settings || this.getDefaultSettings();

        const stream = hfInference.textGenerationStream({
            model: this.model,
            inputs: toHuggingFacePrompt(request.messages),
            parameters: {
                ...settings
            }
        });

        const stopWords = Array.isArray(settings.stop) ? settings.stop : [];

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                for await (const chunk of stream) {
                    let content = chunk.token.text;

                    stopWords.forEach(stopWord => {
                        if (content.endsWith(stopWord)) {
                            content = content.slice(0, -stopWord.length).trim();
                        }
                    });

                    yield { content };

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

    private initializeHfInference(): HfInference {
        const token = this.apiKey();
        if (!token) {
            throw new Error('Please provide a Hugging Face API token.');
        }
        return new HfInference(token);
    }
}
