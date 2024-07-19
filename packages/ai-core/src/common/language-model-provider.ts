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

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';

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

export interface LanguageModelProviderDescription {
    id: string;
    label?: string;
    description?: string;
}

export const LanguageModelProvider = Symbol('LanguageModelProvider');
export interface LanguageModelProvider extends LanguageModelProviderDescription {
    request(request: LanguageModelRequest): Promise<LanguageModelResponse>;
}

export const LanguageModelProviderRegistry = Symbol('LanguageModelProviderRegistry');
export interface LanguageModelProviderRegistry {
    getLanguageModelProviders(): Promise<LanguageModelProvider[]>;
    getLanguageModelProvider(id: string): Promise<LanguageModelProvider | undefined>;
}

@injectable()
export class DefaultLanguageModelProviderRegistryImpl implements LanguageModelProviderRegistry {
    @inject(ContributionProvider) @named(LanguageModelProvider)
    protected readonly languageModelProviderContributions: ContributionProvider<LanguageModelProvider>;

    async getLanguageModelProviders(): Promise<LanguageModelProvider[]> {
        return this.languageModelProviderContributions.getContributions();
    }

    async getLanguageModelProvider(id: string): Promise<LanguageModelProvider | undefined> {
        return (await this.getLanguageModelProviders()).find(provider => provider.id === id);
    }
}
