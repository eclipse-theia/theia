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

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { GoogleLanguageModelsManager, GoogleModelDescription } from '../common';
import { API_KEY_PREF, MODELS_PREF } from './google-preferences';

const GOOGLE_PROVIDER_ID = 'google';

@injectable()
export class GoogleFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(GoogleLanguageModelsManager)
    protected manager: GoogleLanguageModelsManager;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const apiKey = this.preferenceService.get<string>(API_KEY_PREF, undefined);
            this.manager.setApiKey(apiKey);

            const models = this.preferenceService.get<string[]>(MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createGeminiModelDescription(modelId)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === API_KEY_PREF) {
                    this.manager.setApiKey(event.newValue);
                    this.handleKeyChange(event.newValue);
                } else if (event.preferenceName === MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
                }
            });
        });
    }

    /**
     * Called when the API key changes. Updates all Google models on the manager to ensure the new key is used.
     */
    protected handleKeyChange(newApiKey: string | undefined): void {
        if (this.prevModels && this.prevModels.length > 0) {
            this.manager.createOrUpdateLanguageModels(...this.prevModels.map(modelId => this.createGeminiModelDescription(modelId)));
        }
    }

    protected handleModelChanges(newModels: string[]): void {
        const oldModels = new Set(this.prevModels);
        const updatedModels = new Set(newModels);

        const modelsToRemove = [...oldModels].filter(model => !updatedModels.has(model));
        const modelsToAdd = [...updatedModels].filter(model => !oldModels.has(model));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${GOOGLE_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map(modelId => this.createGeminiModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected createGeminiModelDescription(modelId: string): GoogleModelDescription {
        const id = `${GOOGLE_PROVIDER_ID}/${modelId}`;

        const description: GoogleModelDescription = {
            id: id,
            model: modelId,
            apiKey: true,
            enableStreaming: true
        };

        return description;
    }
}
