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

import { ContributionProvider, ILogger, isFunction, isObject, Event, Emitter, CancellationToken } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export type MessageActor = 'user' | 'ai' | 'system';

export interface LanguageModelRequestMessage {
    actor: MessageActor;
    type: 'text';
    query: string;
}
export const isLanguageModelRequestMessage = (obj: unknown): obj is LanguageModelRequestMessage =>
    !!(obj && typeof obj === 'object' &&
        'type' in obj &&
        typeof (obj as { type: unknown }).type === 'string' &&
        (obj as { type: unknown }).type === 'text' &&
        'query' in obj &&
        typeof (obj as { query: unknown }).query === 'string'
    );
export interface ToolRequest {
    id: string;
    name: string;
    parameters?: { type?: 'object', properties: Record<string, { type: string, [key: string]: unknown }> };
    description?: string;
    handler: (arg_string: string) => Promise<unknown>;
}
export interface LanguageModelRequest {
    messages: LanguageModelRequestMessage[],
    tools?: ToolRequest[];
    response_format?: { type: 'text' } | { type: 'json_object' } | ResponseFormatJsonSchema;
    settings?: { [key: string]: unknown };
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

export interface LanguageModelTextResponse {
    text: string;
}
export const isLanguageModelTextResponse = (obj: unknown): obj is LanguageModelTextResponse =>
    !!(obj && typeof obj === 'object' && 'text' in obj && typeof (obj as { text: unknown }).text === 'string');

export interface LanguageModelStreamResponsePart {
    content?: string | null;
    tool_calls?: ToolCall[];
}

export interface ToolCall {
    id?: string;
    function?: {
        arguments?: string;
        name?: string;
    },
    finished?: boolean;
    result?: string;
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
    request(request: LanguageModelRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse>;
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
