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

import { LanguageModel, LanguageModelRequest, LanguageModelResponse, LanguageModelStreamResponsePart } from '@theia/ai-core';

export class LlamafileLanguageModel implements LanguageModel {

    readonly providerId = 'llamafile';
    readonly vendor: string = 'Mozilla';

    constructor(readonly name: string, readonly uri: string, readonly port: number) {
    }

    get id(): string {
        return this.name;
    }

    async request(request: LanguageModelRequest): Promise<LanguageModelResponse> {
        try {
            let prompt = request.messages.map(message => {
                switch (message.actor) {
                    case 'user':
                        return `User: ${message.query}`;
                    case 'ai':
                        return `Llama: ${message.query}`;
                    case 'system':
                        return `${message.query.replace(/\n\n/g, '\n')}`;
                }
            }).join('\n');
            prompt += '\nLlama:';
            const response = await fetch(`http://localhost:${this.port}/completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    n_predict: 200,
                    stream: true,
                    stop: ['</s>', 'Llama:', 'User:', '<|eot_id|>'],
                    cache_prompt: true,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Response body is undefined');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            return {
                stream: {
                    [Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                        return {
                            async next(): Promise<IteratorResult<LanguageModelStreamResponsePart>> {
                                const { value, done } = await reader.read();
                                if (done) {
                                    return { value: undefined, done: true };
                                }
                                const read = decoder.decode(value, { stream: true });
                                const chunk = read.split('\n').filter(l => l.length !== 0).reduce((acc, line) => {
                                    try {
                                        const parsed = JSON.parse(line.substring(6));
                                        acc += parsed.content;
                                        return acc;
                                    } catch (error) {
                                        console.error('Error parsing JSON:', error);
                                        return acc;
                                    }
                                }, '');
                                return { value: { content: chunk }, done: false };
                            }
                        };
                    }
                }
            };
        } catch (error) {
            console.error('Error:', error);
            return {
                text: `Error: ${error}`
            };
        }
    }

}
