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

import { ContributionProvider, ILogger } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export type ChatActor = 'user' | 'ai';

export interface LanguageModelRequestMessage {
    actor: ChatActor;
    type: 'text';
    query: string;
}
export const isChatRequestPart = (obj: unknown): obj is LanguageModelRequestMessage =>
    !!(obj && typeof obj === 'object' &&
        'type' in obj &&
        typeof (obj as { type: unknown }).type === 'string' &&
        (obj as { type: unknown }).type === 'text' &&
        'query' in obj &&
        typeof (obj as { query: unknown }).query === 'string'
    );

export interface LanguageModelRequest {
    messages: LanguageModelRequestMessage[]
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
    index: number;

    /**
     * The ID of the tool call.
     */
    id?: string;

    function?: {
        arguments?: string;
        name?: string;
    };
}

export interface LanguageModelStreamResponse {
    stream: AsyncIterable<LanguageModelStreamResponsePart>;
}
export const isLanguageModelStreamResponse = (obj: unknown): obj is LanguageModelStreamResponse =>
    !!(obj && typeof obj === 'object' && 'stream' in obj);

export type LanguageModelResponse = LanguageModelTextResponse | LanguageModelStreamResponse;

///////////////////////////////////////////
// Language Model Provider
///////////////////////////////////////////

export const LanguageModelProvider = Symbol('LanguageModelProvider');
export type LanguageModelProvider = () => Promise<LanguageModel[]>;

// See also VS Code `ILanguageModelChatMetadata`
export interface LanguageModelMetaData {
    readonly id: string;
    readonly providerId: string;
    readonly name: string;
    readonly vendor: string;
    readonly version: string;
    readonly family: string;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
}

export interface LanguageModel extends LanguageModelMetaData {
    request(request: LanguageModelRequest): Promise<LanguageModelResponse>;
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
    readonly actor: string;
    readonly purpose: string;
}

export const LanguageModelRegistry = Symbol('LanguageModelRegistry');
export interface LanguageModelRegistry {
    getLanguageModels(): Promise<LanguageModel[]>;
    getLanguageModel(id: string): Promise<LanguageModel | undefined>;
    selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]>;
}

@injectable()
export class DefaultLanguageModelRegistryImpl implements LanguageModelRegistry {
    @inject(ILogger)
    protected logger: ILogger;
    @inject(ContributionProvider) @named(LanguageModelProvider)
    protected readonly languageModelContributions: ContributionProvider<LanguageModelProvider>;

    protected languageModels: LanguageModel[] = [];

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
        });
    }

    async getLanguageModels(): Promise<LanguageModel[]> {
        return this.languageModels;
    }

    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        return this.languageModels.find(model => model.id === id);
    }

    async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[]> {
        // TODO check for actor and purpose against settings
        return this.languageModels.filter(model => isModelMatching(request, model));
    }
}

export function isModelMatching(request: LanguageModelSelector, model: LanguageModel): boolean {
    return (!request.identifier || model.id === request.identifier) &&
        (!request.name || model.name === request.name) &&
        (!request.vendor || model.vendor === request.vendor) &&
        (!request.version || model.version === request.version) &&
        (!request.family || model.family === request.family) &&
        (!request.tokens || model.maxInputTokens >= request.tokens);
}

