// *****************************************************************************
// Copyright (C) 2024-2025 EclipseSource GmbH.
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

import { ContributionProvider, ILogger, isFunction, isObject, Event, Emitter, CancellationToken } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export type MessageActor = 'user' | 'ai' | 'system';

export type LanguageModelMessage = TextMessage | ThinkingMessage | ToolUseMessage | ToolResultMessage | ImageMessage;
export namespace LanguageModelMessage {

    export function isTextMessage(obj: LanguageModelMessage): obj is TextMessage {
        return obj.type === 'text';
    }
    export function isThinkingMessage(obj: LanguageModelMessage): obj is ThinkingMessage {
        return obj.type === 'thinking';
    }
    export function isToolUseMessage(obj: LanguageModelMessage): obj is ToolUseMessage {
        return obj.type === 'tool_use';
    }
    export function isToolResultMessage(obj: LanguageModelMessage): obj is ToolResultMessage {
        return obj.type === 'tool_result';
    }
    export function isImageMessage(obj: LanguageModelMessage): obj is ImageMessage {
        return obj.type === 'image';
    }
}
export interface TextMessage {
    actor: MessageActor;
    type: 'text';
    text: string;
}
export interface ThinkingMessage {
    actor: 'ai'
    type: 'thinking';
    thinking: string;
    signature: string;
}

export interface ToolResultMessage {
    actor: 'user';
    tool_use_id: string;
    name: string;
    type: 'tool_result';
    content?: ToolCallResult;
    is_error?: boolean;
}

export interface ToolUseMessage {
    actor: 'ai';
    type: 'tool_use';
    id: string;
    input: unknown;
    name: string;
}
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/svg+xml' | string & {};
export interface UrlImageContent { url: string };
export interface Base64ImageContent {
    base64data: string;
    mimeType: ImageMimeType;
};
export type ImageContent = UrlImageContent | Base64ImageContent;
export namespace ImageContent {
    export const isUrl = (obj: ImageContent): obj is UrlImageContent => 'url' in obj;
    export const isBase64 = (obj: ImageContent): obj is Base64ImageContent => 'base64data' in obj && 'mimeType' in obj;
}
export interface ImageMessage {
    actor: 'ai' | 'user';
    type: 'image';
    image: ImageContent;
}

export const isLanguageModelRequestMessage = (obj: unknown): obj is LanguageModelMessage =>
    !!(obj && typeof obj === 'object' &&
        'type' in obj &&
        typeof (obj as { type: unknown }).type === 'string' &&
        (obj as { type: unknown }).type === 'text' &&
        'query' in obj &&
        typeof (obj as { query: unknown }).query === 'string'
    );

export interface ToolRequestParameterProperty {
    type?: | 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
    anyOf?: ToolRequestParameterProperty[];
    [key: string]: unknown;
}

export type ToolRequestParametersProperties = Record<string, ToolRequestParameterProperty>;
export interface ToolRequestParameters {
    type?: 'object';
    properties: ToolRequestParametersProperties;
    required?: string[];
}
export interface ToolRequest {
    id: string;
    name: string;
    parameters: ToolRequestParameters
    description?: string;
    handler: (arg_string: string, ctx?: unknown) => Promise<ToolCallResult>;
    providerName?: string;
}

export namespace ToolRequest {
    function isToolRequestParameterProperty(obj: unknown): obj is ToolRequestParameterProperty {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        const record = obj as Record<string, unknown>;

        // Check that at least one of "type" or "anyOf" exists
        if (!('type' in record) && !('anyOf' in record)) {
            return false;
        }

        // If an "anyOf" field is present, it must be an array where each item is also a valid property.
        if ('anyOf' in record) {
            if (!Array.isArray(record.anyOf)) {
                return false;
            }
            for (const item of record.anyOf) {
                if (!isToolRequestParameterProperty(item)) {
                    return false;
                }
            }
        }
        if ('type' in record && typeof record.type !== 'string') {
            return false;
        }

        // No further checks required for additional properties.
        return true;
    }
    export function isToolRequestParametersProperties(obj: unknown): obj is ToolRequestParametersProperties {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        return Object.entries(obj).every(([key, value]) => {
            if (typeof key !== 'string') {
                return false;
            }
            return isToolRequestParameterProperty(value);
        });
    }
    export function isToolRequestParameters(obj: unknown): obj is ToolRequestParameters {
        return !!obj && typeof obj === 'object' &&
            (!('type' in obj) || obj.type === 'object') &&
            'properties' in obj && isToolRequestParametersProperties(obj.properties) &&
            (!('required' in obj) || (Array.isArray(obj.required) && obj.required.every(prop => typeof prop === 'string')));
    }
}
export interface LanguageModelRequest {
    messages: LanguageModelMessage[],
    tools?: ToolRequest[];
    response_format?: { type: 'text' } | { type: 'json_object' } | ResponseFormatJsonSchema;
    settings?: { [key: string]: unknown };
    clientSettings?: { keepToolCalls: boolean; keepThinking: boolean }
}
export interface ResponseFormatJsonSchema {
    type: 'json_schema';
    json_schema: {
        name: string,
        description?: string,
        schema?: Record<string, unknown>,
        strict?: boolean | null
    };
}

