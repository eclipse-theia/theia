// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { CancellationToken, ILogger } from '@theia/core';
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
    AISettingsService,
    DefaultLanguageModelRegistryImpl,
    isLanguageModelParsedResponse,
    isLanguageModelStreamResponse,
    isLanguageModelStreamResponseDelegate,
    isLanguageModelTextResponse,
    isModelMatching,
    isTextResponsePart,
    LanguageModel,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelMetaData,
    LanguageModelRegistryClient,
    LanguageModelRegistryFrontendDelegate,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelSelector,
    LanguageModelStreamResponsePart,
    ToolCallResult,
} from '../common';

@injectable()
export class LanguageModelDelegateClientImpl
    implements LanguageModelDelegateClient, LanguageModelRegistryClient {
    protected receiver: FrontendLanguageModelRegistryImpl;

    setReceiver(receiver: FrontendLanguageModelRegistryImpl): void {
        this.receiver = receiver;
    }

    send(id: string, token: LanguageModelStreamResponsePart | undefined): void {
        this.receiver.send(id, token);
    }

    toolCall(requestId: string, toolId: string, args_string: string): Promise<ToolCallResult> {
        return this.receiver.toolCall(requestId, toolId, args_string);
    }

    error(id: string, error: Error): void {
        this.receiver.error(id, error);
    }

    languageModelAdded(metadata: LanguageModelMetaData): void {
        this.receiver.languageModelAdded(metadata);
    }

    languageModelRemoved(id: string): void {
        this.receiver.languageModelRemoved(id);
    }
}

interface StreamState {
    id: string;
    tokens: (LanguageModelStreamResponsePart | undefined)[];
    resolve?: (_: unknown) => void;
    reject?: (_: unknown) => void;
}

