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

import {
    LanguageModel,
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelTextResponse,
    UserRequest,
    LanguageModelStatus,
    ReasoningSupport,
    resolveCompactionTokenThreshold,
    resolveServerSideCompaction,
    ServerToolDescriptor
} from '@theia/ai-core';
import { OpenAiModelUtils } from './openai-model-utils';
import { CancellationToken, ILogger, isObject } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { OpenAI, AzureOpenAI } from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';
import { StreamingAsyncIterator } from './openai-streaming-iterator';
import { ChatCompletionStreamingAsyncIteratorFactory } from './openai-chat-completion-stream';
import { OPENAI_PROVIDER_ID } from '../common';
import type { FinalRequestOptions } from 'openai/internal/request-options';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';
import { openAiReasoningFor } from './openai-reasoning';
import { createProxyFetch } from '@theia/ai-core/lib/node';

export class MistralFixedOpenAI extends OpenAI {
    protected override async prepareOptions(options: FinalRequestOptions): Promise<void> {
        // Every request the client issues passes through here, including the body-less `GET /models`
        // that model discovery runs, so the body cannot be assumed to exist, let alone to carry messages.
        const messages = (options.body as { messages?: Array<ChatCompletionMessageParam> } | undefined)?.messages;
        if (Array.isArray(messages)) {
            messages.forEach(m => {
                if (m.role === 'assistant' && m.tool_calls) {
                    // Mistral OpenAI Endpoint expects refusal to be undefined and not null for optional properties
                    // eslint-disable-next-line no-null/no-null
                    if (m.refusal === null) {
                        m.refusal = undefined;
                    }
                    // Mistral OpenAI Endpoint expects parsed to be undefined and not null for optional properties
                    // eslint-disable-next-line no-null/no-null
                    if ((m as unknown as { parsed: null | undefined }).parsed === null) {
                        (m as unknown as { parsed: null | undefined }).parsed = undefined;
                    }
                }
            });
        }
        return super.prepareOptions(options);
    };
}

export const OpenAiModelIdentifier = Symbol('OpenAiModelIdentifier');

export type DeveloperMessageSettings = 'user' | 'system' | 'developer' | 'mergeWithFollowingUserMessage' | 'skip';

/** Options for {@link createOpenAiClient}. */
export interface OpenAiClientOptions {
    /** The key to authenticate with. A custom endpoint may need none. */
    readonly apiKey: string | undefined;
    /** Base URL of a custom endpoint; the SDK's own default is used without one. */
    readonly baseURL?: string;
    /** Azure API version. Its presence is what selects the Azure client over the plain one. */
    readonly apiVersion?: string;
    readonly deployment?: string;
    readonly proxyUrl?: string;
    /** Additional HTTP headers sent with every request, e.g. headers required by a gateway in front of the API. */
    readonly headers?: Record<string, string>;
}

/**
 * The single place an OpenAI SDK client is built, so that a chat request and the model discovery
 * reach the provider the same way: through the configured proxy, with a key the SDK accepts, and
 * with the Azure client where an API version says so.
 */
export function createOpenAiClient(options: OpenAiClientOptions): OpenAI {
    // The SDK refuses to be constructed without a key, so an endpoint that needs none still gets one.
    const apiKey = options.apiKey ?? 'no-key';
    const proxyFetch = createProxyFetch(options.proxyUrl);
    return options.apiVersion
        ? new AzureOpenAI({
            apiKey, baseURL: options.baseURL, apiVersion: options.apiVersion, deployment: options.deployment, fetch: proxyFetch, defaultHeaders: options.headers
        })
        : new MistralFixedOpenAI({ apiKey, baseURL: options.baseURL, fetch: proxyFetch, defaultHeaders: options.headers });
}

export interface OpenAiModelParams {
    id: string;
    model: string;
    status: LanguageModelStatus;
    enableStreaming: boolean;
    apiKey: () => string | undefined;
    apiVersion: () => string | undefined;
    supportsStructuredOutput: boolean;
    url: string | undefined;
    deployment: string | undefined;
    developerMessageSettings?: DeveloperMessageSettings;
    maxRetries?: number;
    useResponseApi?: boolean;
    proxy?: string;
    reasoningSupport?: ReasoningSupport;
    maxInputTokens?: number;
    serverTools?: ServerToolDescriptor[];
    serverSideCompactionSupport?: boolean;
    serverSideCompactionEnabledByDefault?: boolean;
    serverSideCompactionTokenThresholdByDefault?: number;
    headers?: Record<string, string>;
    released?: number;
}