/**
 * The UserRequest extends the "pure" LanguageModelRequest for cancelling support as well as
 * logging metadata.
 * The additional metadata might also be used for other use cases, for example to query default
 * request settings based on the agent id, merging with the request settings handed over.
 */
export interface UserRequest extends LanguageModelRequest {
    /**
     * Identifier of the Ai/ChatSession
     */
    sessionId: string;
    /**
     * Identifier of the request or overall exchange. Corresponds to request id in Chat sessions
     */
    requestId: string;
    /**
     * Id of a request in case a single exchange consists of multiple requests. In this case the requestId corresponds to the overall exchange.
     */
    subRequestId?: string;
    /**
     * Optional agent identifier in case the request was sent by an agent
     */
    agentId?: string;
    /**
     * Cancellation support
     */
    cancellationToken?: CancellationToken;
}

export interface LanguageModelTextResponse {
    text: string;
}
export const isLanguageModelTextResponse = (obj: unknown): obj is LanguageModelTextResponse =>
    !!(obj && typeof obj === 'object' && 'text' in obj && typeof (obj as { text: unknown }).text === 'string');

export type LanguageModelStreamResponsePart = TextResponsePart | ToolCallResponsePart | ThinkingResponsePart | UsageResponsePart;

export const isLanguageModelStreamResponsePart = (part: unknown): part is LanguageModelStreamResponsePart =>
    isUsageResponsePart(part) || isTextResponsePart(part) || isThinkingResponsePart(part) || isToolCallResponsePart(part);

export interface UsageResponsePart {
    input_tokens: number;
    output_tokens: number;
}
export const isUsageResponsePart = (part: unknown): part is UsageResponsePart =>
    !!(part && typeof part === 'object' &&
        'input_tokens' in part && typeof part.input_tokens === 'number' &&
        'output_tokens' in part && typeof part.output_tokens === 'number');
export interface TextResponsePart {
    content: string;
}
export const isTextResponsePart = (part: unknown): part is TextResponsePart =>
    !!(part && typeof part === 'object' && 'content' in part && typeof part.content === 'string');

export interface ToolCallResponsePart {
    tool_calls: ToolCall[];
}
export const isToolCallResponsePart = (part: unknown): part is ToolCallResponsePart =>
    !!(part && typeof part === 'object' && 'tool_calls' in part && Array.isArray(part.tool_calls));

export interface ThinkingResponsePart {
    thought: string;
    signature: string;
}
export const isThinkingResponsePart = (part: unknown): part is ThinkingResponsePart =>
    !!(part && typeof part === 'object' && 'thought' in part && typeof part.thought === 'string');

export interface ToolCallTextResult { type: 'text', text: string; };
export interface ToolCallImageResult extends Base64ImageContent { type: 'image' };
export interface ToolCallAudioResult { type: 'audio', data: string; mimeType: string };
export interface ToolCallErrorResult { type: 'error', data: string; };
export type ToolCallContentResult = ToolCallTextResult | ToolCallImageResult | ToolCallAudioResult | ToolCallErrorResult;
export interface ToolCallContent {
    content: ToolCallContentResult[];
}
export type ToolCallResult = undefined | object | string | ToolCallContent;
export interface ToolCall {
    id?: string;
    function?: {
        arguments?: string;
        name?: string;
    },
    finished?: boolean;
    result?: ToolCallResult;
}

export interface LanguageModelStreamResponse {
    stream: AsyncIterable<LanguageModelStreamResponsePart>;
}
export const isLanguageModelStreamResponse = (obj: unknown): obj is LanguageModelStreamResponse =>
    !!(obj && typeof obj === 'object' && 'stream' in obj);

export interface LanguageModelParsedResponse {
    parsed: unknown;
    content: string;
}
export const isLanguageModelParsedResponse = (obj: unknown): obj is LanguageModelParsedResponse =>
    !!(obj && typeof obj === 'object' && 'parsed' in obj && 'content' in obj);

