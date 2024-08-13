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

import { inject, injectable } from '@theia/core/shared/inversify';
import { CancellationToken, CancellationTokenSource, ILogger, generateUuid } from '@theia/core';
import {
    LanguageModelMetaData,
    LanguageModelRegistry,
    LanguageModelRequest,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelStreamResponsePart,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelResponseDelegate,
    LanguageModelRegistryClient,
    isLanguageModelParsedResponse,
} from '../common';
import { BackendLanguageModelRegistry } from './backend-language-model-registry';

@injectable()
export class LanguageModelRegistryFrontendDelegateImpl implements LanguageModelRegistryFrontendDelegate {

    @inject(LanguageModelRegistry)
    private registry: BackendLanguageModelRegistry;

    setClient(client: LanguageModelRegistryClient): void {
        this.registry.setClient(client);
    }

    async getLanguageModelDescriptions(): Promise<LanguageModelMetaData[]> {
        return (await this.registry.getLanguageModels()).map(model => this.registry.mapToMetaData(model));
    }
}

@injectable()
export class LanguageModelFrontendDelegateImpl implements LanguageModelFrontendDelegate {

    @inject(LanguageModelRegistry)
    private registry: LanguageModelRegistry;

    @inject(ILogger)
    private logger: ILogger;

    private frontendDelegateClient: LanguageModelDelegateClient;
    private requestCancellationTokenMap: Map<string, CancellationTokenSource> = new Map();

    setClient(client: LanguageModelDelegateClient): void {
        this.frontendDelegateClient = client;
    }

    cancel(requestId: string): void {
        this.requestCancellationTokenMap.get(requestId)?.cancel();
    }

    async request(
        modelId: string,
        request: LanguageModelRequest,
        requestId: string,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponseDelegate> {
        const model = await this.registry.getLanguageModel(modelId);
        if (!model) {
            throw new Error(
                `Request was sent to non-existent language model ${modelId}`
            );
        }
        request.tools?.forEach(tool => {
            tool.handler = async args_string => this.frontendDelegateClient.toolCall(requestId, tool.id, args_string);
        });
        if (cancellationToken) {
            const tokenSource = new CancellationTokenSource();
            cancellationToken = tokenSource.token;
            this.requestCancellationTokenMap.set(requestId, tokenSource);
        }
        const response = await model.request(request, cancellationToken);
        if (isLanguageModelTextResponse(response) || isLanguageModelParsedResponse(response)) {
            return response;
        }
        if (isLanguageModelStreamResponse(response)) {
            const delegate = {
                streamId: generateUuid(),
            };
            this.sendTokens(delegate.streamId, response.stream);
            return delegate;
        }
        this.logger.error(
            `Received unexpected response from language model ${modelId}. Trying to continue without touching the response.`,
            response
        );
        return response;
    }

    protected sendTokens(id: string, stream: AsyncIterable<LanguageModelStreamResponsePart>): void {
        (async () => {
            for await (const token of stream) {
                this.frontendDelegateClient.send(id, token);
            }
            this.frontendDelegateClient.send(id, undefined);
        })();
    }
}
