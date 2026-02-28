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

import { LanguageModelRegistry, LanguageModelStatus } from '@theia/ai-core';
import { Disposable, DisposableCollection } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CopilotLanguageModelsManager, CopilotModelDescription, COPILOT_PROVIDER_ID } from '../common';
import { CopilotLanguageModel } from './copilot-language-model';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';

/**
 * Backend implementation of the Copilot language models manager.
 * Manages registration and lifecycle of Copilot language models in the AI language model registry.
 */
@injectable()
export class CopilotLanguageModelsManagerImpl implements CopilotLanguageModelsManager, Disposable {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(CopilotAuthServiceImpl)
    protected readonly authService: CopilotAuthServiceImpl;

    protected enterpriseUrl: string | undefined;
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.authService.onAuthStateChanged(() => {
            this.refreshModelsStatus();
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setEnterpriseUrl(url: string | undefined): void {
        this.enterpriseUrl = url;
    }

    protected async calculateStatus(): Promise<LanguageModelStatus> {
        const authState = await this.authService.getAuthState();
        if (authState.isAuthenticated) {
            return { status: 'ready' };
        }
        return { status: 'unavailable', message: 'Not signed in to GitHub Copilot' };
    }

    async createOrUpdateLanguageModels(...modelDescriptions: CopilotModelDescription[]): Promise<void> {
        const status = await this.calculateStatus();

        for (const modelDescription of modelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);

            if (model) {
                if (!(model instanceof CopilotLanguageModel)) {
                    console.warn(`Copilot: model ${modelDescription.id} is not a Copilot model`);
                    continue;
                }
                await this.languageModelRegistry.patchLanguageModel<CopilotLanguageModel>(modelDescription.id, {
                    model: modelDescription.model,
                    enableStreaming: modelDescription.enableStreaming,
                    supportsStructuredOutput: modelDescription.supportsStructuredOutput,
                    status,
                    maxRetries: modelDescription.maxRetries
                });
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new CopilotLanguageModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        modelDescription.enableStreaming,
                        modelDescription.supportsStructuredOutput,
                        modelDescription.maxRetries,
                        () => this.authService.getAccessToken(),
                        () => this.enterpriseUrl
                    )
                ]);
            }
        }
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    async refreshModelsStatus(): Promise<void> {
        const status = await this.calculateStatus();
        const allModels = await this.languageModelRegistry.getLanguageModels();

        for (const model of allModels) {
            if (model instanceof CopilotLanguageModel && model.id.startsWith(`${COPILOT_PROVIDER_ID}/`)) {
                await this.languageModelRegistry.patchLanguageModel<CopilotLanguageModel>(model.id, {
                    status
                });
            }
        }
    }
}
