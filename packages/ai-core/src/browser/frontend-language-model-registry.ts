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
import { ILogger } from '@theia/core';
import {
    inject,
    injectable,
    postConstruct,
} from '@theia/core/shared/inversify';
import {
    DefaultLanguageModelRegistryImpl,
    isLanguageModelStreamResponseDelegate,
    isLanguageModelTextResponse,
    LanguageModel,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelMetaData,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelRequest,
    LanguageModelStreamResponsePart
} from '../common';

export interface TokenReceiver {
    send(id: string, token: LanguageModelStreamResponsePart | undefined): void;
}

@injectable()
export class LanguageModelDelegateClientImpl
    implements LanguageModelDelegateClient {
    protected receiver: TokenReceiver;

    setReceiver(receiver: TokenReceiver): void {
        this.receiver = receiver;
    }

    send(id: string, token: LanguageModelStreamResponsePart | undefined): void {
        this.receiver.send(id, token);
    }
}

interface StreamState {
    id: string;
    tokens: (LanguageModelStreamResponsePart | undefined)[];
    resolve?: (_: unknown) => void;
}

@injectable()
export class FrontendLanguageModelRegistryImpl
    extends DefaultLanguageModelRegistryImpl
    implements TokenReceiver {
    @inject(LanguageModelRegistryFrontendDelegate)
    protected registryDelegate: LanguageModelRegistryFrontendDelegate;

    @inject(LanguageModelFrontendDelegate)
    protected providerDelegate: LanguageModelFrontendDelegate;

    @inject(LanguageModelDelegateClientImpl)
    protected client: LanguageModelDelegateClientImpl;

    @inject(ILogger)
    protected override logger: ILogger;

    @postConstruct()
    protected override init(): void {
        this.client.setReceiver(this);
    }

    override async getLanguageModels(): Promise<LanguageModel[]> {
        // all providers coming in via the frontend
        const frontendProviders = await super.getLanguageModels();
        // also delegate to backend providers
        const backendDescriptions = await this.registryDelegate.getLanguageModelDescriptions();
        return [
            ...frontendProviders,
            ...backendDescriptions.map(description =>
                this.createFrontendLanguageModel(description)
            ),
        ];
    }

    createFrontendLanguageModel(
        description: LanguageModelMetaData
    ): LanguageModel {
        return {
            ...description,
            request: async (request: LanguageModelRequest) => {
                const response = await this.providerDelegate.request(
                    description.id,
                    request
                );
                if (isLanguageModelTextResponse(response)) {
                    return response;
                }
                if (isLanguageModelStreamResponseDelegate(response)) {
                    if (!this.streams.has(response.streamId)) {
                        const newStreamState = {
                            id: response.streamId,
                            tokens: [],
                        };
                        this.streams.set(response.streamId, newStreamState);
                    }
                    const streamState = this.streams.get(response.streamId)!;
                    return {
                        stream: this.getIterable(streamState),
                    };
                }
                this.logger.error(
                    `Received unknown response in frontend for request to language model ${description.id}. Trying to continue without touching the response.`,
                    response
                );
                return response;
            },
        };
    }

    private streams = new Map<string, StreamState>();

    async *getIterable(state: StreamState): AsyncIterable<LanguageModelStreamResponsePart> {
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

    // called by backend via the "delegate client" with new tokens
    send(id: string, token: LanguageModelStreamResponsePart | undefined): void {
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
