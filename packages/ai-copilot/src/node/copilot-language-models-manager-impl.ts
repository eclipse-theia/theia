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
import { DisposableCollection, ILogger, nls } from '@theia/core';
import { inject, injectable, named, postConstruct, preDestroy } from '@theia/core/shared/inversify';
import { CopilotLanguageModelsManager, CopilotModelDescription, COPILOT_PROVIDER_ID } from '../common';
import { CopilotSdkLanguageModel } from './copilot-sdk-language-model';
import { CopilotSdkClientProvider } from './copilot-sdk-client-provider';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';

/**
 * Backend implementation of the Copilot language models manager.
 * Manages registration and lifecycle of Copilot language models in the AI language model registry.
 */
@injectable()
export class CopilotLanguageModelsManagerImpl implements CopilotLanguageModelsManager {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(CopilotAuthServiceImpl)
    protected readonly authService: CopilotAuthServiceImpl;

    @inject(CopilotSdkClientProvider)
    protected readonly sdkClientProvider: CopilotSdkClientProvider;

    @inject(ILogger) @named('ai-copilot:CopilotLanguageModelsManagerImpl')
    protected readonly logger: ILogger;

    protected readonly toDispose = new DisposableCollection();

    /**
     * Why the last model discovery failed, if it did.
     *
     * Being signed in does not imply that requests are accepted: the credentials can lack the Copilot
     * entitlement, be revoked, or belong to a subscription served by a different API host. Reporting
     * the models as ready in those cases claims a working setup that is not there, so the failure is
     * remembered and reflected in the status of the models.
     */
    protected discoveryFailure: string | undefined;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.authService.onAuthStateChanged(() => {
            // The listener cannot be awaited, so the failure is reported here rather than escaping as
            // an unhandled rejection.
            this.refreshModelsStatus().catch(error => this.logger.warn('Copilot: failed to update the status of the models:', error));
        }));
    }

    /**
     * Detaches from the auth service when the container this manager lives in goes away.
     * Unbinding a container runs `@preDestroy` rather than `dispose`, see the client provider.
     */
    @preDestroy()
    protected stop(): void {
        this.toDispose.dispose();
    }

    protected async calculateStatus(): Promise<LanguageModelStatus> {
        const authState = await this.authService.getAuthState();
        if (!authState.isAuthenticated) {
            return { status: 'unavailable', message: nls.localize('theia/ai/copilot/notSignedIn', 'Not signed in to GitHub Copilot') };
        }
        if (this.discoveryFailure) {
            return { status: 'unavailable', message: this.discoveryFailure };
        }
        return { status: 'ready' };
    }

    async createOrUpdateLanguageModels(...modelDescriptions: CopilotModelDescription[]): Promise<void> {
        const status = await this.calculateStatus();

        for (const modelDescription of modelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(modelDescription.id);

            if (model) {
                if (!(model instanceof CopilotSdkLanguageModel)) {
                    this.logger.warn(`Copilot: model ${modelDescription.id} is not a Copilot model`);
                    continue;
                }
                await this.languageModelRegistry.patchLanguageModel<CopilotSdkLanguageModel>(modelDescription.id, {
                    model: modelDescription.model,
                    status,
                    maxRetries: modelDescription.maxRetries
                });
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new CopilotSdkLanguageModel(
                        modelDescription.id,
                        modelDescription.model,
                        status,
                        modelDescription.maxRetries,
                        () => this.sdkClientProvider.getClient(),
                        this.logger
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
            if (model instanceof CopilotSdkLanguageModel && model.id.startsWith(`${COPILOT_PROVIDER_ID}/`)) {
                await this.languageModelRegistry.patchLanguageModel<CopilotSdkLanguageModel>(model.id, {
                    status
                });
            }
        }
    }

    async fetchAvailableModelIds(): Promise<string[]> {
        try {
            const modelIds = await this.sdkClientProvider.listModelIds();
            this.logger.info(`Copilot: discovered ${modelIds.length} models [${modelIds.join(', ')}]`);
            await this.setDiscoveryFailure(undefined);
            return modelIds;
        } catch (error) {
            this.logger.warn('Copilot: failed to fetch available models via the Copilot CLI:', error);
            await this.setDiscoveryFailure(error instanceof Error ? error.message : String(error));
            return [];
        }
    }

    /**
     * Records the outcome of the last model discovery and reflects it in the status of the models.
     */
    protected async setDiscoveryFailure(failure: string | undefined): Promise<void> {
        if (this.discoveryFailure === failure) {
            return;
        }
        this.discoveryFailure = failure;
        await this.refreshModelsStatus();
    }
}
