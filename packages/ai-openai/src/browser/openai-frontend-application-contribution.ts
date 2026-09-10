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
import { ReasoningSupport, resolveCompactionDefault, resolveCompactionTokenThresholdDefault, ServerSideCompactionSetting } from '@theia/ai-core';
import { DiscoveringProviderContribution, ModelDiscoveryMessages } from '@theia/ai-core/lib/browser';
import { DiscoveredModel } from '@theia/ai-core/lib/common';
import { OpenAiLanguageModelsManager, OpenAiModelDescription, OPENAI_PROVIDER_ID } from '../common';
import {
    ALLOW_ENV_API_KEY_PREF, API_KEY_PREF, CUSTOM_ENDPOINTS_PREF, MODEL_OVERRIDES_PREF, SERVER_SIDE_COMPACTION_PREF, SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF,
    USE_RESPONSE_API_PREF
} from '../common/openai-preferences';
import {
    AICorePreferences, PREFERENCE_NAME_MAX_RETRIES, PREFERENCE_NAME_SERVER_SIDE_COMPACTION,
    PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD
} from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceChange } from '@theia/core';

/** Provider node id (matches the `ai-features.openAiOfficial.*` configuration segment). */
const OPENAI_OFFICIAL_PROVIDER_ID = 'openAiOfficial';

@injectable()
export class OpenAiFrontendApplicationContribution extends DiscoveringProviderContribution<OpenAiModelDescription> {

    @inject(OpenAiLanguageModelsManager)
    protected readonly manager: OpenAiLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    protected readonly providerId = OPENAI_OFFICIAL_PROVIDER_ID;
    protected readonly providerLabel = 'OpenAI';
    protected readonly modelOverridesPreference = MODEL_OVERRIDES_PREF;
    protected readonly allowEnvironmentApiKeyPreference = ALLOW_ENV_API_KEY_PREF;

    /** The registered ids carry the `openai/` prefix, while the provider node is `openAiOfficial`. */
    protected override get modelIdPrefix(): string {
        return OPENAI_PROVIDER_ID;
    }

    protected prevCustomModels: Partial<OpenAiModelDescription>[] = [];

    protected get discoveryMessages(): ModelDiscoveryMessages {
        return {
            noCredentials: nls.localize('theia/ai/openai/discovery/noKey', 'No OpenAI API key set. Add a key to discover models.'),
            consentRequired: nls.localize('theia/ai/openai/discovery/consentRequired',
                'An OpenAI API key was found in the environment. Confirm its use to discover models.'),
            consentPrompt: nls.localize('theia/ai/openai/discovery/consentPrompt',
                'An OpenAI API key was found in the environment (OPENAI_API_KEY). Allow Theia to use it to discover and call OpenAI models?'),
            useEnvironmentKey: nls.localize('theia/ai/openai/discovery/useEnvKey', 'Use key'),
            overridden: nls.localize('theia/ai/openai/discovery/overridden',
                'The model list is configured manually. Clear the model overrides to discover the models from the provider again.'),
            cached: error => nls.localize('theia/ai/openai/discovery/cached', 'Showing cached models; last refresh failed: {0}', error)
        };
    }

