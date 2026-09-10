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

import { MessageService, nls, PreferenceChange, PreferenceScope, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ApiKeySource, DiscoveredModel, ModelDiscoveryResult } from '../common/model-discovery-status';
import { ModelDiscoveryStatusService } from './model-discovery-status-service';

/** The part of a provider's language model manager that a discovery run drives. */
export interface DiscoveringLanguageModelsManager<T> {
    /** Asks the provider which models it offers; see {@link ModelDiscoveryResult} for the failure cases. */
    fetchAvailableModels(): Promise<ModelDiscoveryResult>;
    /** Where the effective API key comes from, which decides whether a run can proceed. */
    getApiKeySource(): Promise<ApiKeySource>;
    /** Allows or refuses the use of an API key found in the environment. */
    setAllowEnvironmentApiKey(allowed: boolean): void;
    createOrUpdateLanguageModels(...modelDescriptions: T[]): Promise<void>;
    removeLanguageModels(...modelIds: string[]): void;
}

/**
 * What a discovery run tells the user, in the provider's own words. Each message names the provider
 * and its key, so they cannot be shared: a localization key has to be a literal to be extracted.
 */
export interface ModelDiscoveryMessages {
    /** No credential is configured at all, and where to put one. */
    readonly noCredentials: string;
    /** An API key was found in the environment and waits for the user's confirmation. */
    readonly consentRequired: string;
    /** The question that asks for that confirmation, naming the environment variable it found. */
    readonly consentPrompt: string;
    /** Label of the button that grants it. */
    readonly useEnvironmentKey: string;
    /** The model list is configured by hand, so the provider is not asked what it offers. */
    readonly overridden: string;
    /** Cached models are being served because the last refresh failed with `error`. */
    cached(error: string): string;
}

/**
 * The shared half of a provider that discovers its language models: it asks the provider what it
 * offers, registers the answer, unregisters what disappeared, and reports the state of all of that
 * to the {@link ModelDiscoveryStatusService} so the provider's page can show it.
 *
 * A provider brings what only it can know: its id, its manager, the preferences it reads, how a
 * discovered model becomes a model description, and the messages that name it. Everything a provider
 * does beyond discovery (a custom endpoint, a proxy, its own retry settings) stays in the subclass,
 * which hooks into {@link initializeProvider} and {@link handlePreferenceChange}.
 */