export const OpenAiModelParams = Symbol('OpenAiModelParams');

export const OpenAiLanguageModelFactory = Symbol('OpenAiLanguageModelFactory');
export type OpenAiLanguageModelFactory = (params: OpenAiModelParams) => OpenAiModel;

@injectable()
export class OpenAiModel implements LanguageModel {

    id: string;
    model: string;
    status: LanguageModelStatus;
    enableStreaming: boolean;
    apiKey: () => string | undefined;
    apiVersion: () => string | undefined;
    supportsStructuredOutput: boolean;
    url: string | undefined;
    deployment: string | undefined;
    developerMessageSettings: DeveloperMessageSettings;
    maxRetries: number;
    useResponseApi: boolean;
    proxy?: string;
    reasoningSupport?: ReasoningSupport;
    maxInputTokens?: number;
    serverTools?: ServerToolDescriptor[];
    serverSideCompactionSupport: boolean;
    serverSideCompactionEnabledByDefault: boolean;
    serverSideCompactionTokenThresholdByDefault?: number;
    headers?: Record<string, string>;
    released?: number;

    /** Provider identifier, used to key per-provider settings (e.g. server tool selections) and the capabilities UI. */
    readonly vendor = 'openai';

    @inject(OpenAiModelParams)
    protected readonly params: OpenAiModelParams;

    @inject(OpenAiModelUtils)
    protected readonly openAiModelUtils: OpenAiModelUtils;

    @inject(OpenAiResponseApiUtils)
    protected readonly responseApiUtils: OpenAiResponseApiUtils;

    @inject(ChatCompletionStreamingAsyncIteratorFactory)
    protected readonly chatCompletionStreamFactory: ChatCompletionStreamingAsyncIteratorFactory;

