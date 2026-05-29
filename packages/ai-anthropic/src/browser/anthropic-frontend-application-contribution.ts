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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';
import { API_KEY_PREF, CUSTOM_ENDPOINTS_PREF } from '../common/anthropic-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { PreferenceService } from '@theia/core';

@injectable()
export class AnthropicFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(AnthropicLanguageModelsManager)
    protected manager: AnthropicLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected prevCustomModels: Partial<AnthropicModelDescription>[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const proxyUri = this.preferenceService.get<string>('http.proxy', undefined);
            this.manager.setProxyUrl(proxyUri);

            this.manager.setMaxRetries(this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3);

            // Kicks off discovery of official Anthropic models from `/v1/models`. Uses the persisted snapshot
            // when present; otherwise fetches once. Subsequent refreshes are user-triggered via the command.
            this.discoverModels();

            const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
            this.prevCustomModels = [...customModels];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    const newKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
                    this.manager.setApiKey(newKey);
                    this.refreshCustomModels();
                    // Re-discover when a key is configured so the user gets the model list as soon as one is available.
                    // The discovery itself short-circuits when no key is set, so we can call it unconditionally.
                    if (newKey) {
                        this.discoverModels();
                    }
                } else if (event.preferenceName === 'http.proxy') {
                    this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
                    this.refreshCustomModels();
                } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
                    this.handleCustomModelChanges(this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []));
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.manager.setMaxRetries(this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3);
                    this.refreshCustomModels();
                    // Re-apply the new retry count to the already-registered discovered models.
                    this.discoverModels();
                }
            });
        });
    }

    protected handleCustomModelChanges(newCustomModels: Partial<AnthropicModelDescription>[]): void {
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.apiKey === newModel.apiKey &&
                model.maxRetries === newModel.maxRetries &&
                model.useCaching === newModel.useCaching &&
                model.enableStreaming === newModel.enableStreaming));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    /** Fire-and-forget wrapper that logs unexpected errors instead of leaving them as unhandled rejections. */
    protected discoverModels(): void {
        this.manager.discoverModels().catch(error => {
            console.warn('Anthropic: model discovery failed:', error instanceof Error ? error.message : error);
        });
    }

    protected refreshCustomModels(): void {
        const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
    }

    protected createCustomModelDescriptionsFromPreferences(preferences: Partial<AnthropicModelDescription>[]): AnthropicModelDescription[] {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        return preferences.reduce((acc, pref) => {
            if (!pref.model || !pref.url || typeof pref.model !== 'string' || typeof pref.url !== 'string') {
                return acc;
            }
            return [
                ...acc,
                {
                    id: pref.id && typeof pref.id === 'string' ? pref.id : pref.model,
                    model: pref.model,
                    url: pref.url,
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    enableStreaming: pref.enableStreaming ?? true,
                    useCaching: pref.useCaching ?? true,
                    maxRetries: pref.maxRetries ?? maxRetries
                }
            ];
        }, []);
    }

}
