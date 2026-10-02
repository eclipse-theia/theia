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
import { CHATGPT_FALLBACK_MODELS, CHATGPT_RESPONSES_BASE_URL } from '../common';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { CHATGPT_CLIENT_VERSION, CHATGPT_ORIGINATOR } from './chatgpt-oauth';

/** Lists the models the endpoint serves to the signed in account. The client version is required. */
const CHATGPT_MODELS_URL = `${CHATGPT_RESPONSES_BASE_URL}/models?client_version=${encodeURIComponent(CHATGPT_CLIENT_VERSION)}`;

/**
 * The models a ChatGPT plan grants, as reported by the endpoint. The listing is not part of OpenAI's documented
 * API, so the result is treated as a hint: whenever it cannot be obtained, {@link CHATGPT_FALLBACK_MODELS} is
 * served instead, which keeps the feature usable while signed out or offline.
 */
@injectable()
export class ChatGptModelCatalog {

    @inject(ChatGptAuthServiceImpl)
    protected readonly authService: ChatGptAuthServiceImpl;

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
        // the account that is signed in now. One retry, because the fallback is an acceptable answer either way.
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
            if (discovered?.length) {
                return discovered;
            }
            // Nothing was learned, so the next call retries instead of serving the fallback for good. A listing
            // that has been replaced in the meantime is left alone.
            if (this.discovery === discovery) {
                this.discovery = undefined;
            }
            break;
        }
        return [...CHATGPT_FALLBACK_MODELS];
    }

    protected async discoverModels(): Promise<string[] | undefined> {
        try {
            const credentials = await this.authService.getCredentials();
            if (!credentials) {
                return undefined;
            }
            const proxyFetch = createProxyFetch(getProxyUrl(CHATGPT_MODELS_URL)) ?? fetch;
            const response = await proxyFetch(CHATGPT_MODELS_URL, {
                headers: {
                    Authorization: `Bearer ${credentials.accessToken}`,
                    'chatgpt-account-id': credentials.accountId,
                    originator: CHATGPT_ORIGINATOR
                }
            });
            if (!response.ok) {
                throw new Error(`The model listing failed with status ${response.status}: ${await response.text()}`);
            }
            return toModelSlugs(await response.json());
        } catch (error) {
            this.logger.warn('Could not list the models of the ChatGPT plan, offering the built-in models instead:', error);
            return undefined;
        }
    }
}

/** Keeps the models that are offered for selection and can actually be requested through the API. */
function toModelSlugs(payload: unknown): string[] {
    const models = (payload as { models?: unknown } | undefined)?.models;
    if (!Array.isArray(models)) {
        return [];
    }
    return models
        .filter((model: { supported_in_api?: unknown, visibility?: unknown }) => model?.supported_in_api === true && model.visibility === 'list')
        .map((model: { slug?: unknown }) => typeof model.slug === 'string' ? model.slug.trim() : '')
        .filter(slug => slug.length > 0);
}
