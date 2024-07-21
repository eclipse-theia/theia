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
import { ILogger, generateUuid } from '@theia/core';
import {
    LanguageModelMetaData,
    LanguageModelRegistry,
    LanguageModelRequest,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelStreamResponsePart,
} from '../common';
import {
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelResponseDelegate,
} from '../common/language-model-delegate';

@injectable()
export class LanguageModelRegistryFrontendDelegateImpl implements LanguageModelRegistryFrontendDelegate {

    @inject(LanguageModelRegistry)
    private registry: LanguageModelRegistry;

    async getLanguageModelDescriptions(): Promise<LanguageModelMetaData[]> {
        return (await this.registry.getLanguageModels()).map(model => ({
            id: model.id,
            providerId: model.providerId,
            name: model.name,
            vendor: model.vendor,
            version: model.version,
            family: model.family,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: model.maxOutputTokens,
        }));
    }
}

@injectable()
export class LanguageModelFrontendDelegateImpl implements LanguageModelFrontendDelegate {

    @inject(LanguageModelRegistry)
    private registry: LanguageModelRegistry;

    @inject(ILogger)
    private logger: ILogger;

    private frontendDelegateClient: LanguageModelDelegateClient;

    setClient(client: LanguageModelDelegateClient): void {
        this.frontendDelegateClient = client;
    }

    async request(
        modelId: string,
        request: LanguageModelRequest
    ): Promise<LanguageModelResponseDelegate> {
        const model = await this.registry.getLanguageModel(modelId);
        if (!model) {
            throw new Error(
                `Request was sent to non-existent language model ${modelId}`
            );
        }
        const response = await model.request(request);
        if (isLanguageModelTextResponse(response)) {
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