    @inject(ILogger) @named('ai-openai:OpenAiModel')
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        const params = this.params;
        this.id = params.id;
        this.model = params.model;
        this.status = params.status;
        this.enableStreaming = params.enableStreaming;
        this.apiKey = params.apiKey;
        this.apiVersion = params.apiVersion;
        this.supportsStructuredOutput = params.supportsStructuredOutput;
        this.url = params.url;
        this.deployment = params.deployment;
        this.developerMessageSettings = params.developerMessageSettings ?? 'developer';
        this.maxRetries = params.maxRetries ?? 3;
        this.useResponseApi = params.useResponseApi ?? false;
        this.proxy = params.proxy;
        this.reasoningSupport = params.reasoningSupport;
        this.maxInputTokens = params.maxInputTokens;
        this.serverTools = params.serverTools;
        this.serverSideCompactionSupport = params.serverSideCompactionSupport ?? false;
        this.serverSideCompactionEnabledByDefault = params.serverSideCompactionEnabledByDefault ?? false;
        this.serverSideCompactionTokenThresholdByDefault = params.serverSideCompactionTokenThresholdByDefault;
        this.headers = params.headers;
        this.released = params.released;
    }

    /**
     * Reasoning-level translation lives in {@link openAiReasoningFor}. On the Responses API, user-configured `reasoning`
     * fields from the request settings (e.g. `summary`) are kept; the selected level still decides `effort`.
     */
    protected getSettings(request: LanguageModelRequest, forResponseApi: boolean = false): Record<string, unknown> {
        const reasoning = openAiReasoningFor(request.reasoning?.level, forResponseApi, !!this.reasoningSupport);
        const ours = reasoning.reasoning;
        const theirs = request.settings?.reasoning;
        if (isObject(ours) && isObject(theirs)) {
            const effort = (ours as { effort?: string }).effort;
            return { ...request.settings, reasoning: { ...ours, ...theirs, ...(effort !== undefined && { effort }) } };
        }
        return { ...request.settings, ...reasoning };
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const openai = this.initializeOpenAi();

        return this.useResponseApi ?
            this.handleResponseApiRequest(openai, request, cancellationToken)
            : this.handleChatCompletionsRequest(openai, request, cancellationToken);
    }

    protected async handleChatCompletionsRequest(openai: OpenAI, request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.getSettings(request);

        if (request.response_format?.type === 'json_schema' && this.supportsStructuredOutput) {
            return this.handleStructuredOutputRequest(openai, request);
        }

        if (this.isNonStreamingModel(this.model) || (typeof settings.stream === 'boolean' && !settings.stream)) {
            return this.handleNonStreamingRequest(openai, request);
        }

        if (this.id.startsWith(`${OPENAI_PROVIDER_ID}/`)) {
            settings['stream_options'] = { include_usage: true };
        }

        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }
        const tools = this.createTools(request);

        if (tools) {
            return {
                stream: this.chatCompletionStreamFactory({
                    openai,
                    model: this.model,
                    request,
                    messages: this.processMessages(request.messages),
                    settings,
                    tools,
                    maxRetries: this.maxRetries,
                    cancellationToken
                })
            };
        }

        const runner = openai.chat.completions.stream({
            model: this.model,
            messages: this.processMessages(request.messages),
            stream: true,
            ...settings
        });
        return { stream: new StreamingAsyncIterator(runner, cancellationToken) };
    }

    protected async handleNonStreamingRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const response = await openai.chat.completions.create({
            model: this.model,
            messages: this.processMessages(request.messages),
            ...settings
        });

        const message = response.choices[0].message;

        return {
            text: message.content ?? '',
            usage: response.usage ? {
                input_tokens: response.usage.prompt_tokens,
                output_tokens: response.usage.completion_tokens,
            } : undefined
        };
    }

    protected isNonStreamingModel(_model: string): boolean {
        return !this.enableStreaming;
    }

    protected async handleStructuredOutputRequest(openai: OpenAI, request: UserRequest): Promise<LanguageModelParsedResponse> {
        const settings = this.getSettings(request);
        // TODO implement tool support for structured output (parse() seems to require different tool format)
        const result = await openai.chat.completions.parse({
            model: this.model,
            messages: this.processMessages(request.messages),
            response_format: request.response_format,
            ...settings
        });
        const message = result.choices[0].message;
        if (message.refusal || message.parsed === undefined) {
            this.logger.error('Error in OpenAI chat completion stream:', JSON.stringify(message));
        }

        return {
            content: message.content ?? '',
            parsed: message.parsed,
            usage: result.usage ? {
                input_tokens: result.usage.prompt_tokens,
                output_tokens: result.usage.completion_tokens,
            } : undefined
        };
    }

    protected createTools(request: LanguageModelRequest): ChatCompletionTool[] | undefined {
        return request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        } as unknown as ChatCompletionTool));
    }

    protected initializeOpenAi(): OpenAI {
        const apiKey = this.apiKey();
        if (!apiKey && !(this.url)) {
            throw new Error('Please provide OPENAI_API_KEY in preferences or via environment variable');
        }

        return createOpenAiClient({
            apiKey,
            baseURL: this.url,
            apiVersion: this.apiVersion(),
            deployment: this.deployment,
            proxyUrl: this.proxy,
            headers: this.headers
        });
    }

    /**
     * Augments the Response API settings with the server-side compaction directive when compaction is enabled for the
     * given request. When disabled, the settings are returned unchanged so the default path is byte-for-byte identical.
     */
    protected applyResponseApiCompaction(settings: Record<string, unknown>, request: LanguageModelRequest): Record<string, unknown> {
        if (resolveServerSideCompaction(this.serverSideCompactionSupport, this.serverSideCompactionEnabledByDefault, request.compaction)) {
            const tokenThreshold = resolveCompactionTokenThreshold(this.serverSideCompactionTokenThresholdByDefault, request.compaction);
            return {
                ...settings,
                context_management: [{
                    type: 'compaction',
                    ...(tokenThreshold !== undefined && { compact_threshold: tokenThreshold })
                }]
            };
        }
        return settings;
    }

    protected async handleResponseApiRequest(openai: OpenAI, request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const settings = this.applyResponseApiCompaction(this.getSettings(request, true), request);
        const isStreamingRequest = this.enableStreaming && !(typeof settings.stream === 'boolean' && !settings.stream);

        try {
            return await this.responseApiUtils.handleRequest(
                openai,
                request,
                settings,
                this.model,
                this.openAiModelUtils,
                this.developerMessageSettings,
                this.id,
                isStreamingRequest,
                cancellationToken
            );
        } catch (error) {
            // Chat Completions cannot execute Response API server tools.
            if (error instanceof Error && !request.serverTools?.length) {
                this.logger.warn(`Response API failed for model ${this.id}, falling back to Chat Completions API:`, error.message);
                return this.handleChatCompletionsRequest(openai, request, cancellationToken);
            }
            throw error;
        }
    }

    protected processMessages(messages: LanguageModelMessage[]): ChatCompletionMessageParam[] {
        return this.openAiModelUtils.processMessages(messages, this.developerMessageSettings, this.model);
    }
}
