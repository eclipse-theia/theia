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

import { ILogger } from '@theia/core';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { CHATGPT_CODEX_RESPONSES_BASE_URL, CHATGPT_FALLBACK_MODELS, CHATGPT_RESPONSES_BASE_URL } from '../common';
import { CHATGPT_CLIENT_VERSION, CHATGPT_ORIGINATOR } from './chatgpt-codex-oauth';
import { ChatGptBackendAuthService } from './chatgpt-auth-service';

/** Lists the models granted to the selected token-sharing account. */
const CHATGPT_MODELS_URL = `${CHATGPT_RESPONSES_BASE_URL}/models`;

/**
 * Lists subscription models through the selected mode's API. Transient discovery failures offer the built-in models;
 * signed-out accounts and identity-only sessions never offer a fallback.
 */
@injectable()
export class ChatGptModelCatalog {

    @inject(ChatGptBackendAuthService)
    protected readonly authService: ChatGptBackendAuthService;

    @inject(ILogger) @named('ai-chatgpt:ChatGptModelCatalog')
    protected readonly logger: ILogger;

    protected discovery: Promise<string[] | undefined> | undefined;
    /** Incremented whenever the granted models may have changed, so listings started earlier are discarded. */
    protected generation = 0;

    @postConstruct()
    protected init(): void {
        // A different account, or none at all, grants different models.
        this.authService.onAuthStateChanged(() => {
            this.generation++;
            this.discovery = undefined;
        });
    }

    async getAvailableModels(): Promise<string[]> {
        // A sign in or out while the models are being listed invalidates the result, so it is looked up again for
        // the account that is signed in now. One retry, then use a fallback only if an account is still signed in.
        for (let attempt = 0; attempt < 2; attempt++) {
            const generation = this.generation;
            if (!this.discovery) {
                this.discovery = this.discoverModels();
            }
            const discovery = this.discovery;
            const discovered = await discovery;
            if (generation !== this.generation) {
                continue;
            }
            if (discovered !== undefined) {
                if (!discovered.length && this.discovery === discovery) {
                    this.discovery = undefined;
                }
                return discovered;
            }
            // Nothing was learned, so the next call retries instead of serving the fallback for good. A listing
            // that has been replaced in the meantime is left alone.
            if (this.discovery === discovery) {
                this.discovery = undefined;
            }
            break;
        }
        const state = await this.authService.getAuthState();
        return state.isAuthenticated && state.canUseChatGptPlan !== false ? [...CHATGPT_FALLBACK_MODELS] : [];
    }

    protected async discoverModels(): Promise<string[] | undefined> {
        try {
            const state = await this.authService.getAuthState();
            if (!state.isAuthenticated || state.canUseChatGptPlan === false) {
                return [];
            }
            const credentials = await this.authService.getCredentials(state.clientId);
            if (!credentials) {
                return [];
            }
            const codex = credentials.authenticationMode === 'codex';
            if (codex && !credentials.accountId) {
                return [];
            }
            const url = codex ? `${CHATGPT_CODEX_RESPONSES_BASE_URL}/models?client_version=${CHATGPT_CLIENT_VERSION}` : CHATGPT_MODELS_URL;
            const headers: Record<string, string> = { Authorization: `Bearer ${credentials.accessToken}` };
            if (codex) {
                headers['chatgpt-account-id'] = credentials.accountId!;
                headers.originator = CHATGPT_ORIGINATOR;
            }
            const proxyFetch = createProxyFetch(getProxyUrl(url)) ?? fetch;
            const response = await proxyFetch(url, {
                headers,
                redirect: 'error',
                signal: AbortSignal.timeout(30_000)
            });
            if (!response.ok) {
                // Permission and exhausted-budget responses are not evidence that the fallback is available.
                if ([401, 403, 429].includes(response.status)) {
                    return [];
                }
                throw new Error(`The model listing failed with status ${response.status}.`);
            }
            const models = toModelSlugs(await response.json(), codex);
            return models;
        } catch (error) {
            this.logger.warn('Could not list the models of the ChatGPT plan, offering the built-in models instead:', error);
            return undefined;
        }
    }
}

/** Keeps the models that are offered for selection and can actually be requested through the API. */
function toModelSlugs(payload: unknown, codex = false): string[] | undefined {
    const models = (payload as { models?: unknown } | undefined)?.models;
    if (!Array.isArray(models)) {
        return undefined;
    }
    return [...new Set(models
        .filter((model: { visibility?: unknown; supported_in_api?: unknown }) => model && model.visibility === 'list'
            && (!codex || model.supported_in_api === true))
        .map((model: { slug?: unknown }) => typeof model.slug === 'string' ? model.slug.trim() : '')
        .filter(slug => slug.length > 0))];
}
