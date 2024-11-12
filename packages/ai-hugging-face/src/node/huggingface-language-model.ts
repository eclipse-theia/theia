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

    protected async handleNonStreamingRequest(hfInference: HfInference, request: LanguageModelRequest): Promise<LanguageModelTextResponse> {
        const response = await hfInference.textGeneration({
            model: this.model,
            inputs: toHuggingFacePrompt(request.messages),
            parameters: {
                temperature: 0.1,          // Controls randomness, 0.1 for consistent outputs
                max_new_tokens: 200,       // Limits response length
                return_full_text: false,   // Ensures only the generated part is returned, not the prompt
                do_sample: true,           // Enables sampling for more varied responses
                stop: ['<|endoftext|>']    // Stop generation at this token
            }
        });

        const cleanText = response.generated_text.replace(/<\|endoftext\|>/g, '');

        return {
            text: cleanText
        };
    }

    protected async handleStreamingRequest(hfInference: HfInference, request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const stream = hfInference.textGenerationStream({
            model: this.model,
            inputs: toHuggingFacePrompt(request.messages),
            parameters: {
                temperature: 0.1,
                max_new_tokens: 200,
                return_full_text: false,
                do_sample: true,
                stop: ['<|endoftext|>']
            }
        });

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                for await (const chunk of stream) {
                    const content = chunk.token.text.replace(/<\|endoftext\|>/g, '');
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
