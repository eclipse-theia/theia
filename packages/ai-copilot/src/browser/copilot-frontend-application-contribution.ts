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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CopilotLanguageModelsManager, CopilotModelDescription, COPILOT_PROVIDER_ID } from '../common';
import { COPILOT_MODELS_PREF, COPILOT_ENTERPRISE_URL_PREF } from '../common/copilot-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';

@injectable()
export class CopilotFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CopilotLanguageModelsManager)
    protected readonly manager: CopilotLanguageModelsManager;

    @inject(AICorePreferences)
    protected readonly aiCorePreferences: AICorePreferences;

    protected prevModels: string[] = [];

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const models = this.preferenceService.get<string[]>(COPILOT_MODELS_PREF, []);
            this.manager.createOrUpdateLanguageModels(...models.map((modelId: string) => this.createCopilotModelDescription(modelId)));
            this.prevModels = [...models];

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === COPILOT_MODELS_PREF) {
                    this.handleModelChanges(event.newValue as string[]);
                } else if (event.preferenceName === COPILOT_ENTERPRISE_URL_PREF) {
                    this.manager.refreshModelsStatus();
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.updateAllModels();
                }
            });
        });
    }

    protected handleModelChanges(newModels: string[]): void {
        const oldModels = new Set(this.prevModels);
        const updatedModels = new Set(newModels);

        const modelsToRemove = [...oldModels].filter(model => !updatedModels.has(model));
        const modelsToAdd = [...updatedModels].filter(model => !oldModels.has(model));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${COPILOT_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map((modelId: string) => this.createCopilotModelDescription(modelId)));
        this.prevModels = newModels;
    }

    protected updateAllModels(): void {
        const models = this.preferenceService.get<string[]>(COPILOT_MODELS_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map((modelId: string) => this.createCopilotModelDescription(modelId)));
    }

    protected createCopilotModelDescription(modelId: string): CopilotModelDescription {
        const id = `${COPILOT_PROVIDER_ID}/${modelId}`;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;

        return {
            id,
            model: modelId,
            enableStreaming: true,
            supportsStructuredOutput: true,
            maxRetries
        };
    }
}