export type LanguageModelResponse = LanguageModelTextResponse | LanguageModelStreamResponse | LanguageModelParsedResponse;

///////////////////////////////////////////
// Language Model Provider
///////////////////////////////////////////

export const LanguageModelProvider = Symbol('LanguageModelProvider');
export type LanguageModelProvider = () => Promise<LanguageModel[]>;

// See also VS Code `ILanguageModelChatMetadata`
export interface LanguageModelMetaData {
    readonly id: string;
    readonly name?: string;
    readonly vendor?: string;
    readonly version?: string;
    readonly family?: string;
    readonly maxInputTokens?: number;
    readonly maxOutputTokens?: number;
}

export namespace LanguageModelMetaData {
    export function is(arg: unknown): arg is LanguageModelMetaData {
        return isObject(arg) && 'id' in arg;
    }
}

export interface LanguageModel extends LanguageModelMetaData {
    request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse>;
}

export namespace LanguageModel {
    export function is(arg: unknown): arg is LanguageModel {
        return isObject(arg) && 'id' in arg && isFunction(arg.request);
    }
}

// See also VS Code `ILanguageModelChatSelector`
interface VsCodeLanguageModelSelector {
    readonly identifier?: string;
    readonly name?: string;
    readonly vendor?: string;
    readonly version?: string;
    readonly family?: string;
    readonly tokens?: number;
}

export interface LanguageModelSelector extends VsCodeLanguageModelSelector {
    readonly agent: string;
    readonly purpose: string;
}

export type LanguageModelRequirement = Omit<LanguageModelSelector, 'agent'>;

export const LanguageModelRegistry = Symbol('LanguageModelRegistry');
export interface LanguageModelRegistry {
    onChange: Event<{ models: LanguageModel[] }>;
    addLanguageModels(models: LanguageModel[]): void;
    getLanguageModels(): Promise<LanguageModel[]>;
    getLanguageModel(id: string): Promise<LanguageModel | undefined>;
    removeLanguageModels(id: string[]): void;
    selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined>;
    selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]>;
}

@injectable()
export class DefaultLanguageModelRegistryImpl implements LanguageModelRegistry {
    @inject(ILogger)
    protected logger: ILogger;
    @inject(ContributionProvider) @named(LanguageModelProvider)
    protected readonly languageModelContributions: ContributionProvider<LanguageModelProvider>;

    protected languageModels: LanguageModel[] = [];

    protected markInitialized: () => void;
    protected initialized: Promise<void> = new Promise(resolve => { this.markInitialized = resolve; });

    protected changeEmitter = new Emitter<{ models: LanguageModel[] }>();
    onChange = this.changeEmitter.event;

    @postConstruct()
    protected init(): void {
        const contributions = this.languageModelContributions.getContributions();
        const promises = contributions.map(provider => provider());
        Promise.allSettled(promises).then(results => {
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    this.languageModels.push(...result.value);
                } else {
                    this.logger.error('Failed to add some language models:', result.reason);
                }
            }
            this.markInitialized();
        });
    }

    addLanguageModels(models: LanguageModel[]): void {
        models.forEach(model => {
            if (this.languageModels.find(lm => lm.id === model.id)) {
                console.warn(`Tried to add already existing language model with id ${model.id}. The new model will be ignored.`);
                return;
            }
            this.languageModels.push(model);
            this.changeEmitter.fire({ models: this.languageModels });
        });
    }

    async getLanguageModels(): Promise<LanguageModel[]> {
        await this.initialized;
        return this.languageModels;
    }

    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        await this.initialized;
        return this.languageModels.find(model => model.id === id);
    }

    removeLanguageModels(ids: string[]): void {
        ids.forEach(id => {
            const index = this.languageModels.findIndex(model => model.id === id);
            if (index !== -1) {
                this.languageModels.splice(index, 1);
                this.changeEmitter.fire({ models: this.languageModels });
            } else {
                console.warn(`Language model with id ${id} was requested to be removed, however it does not exist`);
            }
        });
    }

    async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]> {
        await this.initialized;
        // TODO check for actor and purpose against settings
        return this.languageModels.filter(model => isModelMatching(request, model));
    }

    async selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined> {
        return (await this.selectLanguageModels(request))[0];
    }
}

export function isModelMatching(request: LanguageModelSelector, model: LanguageModel): boolean {
    return (!request.identifier || model.id === request.identifier) &&
        (!request.name || model.name === request.name) &&
        (!request.vendor || model.vendor === request.vendor) &&
        (!request.version || model.version === request.version) &&
        (!request.family || model.family === request.family);
}
