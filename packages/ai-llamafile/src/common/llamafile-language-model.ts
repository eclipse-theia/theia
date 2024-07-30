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

import { LanguageModel, LanguageModelRequest, LanguageModelResponse } from '@theia/ai-core';
import { LlamafileServerManager } from './llamafile-server-manager';

export class LlamafileLanguageModel implements LanguageModel {

    readonly providerId = 'llamafile';
    readonly vendor: string = 'Mozilla';

    constructor(readonly name: string, readonly path: string, readonly port: number, readonly serverManager: LlamafileServerManager) {
    }

    startServer(): void {
        this.serverManager.startServer(this.name, this.path, this.port);
    }

    killServer(): void {
        this.serverManager.killServer(this.name);
    }

    setAsActive(): void {
        this.serverManager.setAsActive(this.name);
    }

    isActive(): boolean {
        return this.serverManager.isActive(this.name);
    }

    get id(): string {
        return this.name;
    }

    async request(request: LanguageModelRequest): Promise<LanguageModelResponse> {
        try {
            const response = await fetch(`http://localhost:${this.port}/completion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: request.messages[request.messages.length - 1].query,
                    n_predict: 200
                    // stream: true
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // TODO: Get the stream working
            // if (!response.body) {
            //     throw new Error('Response body is undefined');
            // }

            // const reader = response.body.getReader();
            // return {
            //     stream: {
            //         [Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
            //             return {
            //                 async next(): Promise<IteratorResult<LanguageModelStreamResponsePart>> {
            //                     const { value, done } = await reader.read();
            //                     if (done) {
            //                         return { value: undefined, done: true };
            //                     }
            //                     const text = new TextDecoder().decode(value).substring(5);
            //                     console.log(text);
            //                     const parsed = JSON.parse(text);
            //                     console.log(parsed);
            //                     return { value: parsed.content, done: false };
            //                 }
            //             };
            //         }
            //     }
            // };

            const data = await response.json();
            if (data && data.content) {
                return {
                    text: data.content
                };
            } else {
                return {
                    text: 'No content field found in the response.'
                };
            }
        } catch (error) {
            console.error('Error:', error);
            return {
                text: `Error: ${error}`
            };
        }
    }

    static createNewLlamafileLanguageModel(name: string, path: string, port: number, serverManager: LlamafileServerManager): LlamafileLanguageModel {
        return new LlamafileLanguageModel(name, path, port, serverManager);
    }

}