@injectable()
export abstract class DiscoveringProviderContribution<T> implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ModelDiscoveryStatusService)
    protected readonly discoveryStatus: ModelDiscoveryStatusService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    /** Provider node id, e.g. `anthropic`. Matches the provider's node in the Models category. */
    protected abstract readonly providerId: string;
    /** Human-readable provider name, e.g. `Anthropic`. */
    protected abstract readonly providerLabel: string;
    protected abstract readonly manager: DiscoveringLanguageModelsManager<T>;
    /** Preference holding an explicit model list that replaces discovery. */
    protected abstract readonly modelOverridesPreference: string;
    /** Preference holding the consent to use an API key found in the environment. */
    protected abstract readonly allowEnvironmentApiKeyPreference: string;

    /** Prefix of this provider's registered model ids. Defaults to {@link providerId}. */
    protected get modelIdPrefix(): string {
        return this.providerId;
    }

    protected abstract get discoveryMessages(): ModelDiscoveryMessages;

    /** Turns a model the provider reported into the description its manager registers. */
    protected abstract createModelDescription(model: DiscoveredModel): T;

    /** The models registered from the last discovery, as the provider reported them. */
    protected discoveredModels: DiscoveredModel[] = [];
    /** Ensures the env-key consent prompt is shown at most once per session. */
    protected envConsentPrompted = false;
    protected discovering: Promise<void> = Promise.resolve();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            // Before any key is read: an environment key stays unused until it has been confirmed.
            this.manager.setAllowEnvironmentApiKey(this.isEnvironmentApiKeyAllowed());
            this.initializeProvider();

            this.discoveryStatus.registerProvider({
                providerId: this.providerId,
                label: this.providerLabel,
                modelIdPrefix: this.modelIdPrefix === this.providerId ? undefined : this.modelIdPrefix,
                refresh: () => this.discoverAndRegisterModels()
            });
            this.discoverAndRegisterModels();

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === this.allowEnvironmentApiKeyPreference || event.preferenceName === this.modelOverridesPreference) {
                    // Withdrawing the consent has to stop the key being used, not just stop discovering.
                    this.manager.setAllowEnvironmentApiKey(this.isEnvironmentApiKeyAllowed());
                    this.discoverAndRegisterModels();
                } else {
                    this.handlePreferenceChange(event);
                }
            });
        });
    }

    /**
     * Hands the provider's own configuration to its manager, before the first discovery run asks it
     * anything. Also the place to register the models and listeners that discovery does not cover.
     */
    protected initializeProvider(): void {
    }

    /** Handles a change to a preference of this provider that is not part of discovery itself. */
    protected handlePreferenceChange(event: PreferenceChange): void {
    }

    /** Fetches what the provider offers and registers it, removing whatever disappeared. */
    protected async discoverAndRegisterModels(): Promise<void> {
        // Runs are queued rather than overlapped: startup, a key change and a manual refresh can all
        // ask within a moment of each other, and two runs in flight would compute what to unregister
        // from the same stale list and leave the registry disagreeing with the provider.
        this.discovering = this.discovering.then(() => this.runDiscovery().catch(error => this.discoveryStatus.reportError(this.providerId, error)));
        return this.discovering;
    }

    protected async runDiscovery(): Promise<void> {
        // A configured model list replaces discovery entirely: the provider is not asked what it
        // offers, so the list is exactly what was configured. This is what pins a catalogue against
        // provider changes, and the way to name models when the list endpoint cannot be reached at all.
        const overrides = this.getModelOverrides();
        if (overrides.length > 0) {
            const configured = overrides.map(id => ({ id }));
            await this.applyDiscoveredModels(configured);
            this.discoveryStatus.updateStatus(this.providerId, {
                state: 'overridden',
                discovered: configured,
                message: this.discoveryMessages.overridden,
                lastFetch: undefined,
                fromCache: false
            });
            return;
        }
        const source = await this.manager.getApiKeySource();
        if (source === 'none') {
            this.removeAllDiscoveredModels();
            this.discoveryStatus.updateStatus(this.providerId, { state: 'no-credentials', message: this.discoveryMessages.noCredentials });
            return;
        }
        // An API key from the environment is only used once the user has confirmed it.
        if (source === 'environment' && !this.isEnvironmentApiKeyAllowed()) {
            this.removeAllDiscoveredModels();
            this.discoveryStatus.updateStatus(this.providerId, { state: 'awaiting-consent', message: this.discoveryMessages.consentRequired });
            this.promptEnvironmentApiKeyConsentOnce();
            return;
        }
        this.discoveryStatus.updateStatus(this.providerId, { state: 'fetching', message: undefined });
        const { models, fromCache, error } = await this.manager.fetchAvailableModels();
        await this.applyDiscoveredModels(models);
        this.discoveryStatus.updateStatus(this.providerId, {
            state: 'ready',
            discovered: models,
            // When served from cache after a failed refresh, keep the models usable but flag staleness.
            message: fromCache && error ? this.discoveryMessages.cached(error) : undefined,
            lastFetch: fromCache ? undefined : Date.now(),
            fromCache
        });
    }

    /** Registers the discovered models and unregisters the ones that are no longer offered. */
    protected async applyDiscoveredModels(models: DiscoveredModel[]): Promise<void> {
        const modelIds = models.map(model => model.id);
        const removed = this.discoveredModels.filter(model => !modelIds.includes(model.id));
        this.manager.removeLanguageModels(...removed.map(model => this.qualifiedModelId(model.id)));
        await this.manager.createOrUpdateLanguageModels(...models.map(model => this.createModelDescription(model)));
        this.discoveredModels = models;
    }

    /** Re-applies the descriptions of the already-discovered models, after a preference that feeds them changed. */
    protected updateDiscoveredModels(): void {
        this.manager.createOrUpdateLanguageModels(...this.discoveredModels.map(model => this.createModelDescription(model)));
    }

    protected removeAllDiscoveredModels(): void {
        if (this.discoveredModels.length > 0) {
            this.manager.removeLanguageModels(...this.discoveredModels.map(model => this.qualifiedModelId(model.id)));
            this.discoveredModels = [];
        }
    }

    protected qualifiedModelId(modelId: string): string {
        return `${this.modelIdPrefix}/${modelId}`;
    }

    protected getModelOverrides(): string[] {
        return this.preferenceService.get<string[]>(this.modelOverridesPreference, []);
    }

    protected isEnvironmentApiKeyAllowed(): boolean {
        return this.preferenceService.get<boolean>(this.allowEnvironmentApiKeyPreference, false);
    }

    /**
     * Asks the user once per session to confirm using an environment-provided API key. Confirming
     * persists {@link allowEnvironmentApiKeyPreference}, which re-triggers discovery.
     */
    protected promptEnvironmentApiKeyConsentOnce(): void {
        if (this.envConsentPrompted) {
            return;
        }
        this.envConsentPrompted = true;
        const useKey = this.discoveryMessages.useEnvironmentKey;
        const ignore = nls.localizeByDefault('Ignore');
        this.messageService.info(this.discoveryMessages.consentPrompt, useKey, ignore).then(choice => {
            if (choice === useKey) {
                this.preferenceService.set(this.allowEnvironmentApiKeyPreference, true, PreferenceScope.User);
            }
        });
    }
}