    protected override initializeProvider(): void {
        this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
        this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));

        const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
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
        } else if (event.preferenceName === CUSTOM_ENDPOINTS_PREF) {
            this.handleCustomModelChanges(this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []));
        } else if (event.preferenceName === USE_RESPONSE_API_PREF ||
            event.preferenceName === SERVER_SIDE_COMPACTION_PREF ||
            event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION ||
            event.preferenceName === SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF ||
            event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD) {
            this.updateDiscoveredModels();
        } else if (event.preferenceName === 'http.proxy') {
            this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
            // A model keeps the proxy it was registered with, so the custom endpoints have to be
            // re-registered as well: discovery only covers the models it registers itself.
            this.updateCustomModels();
            this.discoverAndRegisterModels();
        }
    }

    protected handleCustomModelChanges(newCustomModels: Partial<OpenAiModelDescription>[]): void {
        const oldModels = this.createCustomModelDescriptionsFromPreferences(this.prevCustomModels);
        const newModels = this.createCustomModelDescriptionsFromPreferences(newCustomModels);

        const modelsToRemove = oldModels.filter(model => !newModels.some(newModel => newModel.id === model.id));
        const modelsToAddOrUpdate = newModels.filter(newModel =>
            !oldModels.some(model =>
                model.id === newModel.id &&
                model.model === newModel.model &&
                model.url === newModel.url &&
                model.deployment === newModel.deployment &&
                model.apiKey === newModel.apiKey &&
                model.apiVersion === newModel.apiVersion &&
                model.developerMessageSettings === newModel.developerMessageSettings &&
                model.supportsStructuredOutput === newModel.supportsStructuredOutput &&
                model.enableStreaming === newModel.enableStreaming &&
                model.useResponseApi === newModel.useResponseApi &&
                model.serverSideCompactionEnabledByDefault === newModel.serverSideCompactionEnabledByDefault &&
                model.serverSideCompactionTokenThresholdByDefault === newModel.serverSideCompactionTokenThresholdByDefault &&
                reasoningSupportEquals(model.reasoningSupport, newModel.reasoningSupport)));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => model.id));
        this.manager.createOrUpdateLanguageModels(...modelsToAddOrUpdate);
        this.prevCustomModels = [...newCustomModels];
    }

    protected override updateDiscoveredModels(): void {
        super.updateDiscoveredModels();
        this.updateCustomModels();
    }

    /** Re-applies the model descriptions of the configured custom endpoints. */
    protected updateCustomModels(): void {
        const customModels = this.preferenceService.get<Partial<OpenAiModelDescription>[]>(CUSTOM_ENDPOINTS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...this.createCustomModelDescriptionsFromPreferences(customModels));
    }

    /** Per-model capabilities are resolved by the backend from the model id; see `openai-model-defaults.ts`. */
    protected createModelDescription(model: DiscoveredModel): OpenAiModelDescription {
        const modelId = model.id;
        const id = `${OPENAI_PROVIDER_ID}/${modelId}`;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;
        const useResponseApi = this.preferenceService.get<boolean>(USE_RESPONSE_API_PREF, false);
        const globalCompaction = this.preferenceService.get<boolean>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION, true);
        const compactionOverride = this.preferenceService.get<ServerSideCompactionSetting>(SERVER_SIDE_COMPACTION_PREF, 'default');
        const serverSideCompactionEnabledByDefault = resolveCompactionDefault(globalCompaction, compactionOverride);
        const globalThreshold = this.preferenceService.get<number>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD, undefined);
        const providerThreshold = this.preferenceService.get<number>(SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF, undefined);
        const serverSideCompactionTokenThresholdByDefault = resolveCompactionTokenThresholdDefault(globalThreshold, providerThreshold);
        return {
            id: id,
            model: modelId,
            apiKey: true,
            apiVersion: true,
            maxRetries: maxRetries,
            useResponseApi: useResponseApi,
            serverSideCompactionEnabledByDefault,
            serverSideCompactionTokenThresholdByDefault,
            released: model.released
        };
    }

    protected createCustomModelDescriptionsFromPreferences(
        preferences: Partial<OpenAiModelDescription>[]
    ): OpenAiModelDescription[] {
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
                    deployment: typeof pref.deployment === 'string' && pref.deployment ? pref.deployment : undefined,
                    apiKey: typeof pref.apiKey === 'string' || pref.apiKey === true ? pref.apiKey : undefined,
                    apiVersion: typeof pref.apiVersion === 'string' || pref.apiVersion === true ? pref.apiVersion : undefined,
                    developerMessageSettings: pref.developerMessageSettings,
                    supportsStructuredOutput: pref.supportsStructuredOutput,
                    enableStreaming: pref.enableStreaming,
                    maxRetries: pref.maxRetries ?? maxRetries,
                    useResponseApi: pref.useResponseApi ?? false,
                    reasoningSupport: isReasoningSupport(pref.reasoningSupport) ? pref.reasoningSupport : undefined,
                    serverSideCompactionEnabledByDefault,
                    serverSideCompactionTokenThresholdByDefault
                }
            ];
        }, []);
    }
}

function isReasoningSupport(value: unknown): value is ReasoningSupport {
    return !!value && typeof value === 'object' && Array.isArray((value as ReasoningSupport).supportedLevels);
}

/** Structural equality — preference reads yield fresh objects, so identity comparison would always report a change. */
function reasoningSupportEquals(a: ReasoningSupport | undefined, b: ReasoningSupport | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return a.defaultLevel === b.defaultLevel
        && a.supportedLevels.length === b.supportedLevels.length
        && a.supportedLevels.every((level, index) => level === b.supportedLevels[index]);
}
