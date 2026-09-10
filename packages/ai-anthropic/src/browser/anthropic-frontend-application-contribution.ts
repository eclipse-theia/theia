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

import { inject, injectable } from '@theia/core/shared/inversify';
import { AnthropicLanguageModelsManager, AnthropicModelDescription } from '../common';
import {
    ALLOW_ENV_API_KEY_PREF, API_KEY_PREF, MODEL_OVERRIDES_PREF, CUSTOM_ENDPOINTS_PREF, SERVER_SIDE_COMPACTION_PREF, SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF
} from '../common/anthropic-preferences';
import {
    AICorePreferences, PREFERENCE_NAME_MAX_RETRIES, PREFERENCE_NAME_SERVER_SIDE_COMPACTION,
    PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD
} from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceChange } from '@theia/core';
import { resolveCompactionDefault, resolveCompactionTokenThresholdDefault, ServerSideCompactionSetting } from '@theia/ai-core';
import { DiscoveringProviderContribution, ModelDiscoveryMessages } from '@theia/ai-core/lib/browser';
import { DiscoveredModel } from '@theia/ai-core/lib/common';

const ANTHROPIC_PROVIDER_ID = 'anthropic';

@injectable()
export class AnthropicFrontendApplicationContribution extends DiscoveringProviderContribution<AnthropicModelDescription> {

    @inject(AnthropicLanguageModelsManager)
    protected readonly manager: AnthropicLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected readonly providerId = ANTHROPIC_PROVIDER_ID;
    protected readonly providerLabel = 'Anthropic';
    protected readonly modelOverridesPreference = MODEL_OVERRIDES_PREF;
    protected readonly allowEnvironmentApiKeyPreference = ALLOW_ENV_API_KEY_PREF;

    protected prevCustomModels: Partial<AnthropicModelDescription>[] = [];

    protected get discoveryMessages(): ModelDiscoveryMessages {
        return {
            noCredentials: nls.localize('theia/ai/anthropic/discovery/noKey', 'No Anthropic API key set. Add a key to discover models.'),
            consentRequired: nls.localize('theia/ai/anthropic/discovery/consentRequired',
                'An Anthropic API key was found in the environment. Confirm its use to discover models.'),
            consentPrompt: nls.localize('theia/ai/anthropic/discovery/consentPrompt',
                'An Anthropic API key was found in the environment (ANTHROPIC_API_KEY). Allow Theia to use it to discover and call Anthropic models?'),
            useEnvironmentKey: nls.localize('theia/ai/anthropic/discovery/useEnvKey', 'Use key'),
            overridden: nls.localize('theia/ai/anthropic/discovery/overridden',
                'The model list is configured manually. Clear the model overrides to discover the models from the provider again.'),
            cached: error => nls.localize('theia/ai/anthropic/discovery/cached', 'Showing cached models; last refresh failed: {0}', error)
        };
    }

    protected override initializeProvider(): void {
        this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
        this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));

        const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
        this.prevCustomModels = [...customModels];

        this.aiCorePreferences.onPreferenceChanged(event => {
            if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                this.updateDiscoveredModels();
            }
        });
    }

    protected override handlePreferenceChange(event: PreferenceChange): void {
        if (event.preferenceName === API_KEY_PREF) {
            this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
            this.discoverAndRegisterModels();
        } else if (event.preferenceName === 'http.proxy') {
            this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
            // A model keeps the proxy it was registered with, so the custom endpoints have to be
            // re-registered as well: discovery only covers the models it registers itself.
            this.updateCustomModels();
            this.discoverAndRegisterModels();
        } else if (event.preferenceName === SERVER_SIDE_COMPACTION_PREF ||
            event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION ||
            event.preferenceName === SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF ||
            event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD) {
            this.updateDiscoveredModels();
        } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
            this.handleCustomModelChanges(this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []));
        }
    }

    protected override updateDiscoveredModels(): void {
        super.updateDiscoveredModels();
        this.updateCustomModels();
    }

    /** Re-applies the model descriptions of the configured custom endpoints. */
    protected updateCustomModels(): void {
        const customModels = this.preferenceService.get<Partial<AnthropicModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
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
                model.serverSideCompactionEnabledByDefault === newModel.serverSideCompactionEnabledByDefault &&
                model.serverSideCompactionTokenThresholdByDefault === newModel.serverSideCompactionTokenThresholdByDefault &&
                model.enableStreaming === newModel.enableStreaming));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    /** Per-model details are resolved by the backend from the Anthropic /v1/models endpoint. */
    protected createModelDescription(model: DiscoveredModel): AnthropicModelDescription {
        const id = `${ANTHROPIC_PROVIDER_ID}/${model.id}`;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        const globalCompaction = this.preferenceService.get<boolean>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION, true);
        const compactionOverride = this.preferenceService.get<ServerSideCompactionSetting>(SERVER_SIDE_COMPACTION_PREF, 'default');
        const serverSideCompactionEnabledByDefault = resolveCompactionDefault(globalCompaction, compactionOverride);
        const globalThreshold = this.preferenceService.get<number>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD, undefined);
        const providerThreshold = this.preferenceService.get<number>(SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF, undefined);
        const serverSideCompactionTokenThresholdByDefault = resolveCompactionTokenThresholdDefault(globalThreshold, providerThreshold);

        return {
            id: id,
            model: model.id,
            apiKey: true,
            enableStreaming: true,
            useCaching: true,
            maxRetries: maxRetries,
            serverSideCompactionEnabledByDefault,
            serverSideCompactionTokenThresholdByDefault,
            released: model.released
        };
    }

    protected createCustomModelDescriptionsFromPreferences(preferences: Partial<AnthropicModelDescription>[]): AnthropicModelDescription[] {
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        const globalCompaction = this.preferenceService.get<boolean>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION, true);
        const compactionOverride = this.preferenceService.get<ServerSideCompactionSetting>(SERVER_SIDE_COMPACTION_PREF, 'default');
        const serverSideCompactionEnabledByDefault = resolveCompactionDefault(globalCompaction, compactionOverride);
        const globalThreshold = this.preferenceService.get<number>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD, undefined);
        const providerThreshold = this.preferenceService.get<number>(SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF, undefined);
        const serverSideCompactionTokenThresholdByDefault = resolveCompactionTokenThresholdDefault(globalThreshold, providerThreshold);
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
                    maxRetries: pref.maxRetries ?? maxRetries,
                    serverSideCompactionEnabledByDefault,
                    serverSideCompactionTokenThresholdByDefault
                }
            ];
        }, []);
    }

}
