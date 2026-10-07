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

import {
    AICorePreferences, PREFERENCE_NAME_MAX_RETRIES, PREFERENCE_NAME_SERVER_SIDE_COMPACTION, PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD
} from '@theia/ai-core/lib/common/ai-core-preferences';
import { resolveCompactionDefault, resolveCompactionTokenThresholdDefault, ServerSideCompactionSetting } from '@theia/ai-core';
import { ModelDiscoveryStatusService } from '@theia/ai-core/lib/browser';
import { nls, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CHATGPT_ENABLED_PREF, CHATGPT_PROVIDER_ID, ChatGptAuthService, ChatGptLanguageModelsManager, ChatGptModelDescription, MODELS_PREF,
    SERVER_SIDE_COMPACTION_PREF, SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF
} from '../common';
import { ChatGptCommands } from './chatgpt-command-contribution';

/**
 * The provider node of the AI Configuration view is keyed by the `ai-features.<segment>.*` preference segment,
 * which differs from the `chatgpt/` prefix of the model ids.
 */
export const CHATGPT_DISCOVERY_PROVIDER_ID = 'chatGpt';

@injectable()
export class ChatGptFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(ChatGptLanguageModelsManager)
    protected manager: ChatGptLanguageModelsManager;

    @inject(AICorePreferences)
    protected aiCorePreferences: AICorePreferences;

    @inject(ChatGptAuthService)
    protected authService: ChatGptAuthService;

    @inject(ModelDiscoveryStatusService)
    protected discoveryStatus: ModelDiscoveryStatusService;

    protected registeredModels: string[] = [];
    protected refreshGeneration = 0;
    /** Serializes the refreshes, so a slow one cannot register models the next one already dropped. */
    protected refreshes: Promise<void> = Promise.resolve();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            this.discoveryStatus.registerProvider({
                providerId: CHATGPT_DISCOVERY_PROVIDER_ID,
                label: 'ChatGPT',
                modelIdPrefix: CHATGPT_PROVIDER_ID,
                refresh: () => this.refreshModels()
            });
            this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
            this.refreshModels();

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MODELS_PREF || event.preferenceName === CHATGPT_ENABLED_PREF) {
                    if (!this.isEnabled()) {
                        this.removeRegisteredModels();
                        this.updateDisabledStatus();
                    }
                    this.refreshModels();
                } else if (event.preferenceName === SERVER_SIDE_COMPACTION_PREF ||
                    event.preferenceName === SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF ||
                    event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION ||
                    event.preferenceName === PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD) {
                    this.refreshModels();
                } else if (event.preferenceName === 'http.proxy') {
                    this.manager.setProxyUrl(this.preferenceService.get<string>('http.proxy', undefined));
                    this.refreshModels();
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES) {
                    this.refreshModels();
                }
            });

            // Signing in or out changes the credentials, the availability of the models and which models are granted.
            this.authService.onAuthStateChanged(state => {
                if (!state.isAuthenticated) {
                    this.removeRegisteredModels();
                    if (this.isEnabled()) {
                        this.updateDiscoveryStatus(false, false, []);
                    }
                }
                this.refreshModels();
            });
        });
    }

    protected refreshModels(): Promise<void> {
        const generation = ++this.refreshGeneration;
        this.refreshes = this.refreshes.then(async () => {
            if (generation !== this.refreshGeneration) {
                return;
            }
            try {
                await this.doRefreshModels(generation);
            } catch (error) {
                if (generation === this.refreshGeneration) {
                    this.discoveryStatus.reportError(CHATGPT_DISCOVERY_PROVIDER_ID, error);
                }
            }
        });
        return this.refreshes;
    }

    protected async doRefreshModels(generation: number): Promise<void> {
        if (!this.isEnabled()) {
            this.removeRegisteredModels();
            this.updateDisabledStatus();
            return;
        }
        const configured = this.preferenceService.get<string[]>(MODELS_PREF, []);
        const { isAuthenticated } = await this.authService.getAuthState();
        if (generation !== this.refreshGeneration) {
            return;
        }
        if (!isAuthenticated) {
            this.removeRegisteredModels();
            this.updateDiscoveryStatus(false, false, []);
            return;
        }
        if (!configured.length) {
            this.discoveryStatus.updateStatus(CHATGPT_DISCOVERY_PROVIDER_ID, { state: 'fetching', stateLabel: undefined, message: undefined, action: undefined });
        }
        // The configured models, or the ones the ChatGPT plan grants while none are configured.
        const models = configured.length ? configured : await this.manager.getAvailableModels();
        if (generation !== this.refreshGeneration) {
            return;
        }
        const removed = this.registeredModels.filter(model => !models.includes(model));
        this.registeredModels = models;
        if (removed.length) {
            this.manager.removeLanguageModels(...removed.map(model => `${CHATGPT_PROVIDER_ID}/${model}`));
        }
        // Registering a model that is already registered updates it, which is what a refresh is after.
        try {
            await this.manager.createOrUpdateLanguageModels(...models.map(modelId => this.createModelDescription(modelId)));
        } finally {
            if (generation !== this.refreshGeneration) {
                // An in-flight registration can finish after sign-out removed its models. Remove them again before the next refresh.
                this.manager.removeLanguageModels(...models.map(model => `${CHATGPT_PROVIDER_ID}/${model}`));
                this.registeredModels = [];
            }
        }
        if (generation !== this.refreshGeneration) {
            return;
        }
        this.updateDiscoveryStatus(isAuthenticated, configured.length > 0, models);
    }

    protected isEnabled(): boolean {
        return this.preferenceService.get<boolean>(CHATGPT_ENABLED_PREF, true);
    }

    protected removeRegisteredModels(): void {
        if (this.registeredModels.length) {
            this.manager.removeLanguageModels(...this.registeredModels.map(model => `${CHATGPT_PROVIDER_ID}/${model}`));
            this.registeredModels = [];
        }
    }

    protected updateDisabledStatus(): void {
        this.discoveryStatus.updateStatus(CHATGPT_DISCOVERY_PROVIDER_ID, {
            state: 'idle',
            stateLabel: nls.localizeByDefault('Disabled'),
            message: undefined,
            discovered: [],
            lastFetch: undefined,
            fromCache: undefined,
            action: undefined
        });
    }

    /** Signed-out accounts never register models, even when a list is configured. */
    protected updateDiscoveryStatus(isAuthenticated: boolean, configured: boolean, models: string[]): void {
        const discovered = models.map(id => ({ id }));
        if (!isAuthenticated) {
            this.discoveryStatus.updateStatus(CHATGPT_DISCOVERY_PROVIDER_ID, {
                state: 'no-credentials',
                stateLabel: nls.localizeByDefault('Not signed in'),
                message: nls.localize('theia/ai/chatgpt/discovery/signedOut',
                    'Not signed in with ChatGPT. Sign in to use the models of your ChatGPT plan.'),
                discovered,
                lastFetch: undefined,
                fromCache: undefined,
                action: { label: nls.localize('theia/ai/chatgpt/models/signIn', 'Sign in with ChatGPT'), commandId: ChatGptCommands.SIGN_IN.id }
            });
        } else if (configured) {
            this.discoveryStatus.updateStatus(CHATGPT_DISCOVERY_PROVIDER_ID, {
                state: 'overridden',
                stateLabel: undefined,
                message: nls.localize('theia/ai/chatgpt/discovery/overridden',
                    'The model list is configured manually. Clear it to offer the models your ChatGPT plan grants.'),
                discovered,
                lastFetch: undefined,
                action: undefined
            });
        } else {
            this.discoveryStatus.updateStatus(CHATGPT_DISCOVERY_PROVIDER_ID, {
                state: 'ready',
                stateLabel: undefined,
                message: undefined,
                discovered,
                lastFetch: Date.now(),
                fromCache: false,
                action: undefined
            });
        }
    }

    /** Per-model capabilities are resolved by the backend from the model id. */
    protected createModelDescription(modelId: string): ChatGptModelDescription {
        return {
            id: `${CHATGPT_PROVIDER_ID}/${modelId}`,
            model: modelId,
            maxRetries: this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3,
            serverSideCompactionEnabledByDefault: resolveCompactionDefault(
                this.preferenceService.get<boolean>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION, true),
                this.preferenceService.get<ServerSideCompactionSetting>(SERVER_SIDE_COMPACTION_PREF, 'default')
            ),
            serverSideCompactionTokenThresholdByDefault: resolveCompactionTokenThresholdDefault(
                this.preferenceService.get<number>(PREFERENCE_NAME_SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD, undefined),
                this.preferenceService.get<number>(SERVER_SIDE_COMPACTION_TOKEN_THRESHOLD_PREF, undefined)
            )
        };
    }
}
