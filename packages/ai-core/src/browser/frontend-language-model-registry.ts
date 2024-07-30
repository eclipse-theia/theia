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
    OutputChannel,
    OutputChannelManager,
    OutputChannelSeverity,
} from '@theia/output/lib/browser/output-channel';
import {
    DefaultLanguageModelRegistryImpl,
    isLanguageModelStreamResponse,
    isLanguageModelStreamResponseDelegate,
    isLanguageModelTextResponse,
    isModelMatching,
    LanguageModel,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelMetaData,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelSelector,
    LanguageModelStreamResponsePart,
} from '../common';
import { AISettingsService } from './ai-settings-service';

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

    @inject(OutputChannelManager)
    protected outputChannelManager: OutputChannelManager;

    @inject(AISettingsService)
    protected settingsService: AISettingsService;

    override addLanguageModels(models: LanguageModelMetaData[] | LanguageModel[]): void {
        models.map(model => {
            if (LanguageModel.is(model)) {
                this.languageModels.push(
                    new Proxy(
                        model,
                        languageModelOutputHandler(
                            this.outputChannelManager.getChannel(
                                model.id
                            )
                        )
                    )
                );
            } else {
                this.languageModels.push(
                    new Proxy(
                        this.createFrontendLanguageModel(
                            model
                        ),
                        languageModelOutputHandler(
                            this.outputChannelManager.getChannel(
                                model.id
                            )
                        )
                    )
                );
            }
        });
    }

    @postConstruct()
    protected override init(): void {
        this.client.setReceiver(this);

        const contributions =
            this.languageModelContributions.getContributions();
        const promises = contributions.map(provider => provider());
        const backendDescriptions =
            this.registryDelegate.getLanguageModelDescriptions();

        Promise.allSettled([backendDescriptions, ...promises]).then(
            results => {
                const backendDescriptionsResult = results[0];
                if (backendDescriptionsResult.status === 'fulfilled') {
                    this.addLanguageModels(backendDescriptionsResult.value);
                } else {
                    this.logger.error(
                        'Failed to add language models contributed from the backend',
                        backendDescriptionsResult.reason
                    );
                }
                for (let i = 1; i < results.length; i++) {
                    // assert that index > 0 contains only language models
                    const languageModelResult = results[i] as
                        | PromiseRejectedResult
                        | PromiseFulfilledResult<LanguageModel[]>;
                    if (languageModelResult.status === 'fulfilled') {
                        this.addLanguageModels(languageModelResult.value);
                    } else {
                        this.logger.error(
                            'Failed to add some language models:',
                            languageModelResult.reason
                        );
                    }
                }
                this.markInitialized();
            }
        );
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

    async *getIterable(
        state: StreamState
    ): AsyncIterable<LanguageModelStreamResponsePart> {
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

    override async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]> {
        await this.initialized;
        const userSettings = this.settingsService.getAgentSettings(request.agent)?.languageModelRequirements.find(req => req.purpose === request.purpose);
        if (userSettings?.identifier) {
            const model = await this.getLanguageModel(userSettings.identifier);
            if (model) {
                return [model];
            }
        }

        return this.languageModels.filter(model => isModelMatching(request, model));
    }
}

const languageModelOutputHandler = (
    outputChannel: OutputChannel
): ProxyHandler<LanguageModel> => ({
    get<K extends keyof LanguageModel>(
        target: LanguageModel,
        prop: K
    ): LanguageModel[K] | LanguageModel['request'] {
        const original = target[prop];
        if (prop === 'request' && typeof original === 'function') {
            return async function (
                ...args: Parameters<LanguageModel['request']>
            ): Promise<LanguageModelResponse> {
                outputChannel.appendLine(
                    `Sending request: ${JSON.stringify(args)}`
                );
                try {
                    const result = await original.apply(target, args);
                    if (isLanguageModelStreamResponse(result)) {
                        outputChannel.appendLine('Received a response stream');
                        const stream = result.stream;
                        const loggedStream = {
                            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                                for await (const part of stream) {
                                    outputChannel.append(part.content || '');
                                    yield part;
                                }
                                outputChannel.append('\n');
                                outputChannel.appendLine('End of stream');
                            },
                        };
                        return {
                            ...result,
                            stream: loggedStream,
                        };
                    } else {
                        outputChannel.appendLine('Received a response');
                        outputChannel.appendLine(JSON.stringify(result));
                        return result;
                    }
                } catch (err) {
                    outputChannel.appendLine('An error occurred');
                    if (err instanceof Error) {
                        outputChannel.appendLine(
                            err.message,
                            OutputChannelSeverity.Error
                        );
                    }
                    throw err;
                }
            };
        }
        return original;
    },
});
