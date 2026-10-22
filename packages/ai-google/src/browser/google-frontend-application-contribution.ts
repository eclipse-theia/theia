// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { GoogleLanguageModelsManager, GoogleModelDescription } from '../common';
import { ALLOW_ENV_API_KEY_PREF, API_KEY_PREF, MODEL_OVERRIDES_PREF, MAX_RETRIES, RETRY_DELAY_OTHER_ERRORS, RETRY_DELAY_RATE_LIMIT } from '../common/google-preferences';
import { nls, PreferenceChange } from '@theia/core';
import { DiscoveringProviderContribution, ModelDiscoveryMessages } from '@theia/ai-core/lib/browser';
import { DiscoveredModel } from '@theia/ai-core/lib/common';

const GOOGLE_PROVIDER_ID = 'google';

@injectable()
export class GoogleFrontendApplicationContribution extends DiscoveringProviderContribution<GoogleModelDescription> {

    @inject(GoogleLanguageModelsManager)
    protected readonly manager: GoogleLanguageModelsManager;

    protected readonly providerId = GOOGLE_PROVIDER_ID;
    protected readonly providerLabel = 'Google Gemini';
    protected readonly modelOverridesPreference = MODEL_OVERRIDES_PREF;
    protected readonly allowEnvironmentApiKeyPreference = ALLOW_ENV_API_KEY_PREF;

    protected get discoveryMessages(): ModelDiscoveryMessages {
        return {
            noCredentials: nls.localize('theia/ai/google/discovery/noKey', 'No Google AI API key set. Add a key to discover models.'),
            consentRequired: nls.localize('theia/ai/google/discovery/consentRequired',
                'A Google AI API key was found in the environment. Confirm its use to discover models.'),
            consentPrompt: nls.localize('theia/ai/google/discovery/consentPrompt',
                'A Google AI API key was found in the environment (GOOGLE_API_KEY / GEMINI_API_KEY). Allow Theia to use it to discover and call Gemini models?'),
            useEnvironmentKey: nls.localize('theia/ai/google/discovery/useEnvKey', 'Use key'),
            overridden: nls.localize('theia/ai/google/discovery/overridden',
                'The model list is configured manually. Clear the model overrides to discover the models from the provider again.'),
            cached: error => nls.localize('theia/ai/google/discovery/cached', 'Showing cached models; last refresh failed: {0}', error)
        };
    }

    protected override initializeProvider(): void {
        this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
        this.manager.setMaxRetriesOnErrors(this.preferenceService.get<number>(MAX_RETRIES, 3));
        this.manager.setRetryDelayOnRateLimitError(this.preferenceService.get<number>(RETRY_DELAY_RATE_LIMIT, 60));
        this.manager.setRetryDelayOnOtherErrors(this.preferenceService.get<number>(RETRY_DELAY_OTHER_ERRORS, -1));
    }

    protected override handlePreferenceChange(event: PreferenceChange): void {
        if (event.preferenceName === API_KEY_PREF) {
            this.manager.setApiKey(this.preferenceService.get<string>(API_KEY_PREF, undefined));
            this.discoverAndRegisterModels();
        } else if (event.preferenceName === MAX_RETRIES) {
            this.manager.setMaxRetriesOnErrors(this.preferenceService.get<number>(MAX_RETRIES, 3));
        } else if (event.preferenceName === RETRY_DELAY_RATE_LIMIT) {
            this.manager.setRetryDelayOnRateLimitError(this.preferenceService.get<number>(RETRY_DELAY_RATE_LIMIT, 60));
        } else if (event.preferenceName === RETRY_DELAY_OTHER_ERRORS) {
            this.manager.setRetryDelayOnOtherErrors(this.preferenceService.get<number>(RETRY_DELAY_OTHER_ERRORS, -1));
        }
    }

    /** Reasoning capabilities are resolved by the backend from the Gemini /v1beta/models response. */
    protected createModelDescription(model: DiscoveredModel): GoogleModelDescription {
        return {
            id: `${GOOGLE_PROVIDER_ID}/${model.id}`,
            model: model.id,
            apiKey: true,
            enableStreaming: true
        };
    }
}
