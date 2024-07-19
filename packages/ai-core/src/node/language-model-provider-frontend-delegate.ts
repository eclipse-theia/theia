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
    LanguageModelProviderDescription,
    LanguageModelProviderRegistry,
    LanguageModelRequest,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelStreamResponsePart,
} from '../common';
import {
    LanguageModelProviderDelegateClient,
    LanguageModelProviderFrontendDelegate,
    LanguageModelProviderRegistryFrontendDelegate,
    LanguageModelResponseDelegate,
} from '../common/language-model-provider-delegate';

@injectable()
export class LanguageModelProviderRegistryFrontendDelegateImpl
    implements LanguageModelProviderRegistryFrontendDelegate {
    @inject(LanguageModelProviderRegistry)
    private registry: LanguageModelProviderRegistry;

    async getLanguageModelProviderDescriptions(): Promise<LanguageModelProviderDescription[]> {
        return (await this.registry.getLanguageModelProviders()).map(provider => ({
            id: provider.id,
            label: provider.label,
            description: provider.description,
        }));
    }
}

@injectable()
export class LanguageModelProviderFrontendDelegateImpl
    implements LanguageModelProviderFrontendDelegate {
    @inject(LanguageModelProviderRegistry)
    private registry: LanguageModelProviderRegistry;

    @inject(ILogger)
    private logger: ILogger;

    private frontendDelegateClient: LanguageModelProviderDelegateClient;

    setClient(client: LanguageModelProviderDelegateClient): void {
        this.frontendDelegateClient = client;
    }

    async request(
        modelId: string,
        request: LanguageModelRequest
    ): Promise<LanguageModelResponseDelegate> {
        const provider = await this.registry.getLanguageModelProvider(modelId);
        if (!provider) {
            throw new Error(
                `Request was sent to non-existent language model ${modelId}`
            );
        }
        const response = await provider.request(request);
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
