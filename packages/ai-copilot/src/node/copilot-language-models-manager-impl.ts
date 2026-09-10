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

import { DiscoveredModels, LanguageModelRegistry, LanguageModelStatus, ModelDiscoveryResult } from '@theia/ai-core';
import { DisposableCollection, ILogger, nls } from '@theia/core';
import { inject, injectable, named, postConstruct, preDestroy } from '@theia/core/shared/inversify';
import { CopilotLanguageModelsManager, CopilotModelDescription, COPILOT_PROVIDER_ID } from '../common';

/** The id under which Copilot offers its own model selection; always worth showing. */
const COPILOT_AUTO_MODEL_ID = 'auto';

/**
 * The vendors one Copilot model each is nominated for, recognised by the prefix of the model id.
 * Deliberately the three whose models the other providers of this application offer directly: those
 * are the ones a user coming to the chat input expects to switch between. Copilot carries more, and
 * they remain registered and selectable — just not preselected.
 */
const NOMINATED_VENDORS: ReadonlyArray<{ vendor: string; matches: RegExp }> = [
    { vendor: 'anthropic', matches: /^claude/i },
    { vendor: 'openai', matches: /^(gpt|chatgpt|o\d)/i },
    { vendor: 'google', matches: /^gemini/i }
];
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

    async fetchAvailableModels(): Promise<ModelDiscoveryResult> {
        try {
            const modelIds = await this.sdkClientProvider.listModelIds();
            this.logger.info(`Copilot: discovered ${modelIds.length} models [${modelIds.join(', ')}]`);
            await this.setDiscoveryFailure(undefined);
            // The CLI reports nothing but the id: no display name, and no release date to order by.
            const featured = this.selectFeaturedModelIds(modelIds);
            return { models: modelIds.map(id => ({ id, featured: featured.has(id) })), fromCache: false };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn('Copilot: failed to fetch available models via the Copilot CLI:', error);
            await this.setDiscoveryFailure(message);
            return { models: [], fromCache: false, error: message };
        }
    }

    /**
     * Nominates the models the chat input should show without the user asking. Copilot serves models of
     * several vendors under one provider, so ranking them against each other by the numbers in their
     * ids would show several models of whichever vendor counts highest and none of the others. One
     * model of each major vendor is nominated instead — the highest-versioned of each — plus `auto`,
     * which lets Copilot itself choose and is the entry most users want first.
     *
     * Everything else Copilot carries is left to be chosen deliberately: the list is meant to be the
     * handful of models one switches between while chatting, not a survey of the catalogue.
     *
     * Release-pinned ids are left out too: the undated id of the same model is nominated, and pinning
     * a release is the deliberate choice the check on its row makes.
     */
    protected selectFeaturedModelIds(modelIds: string[]): Set<string> {
        const featured = new Set<string>();
        const byVendor = new Map<string, string>();
        for (const id of modelIds) {
            if (id === COPILOT_AUTO_MODEL_ID) {
                featured.add(id);
                continue;
            }
            if (DiscoveredModels.undatedId(id) !== undefined) {
                continue;
            }
            const vendor = this.vendorOf(id);
            if (!vendor) {
                continue;
            }
            const incumbent = byVendor.get(vendor);
            if (!incumbent || DiscoveredModels.compareByVersion(id, incumbent) < 0) {
                byVendor.set(vendor, id);
            }
        }
        byVendor.forEach(id => featured.add(id));
        return featured;
    }

    /**
     * The vendor a Copilot model id belongs to, or `undefined` for a vendor that is not nominated.
     * Matching on the id is all there is — the CLI reports nothing else — and it is deliberately narrow:
     * a model of a vendor this does not name is still registered and still selectable, it is simply not
     * one of the few the chat input starts with.
     */
    protected vendorOf(id: string): string | undefined {
        // Matched against the last segment, so that an id the CLI qualifies with its vendor
        // (`google/gemini-2.5-pro`) is recognised as readily as a bare one.
        const name = id.substring(id.lastIndexOf('/') + 1);
        return NOMINATED_VENDORS.find(candidate => candidate.matches.test(name))?.vendor;
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
