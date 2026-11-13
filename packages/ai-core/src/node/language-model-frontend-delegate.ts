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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { CancellationToken, CancellationTokenSource, ILogger, generateUuid } from '@theia/core';
import {
    LanguageModel,
    LanguageModelMetaData,
    LanguageModelRegistry,
    LanguageModelResponse,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelStreamResponsePart,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelResponseDelegate,
    LanguageModelRegistryClient,
    isLanguageModelParsedResponse,
    UserRequest,
    extractErrorMessageWithCause,
} from '../common/index.js';
import { BackendLanguageModelRegistryImpl } from './backend-language-model-registry.js';

@injectable()
export class LanguageModelRegistryFrontendDelegateImpl implements LanguageModelRegistryFrontendDelegate {

    @inject(LanguageModelRegistry)
    private registry: BackendLanguageModelRegistryImpl;

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

    @inject(ILogger) @named('ai-core:LanguageModelFrontendDelegateImpl')
    protected readonly logger: ILogger;

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
        request: UserRequest,
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
            tool.handler = async (args_string, ctx) => this.frontendDelegateClient.toolCall(requestId, tool.id, args_string, ctx?.toolCallId);
        });
        if (cancellationToken) {
            const tokenSource = new CancellationTokenSource();
            cancellationToken = tokenSource.token;
            this.requestCancellationTokenMap.set(requestId, tokenSource);
        }
        const response = await this.requestAndFlattenErrors(model, request, cancellationToken);
        if (isLanguageModelTextResponse(response) || isLanguageModelParsedResponse(response)) {
            return response;
        }
        if (isLanguageModelStreamResponse(response)) {
            const delegate = {
                streamId: generateUuid(),
            };
            this.sendTokens(delegate.streamId, response.stream, cancellationToken);
            return delegate;
        }
        this.logger.error(
            `Received unexpected response from language model ${modelId}. Trying to continue without touching the response.`,
            response
        );
        return response;
    }

    /**
     * Calls the backend model and flattens any thrown error's `cause` chain into its message.
     *
     * This is the single choke point where backend errors are still complete: the RPC error
     * extension that serializes this rejection to the frontend only keeps `code`, `data`, `message`,
     * `name` and `stack`, dropping `cause`. Node's `fetch` (undici) reports network failures as an
     * opaque `TypeError: fetch failed` with the actionable reason (`ECONNREFUSED`, `ENOTFOUND`, TLS
     * errors, ...) on `error.cause`, so without flattening here the frontend would only ever see
     * "fetch failed". Flattening the chain into the message preserves the real reason across RPC.
     */
    protected async requestAndFlattenErrors(
        model: LanguageModel,
        request: UserRequest,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponse> {
        try {
            return await model.request(request, cancellationToken);
        } catch (error) {
            throw this.flattenError(error);
        }
    }

    /**
     * Builds an {@link Error} whose message incorporates the `cause` chain (see
     * {@link requestAndFlattenErrors}), while preserving the original stack and name. Non-error
     * inputs are returned unchanged.
     */
    protected flattenError(error: unknown): unknown {
        if (!(error instanceof Error)) {
            return error;
        }
        const enrichedMessage = extractErrorMessageWithCause(error);
        if (!enrichedMessage || enrichedMessage === error.message) {
            return error;
        }
        return Object.assign(new Error(enrichedMessage), { stack: error.stack, name: error.name });
    }

    protected sendTokens(id: string, stream: AsyncIterable<LanguageModelStreamResponsePart>, cancellationToken?: CancellationToken): void {
        (async () => {
            try {
                for await (const token of stream) {
                    this.frontendDelegateClient.send(id, token);
                }
            } catch (e) {
                if (!cancellationToken?.isCancellationRequested) {
                    // Flatten the cause chain before it crosses RPC (which drops `cause`), see
                    // requestAndFlattenErrors.
                    this.frontendDelegateClient.error(id, this.flattenError(e) as Error);
                }
            } finally {
                this.frontendDelegateClient.send(id, undefined);
            }
        })();
    }
}