@injectable()
export class FrontendLanguageModelRegistryImpl
    extends DefaultLanguageModelRegistryImpl {

    // called by backend
    languageModelAdded(metadata: LanguageModelMetaData): void {
        this.addLanguageModels([metadata]);
    }
    // called by backend
    languageModelRemoved(id: string): void {
        this.removeLanguageModels([id]);
    }
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

    private static requestCounter: number = 0;

    override addLanguageModels(models: LanguageModelMetaData[] | LanguageModel[]): void {
        let modelAdded = false;
        for (const model of models) {
            if (this.languageModels.find(m => m.id === model.id)) {
                console.warn(`Tried to add an existing model ${model.id}`);
                continue;
            }
            if (LanguageModel.is(model)) {
                this.languageModels.push(
                    new Proxy(
                        model,
                        languageModelOutputHandler(
                            () => this.outputChannelManager.getChannel(
                                model.id
                            )
                        )
                    )
                );
                modelAdded = true;
            } else {
                this.languageModels.push(
                    new Proxy(
                        this.createFrontendLanguageModel(
                            model
                        ),
                        languageModelOutputHandler(
                            () => this.outputChannelManager.getChannel(
                                model.id
                            )
                        )
                    )
                );
                modelAdded = true;
            }
        }
        if (modelAdded) {
            this.changeEmitter.fire({ models: this.languageModels });
        }
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
            request: async (request: LanguageModelRequest, cancellationToken?: CancellationToken) => {
                const requestId = `${FrontendLanguageModelRegistryImpl.requestCounter++}`;
                this.requests.set(requestId, request);
                cancellationToken?.onCancellationRequested(() => {
                    this.providerDelegate.cancel(requestId);
                });
                const response = await this.providerDelegate.request(
                    description.id,
                    request,
                    requestId,
                    cancellationToken
                );
                if (isLanguageModelTextResponse(response) || isLanguageModelParsedResponse(response)) {
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

    protected streams = new Map<string, StreamState>();
    protected requests = new Map<string, LanguageModelRequest>();

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
                await new Promise((resolve, reject) => {
                    state.resolve = resolve;
                    state.reject = reject;
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

    // called by backend once tool is invoked
    async toolCall(id: string, toolId: string, arg_string: string): Promise<ToolCallResult> {
        if (!this.requests.has(id)) {
            return { error: true, message: `No request found for ID '${id}'. The request may have been cancelled or completed.` };
        }
        const request = this.requests.get(id)!;
        const tool = request.tools?.find(t => t.id === toolId);
        if (tool) {
            try {
                return await tool.handler(arg_string);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { error: true, message: `Error executing tool '${toolId}': ${errorMessage}` };
            };
        }
        return { error: true, message: `Tool '${toolId}' not found in the available tools for this request.` };
    }

    // called by backend via the "delegate client" with the error to use for rejection
    error(id: string, error: Error): void {
        if (!this.streams.has(id)) {
            const newStreamState = {
                id,
                tokens: [],
            };
            this.streams.set(id, newStreamState);
        }
        const streamState = this.streams.get(id)!;
        streamState.reject?.(error);
    }

    override async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]> {
        await this.initialized;
        const userSettings = (await this.settingsService.getAgentSettings(request.agent))?.languageModelRequirements?.find(req => req.purpose === request.purpose);
        if (userSettings?.identifier) {
            const model = await this.getLanguageModel(userSettings.identifier);
            if (model) {
                return [model];
            }
        }
        return this.languageModels.filter(model => isModelMatching(request, model));
    }

    override async selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined> {
        return (await this.selectLanguageModels(request))[0];
    }
}

const formatJsonWithIndentation = (obj: unknown): string[] => {
    // eslint-disable-next-line no-null/no-null
    const jsonString = JSON.stringify(obj, null, 2);
    const lines = jsonString.split('\n');
    const formattedLines: string[] = [];

    lines.forEach(line => {
        const subLines = line.split('\\n');
        const index = indexOfValue(subLines[0]) + 1;
        formattedLines.push(subLines[0]);
        const prefix = index > 0 ? ' '.repeat(index) : '';
        if (index !== -1) {
            for (let i = 1; i < subLines.length; i++) {
                formattedLines.push(prefix + subLines[i]);
            }
        }
    });

    return formattedLines;
};

const indexOfValue = (jsonLine: string): number => {
    const pattern = /"([^"]+)"\s*:\s*/g;
    const match = pattern.exec(jsonLine);
    return match ? match.index + match[0].length : -1;
};

const languageModelOutputHandler = (
    outputChannelGetter: () => OutputChannel
): ProxyHandler<LanguageModel> => ({
    get<K extends keyof LanguageModel>(
        target: LanguageModel,
        prop: K,
    ): LanguageModel[K] | LanguageModel['request'] {
        const original = target[prop];
        if (prop === 'request' && typeof original === 'function') {
            return async function (
                ...args: Parameters<LanguageModel['request']>
            ): Promise<LanguageModelResponse> {
                const outputChannel = outputChannelGetter();
                outputChannel.appendLine(
                    'Sending request:'
                );
                const formattedRequest = formatJsonWithIndentation(args[0]);
                outputChannel.append(formattedRequest.join('\n'));
                if (args[1]) {
                    args[1] = new Proxy(args[1], {
                        get<CK extends keyof CancellationToken>(
                            cTarget: CancellationToken,
                            cProp: CK
                        ): CancellationToken[CK] | CancellationToken['onCancellationRequested'] {
                            if (cProp === 'onCancellationRequested') {
                                return (...cargs: Parameters<CancellationToken['onCancellationRequested']>) => cTarget.onCancellationRequested(() => {
                                    outputChannel.appendLine('\nCancel requested', OutputChannelSeverity.Warning);
                                    cargs[0]();
                                }, cargs[1], cargs[2]);
                            }
                            return cTarget[cProp];
                        }
                    });
                }
                try {
                    const result = await original.apply(target, args);
                    if (isLanguageModelStreamResponse(result)) {
                        outputChannel.appendLine('Received a response stream');
                        const stream = result.stream;
                        const loggedStream = {
                            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                                for await (const part of stream) {
                                    outputChannel.append((isTextResponsePart(part) && part.content) || '');
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
