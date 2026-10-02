// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { LanguageModel, LanguageModelResponse, LanguageModelStatus, ReasoningSupport, UserRequest } from '@theia/ai-core';
import { createProxyFetch } from '@theia/ai-core/lib/node';
import { CancellationToken, generateUuid } from '@theia/core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-language-model';
import { openAiReasoningFor } from '@theia/ai-openai/lib/node/openai-reasoning';
import { OPENAI_SERVER_TOOLS } from '@theia/ai-openai/lib/node/openai-server-tools';
import { OpenAI } from 'openai';
import type { RunnerOptions } from 'openai/lib/AbstractChatCompletionRunner';
import { CHATGPT_RESPONSES_BASE_URL, ChatGptCredentials } from '../common';
import { CHATGPT_ORIGINATOR } from './chatgpt-oauth';
import { ChatGptResponseApiUtils } from './chatgpt-response-api-utils';

/**
 * A model served by the ChatGPT subscription of the signed in user. The endpoint only implements the streaming
 * Response API, so unlike the plain OpenAI model there is no Chat Completions path and no fallback to one.
 */
export class ChatGptModel implements LanguageModel {

    readonly vendor = 'chatgpt';

    /**
     * The endpoint serves Codex, which offers the same server-side web search, so it is offered for every model
     * rather than derived from the endpoint the way the plain OpenAI model does.
     */
    readonly serverTools = OPENAI_SERVER_TOOLS;

    /** Mirrors the OpenAI model: each tool call counts as a completion, so the limit has to accommodate long tool chains. */
    protected readonly runnerOptions: RunnerOptions = {
        maxChatCompletions: 100
    };

    /**
     * @param id the unique id for this language model. It will be used to identify the model in the UI.
     * @param model the model id as it is used by the ChatGPT endpoint
     * @param credentials returns the credentials of the signed in user, refreshing the access token when needed
     * @param maxRetries the maximum number of retry attempts when a request fails
     */
    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public credentials: () => Promise<ChatGptCredentials | undefined>,
        public responseApiUtils: ChatGptResponseApiUtils,
        public modelUtils: OpenAiModelUtils,
        public maxRetries: number = 3,
        public proxy?: string,
        public reasoningSupport?: ReasoningSupport,
        public maxInputTokens?: number
    ) { }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const openai = await this.initializeOpenAi();
        const settings = {
            ...request.settings,
            ...openAiReasoningFor(request.reasoning?.level, true, !!this.reasoningSupport),
            // The endpoint rejects anything else with 400 'Store must be set to false' / 'Stream must be set to true'.
            store: false,
            stream: true
        };
        return this.responseApiUtils.handleRequest(
            openai,
            request,
            settings,
            this.model,
            this.modelUtils,
            // System messages have to become the top level `instructions`, which only this setting preserves them for.
            'developer',
            this.runnerOptions,
            this.id,
            true,
            cancellationToken
        );
    }

    protected async initializeOpenAi(): Promise<OpenAI> {
        const credentials = await this.credentials();
        if (!credentials) {
            throw new Error('Not signed in with ChatGPT. Use the "ChatGPT: Sign in" command to use your ChatGPT subscription.');
        }
        return new OpenAI({
            // The function form is invoked before each request, including the SDK's own retries, so an access token
            // that expires mid-conversation is refreshed transparently.
            apiKey: async () => (await this.credentials())?.accessToken ?? '',
            baseURL: CHATGPT_RESPONSES_BASE_URL,
            maxRetries: this.maxRetries,
            fetch: createProxyFetch(this.proxy),
            defaultHeaders: {
                'chatgpt-account-id': credentials.accountId,
                'OpenAI-Beta': 'responses=experimental',
                originator: CHATGPT_ORIGINATOR,
                session_id: generateUuid()
            }
        });
    }
}
