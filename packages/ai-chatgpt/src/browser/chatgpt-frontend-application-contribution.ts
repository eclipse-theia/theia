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

import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CHATGPT_PROVIDER_ID, ChatGptAuthService, ChatGptLanguageModelsManager, ChatGptModelDescription, MODELS_PREF } from '../common';

@injectable()
export class ChatGptFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(ChatGptLanguageModelsManager)
    protected manager: ChatGptLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    @inject(ChatGptAuthService)
    protected authService: ChatGptAuthService;

    protected registeredModels: string[] = [];
    /** Serializes the refreshes, so a slow one cannot register models the next one already dropped. */
    protected refreshes: Promise<unknown> = Promise.resolve();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
            this.refreshModels();

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MODELS_PREF) {
                    this.refreshModels();
                } else if (event.preferenceName === 'http.proxy') {
                    this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
                    this.refreshModels();
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.refreshModels();
                }
            });

            // Signing in or out changes the credentials, the availability of the models and which models are granted.
            this.authService.onAuthStateChanged(() => this.refreshModels());
        });
    }

    protected refreshModels(): Promise<void> {
        const refresh = this.refreshes.then(() => this.doRefreshModels(), () => this.doRefreshModels());
        this.refreshes = refresh.catch(() => undefined);
        return refresh;
    }

    protected async doRefreshModels(): Promise<void> {
        const models = await this.resolveModels();
        const removed = this.registeredModels.filter(model => !models.includes(model));
        this.registeredModels = models;
        if (removed.length) {
            this.manager.removeLanguageModels(...removed.map(model => `${CHATGPT_PROVIDER_ID}/${model}`));
        }
        // Registering a model that is already registered updates it, which is what a refresh is after.
        await this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createModelDescription(modelId)));
    }

    /** The configured models, or the ones the ChatGPT plan grants while none are configured. */
    protected resolveModels(): Promise<string[]> {
        const configured = this.preferenceService.get<string[]>(MODELS_PREF, []);
        return configured.length ? Promise.resolve(configured) : this.manager.getAvailableModels();
    }

    /** Per-model capabilities are resolved by the backend from the model id. */
    protected createModelDescription(modelId: string): ChatGptModelDescription {
        return {
            id: `${CHATGPT_PROVIDER_ID}/${modelId}`,
            model: modelId,
            maxRetries: this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3
        };
    }
}
