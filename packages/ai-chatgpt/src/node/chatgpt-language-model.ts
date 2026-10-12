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

import {
    LanguageModel, LanguageModelResponse, LanguageModelStatus, ReasoningSupport, UserRequest
} from '@theia/ai-core';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { CancellationToken } from '@theia/core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-model-utils';
import { applyResponseApiCompaction, getOpenAiRequestSettings } from '@theia/ai-openai/lib/node/openai-request-settings';
import { OPENAI_SERVER_TOOLS } from '@theia/ai-openai/lib/node/openai-server-tools';
import { OpenAI } from 'openai';
import { CHATGPT_CODEX_RESPONSES_BASE_URL, CHATGPT_RESPONSES_BASE_URL, ChatGptCredentials } from '../common';
import { CHATGPT_ORIGINATOR } from './chatgpt-codex-oauth';
import { ChatGptResponseApiUtils } from './chatgpt-response-api-utils';

/**
 * A subscription model served through the selected Codex or OSS Responses endpoint with its account's OAuth
 * access token; there is no Chat Completions fallback or API-key authentication.
 */
export class ChatGptModel implements LanguageModel {

    readonly vendor = 'chatgpt';
    readonly serverSideCompactionSupport = true;

    /** Token sharing supports server-side web search for the granted Codex models. */
    readonly serverTools = OPENAI_SERVER_TOOLS;

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
        public credentials: (clientId?: string, sessionId?: string) => Promise<ChatGptCredentials | undefined>,
        public responseApiUtils: ChatGptResponseApiUtils,
        public modelUtils: OpenAiModelUtils,
        public maxRetries: number = 3,
        public proxy?: string,
        public reasoningSupport?: ReasoningSupport,
        public maxInputTokens?: number,
        public serverSideCompactionEnabledByDefault: boolean = true,
        public serverSideCompactionTokenThresholdByDefault?: number
    ) { }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const openai = await this.initializeOpenAi(request);
        const settings = {
            ...applyResponseApiCompaction(getOpenAiRequestSettings(request, true, !!this.reasoningSupport), request, this),
            // Keep subscription conversations stateless and use the existing streaming UI.
            store: false,
            stream: true
        };
        const mode = openai.baseURL === CHATGPT_CODEX_RESPONSES_BASE_URL ? 'codex' : 'oss';
        return this.responseApiUtils.forAuthenticationMode(mode).handleRequest(
            openai,
            request,
            settings,
            this.model,
            this.modelUtils,
            // Preserve system messages as the top-level instructions.
            'developer',
            this.id,
            true,
            cancellationToken
        );
    }

    protected async initializeOpenAi(request: UserRequest): Promise<OpenAI> {
        const credentials = await this.credentials();
        if (!credentials) {
            throw new Error('Not signed in with ChatGPT. Use the "ChatGPT: Sign in" command to use your ChatGPT subscription.');
        }
        const getCredentials = async (): Promise<ChatGptCredentials> => {
            const current = await this.credentials(credentials.clientId, credentials.sessionId);
            if (!current || current.clientId !== credentials.clientId || current.sessionId !== credentials.sessionId
                || current.authenticationMode !== credentials.authenticationMode || current.accountId !== credentials.accountId) {
                throw new Error('The ChatGPT account changed or disconnected. Please send the request again.');
            }
            return current;
        };
        const codex = credentials.authenticationMode === 'codex';
        if (codex && !credentials.accountId) {
            throw new Error('The Codex session has no ChatGPT account ID. Please sign in again.');
        }
        const baseURL = codex ? CHATGPT_CODEX_RESPONSES_BASE_URL : CHATGPT_RESPONSES_BASE_URL;
        const proxyFetch = createProxyFetch(getProxyUrl(baseURL, this.proxy)) ?? fetch;
        return new OpenAI({
            apiKey: async () => (await getCredentials()).accessToken,
            baseURL,
            maxRetries: this.maxRetries,
            defaultHeaders: {
                ...(codex ? {
                    'chatgpt-account-id': credentials.accountId,
                    'OpenAI-Beta': 'responses=experimental',
                    originator: CHATGPT_ORIGINATOR,
                    session_id: request.parentSessionId ?? request.sessionId
                } : {}),
                'session-id': request.parentSessionId ?? request.sessionId,
                'thread-id': request.sessionId,
                'x-client-request-id': request.subRequestId ?? request.requestId
            },
            fetch: async (input, init) => {
                // Resolve the selected session's OAuth bearer immediately before sending, including SDK retries.
                const current = await getCredentials();
                const headers = new Headers(init?.headers);
                headers.set('Authorization', `Bearer ${current.accessToken}`);
                return proxyFetch(input, { ...init, headers });
            }
        });
    }
}
