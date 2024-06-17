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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    ChatRequestPart,
    ChatResponse,
    ChatResponsePart,
    LanguageModelProvider,
    ModelProviderFrontendDelegate,
    isTextStreamChatResponsePartDelegate,
} from '../common';
import { FrontendChatDelegateClientImpl } from './frontend-chat-delegate-client';

interface StreamState {
    id: string;
    tokens: (string | undefined)[];
    resolve?: (_: unknown) => void
}

@injectable()
export class FrontendLanguageModelProvider implements LanguageModelProvider {

    @inject(ModelProviderFrontendDelegate)
    private delegate: ModelProviderFrontendDelegate;

    @inject(FrontendChatDelegateClientImpl)
    private client: FrontendChatDelegateClientImpl;

    @postConstruct()
    protected init(): void {
        this.client.setProvider(this);
    }

    private streams = new Map<string, StreamState>();

    async* getIterable(
        state: StreamState
    ): AsyncIterable<string> {
        let current = -1;
        while (true) {
            if (current < state.tokens.length - 1) {
                current++;
                const token = state.tokens[current];
                if (token === undefined) {
                    // message is finished
                    break;
                }
                if (token !== undefined) {
                    yield token;
                }
            } else {
                await new Promise(resolve => {
                    state.resolve = resolve;
                });
            }
        }
        this.streams.delete(state.id);
    }

    async sendRequest(messages: ChatRequestPart[]): Promise<ChatResponse> {
        const response = await this.delegate.sendRequest(messages);
        return response.map<ChatResponsePart>(responsePart => {
            if (isTextStreamChatResponsePartDelegate(responsePart)) {
                if (!this.streams.has(responsePart.id)) {
                    const newStreamState = {
                        id: responsePart.id,
                        tokens: [],
                    };
                    this.streams.set(responsePart.id, newStreamState);
                }
                const streamState = this.streams.get(responsePart.id)!;
                return {
                    type: 'text-stream',
                    stream: this.getIterable(streamState),
                    format: responsePart.format
                };
            }
            return responsePart;
        });
    }

    // called by backend via delegate with new tokens
    send(id: string, token: string | undefined): void {
        if (!this.streams.has(id)) {
            const newStreamState = {
                id,
                tokens: [],
            };
            this.streams.set(id, newStreamState);
        }
        const streamState = this.streams.get(id)!;
        streamState.tokens.push(token);
        if (streamState.resolve) {
            streamState.resolve(token);
        }
    }
}
