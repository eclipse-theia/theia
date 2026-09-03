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
import { CommandService, nls, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { CopilotAuthService, CopilotLanguageModelsManager, CopilotModelDescription, COPILOT_PROVIDER_ID } from '../common';
import { COPILOT_ENABLED_PREF, COPILOT_ENTERPRISE_URL_PREF, COPILOT_EXECUTABLE_PATH_PREF, COPILOT_MODEL_OVERRIDES_PREF } from '../common/copilot-preferences';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { CopilotCommands } from './copilot-command-contribution';

@injectable()
export class CopilotFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CopilotLanguageModelsManager)
    protected readonly manager: CopilotLanguageModelsManager;

    @inject(AICorePreferences)
    protected readonly aiCorePreferences: AICorePreferences;

    @inject(CopilotAuthService)
    protected readonly authService: CopilotAuthService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected prevModels: string[] = [];
    protected useAutoDiscovery = false;

    onStart(): void {
        this.preferenceService.ready.then(async () => {
            // Before anything reaches for the CLI: the backend cannot read the preferences itself.
            await this.updateExecutablePath();
            if (this.isCopilotEnabled()) {
                const authState = await this.authService.getAuthState();
                if (authState.migrationRequired) {
                    this.notifySignInRequired();
                }
                await this.initializeModels();
            }

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === COPILOT_EXECUTABLE_PATH_PREF) {
                    this.updateExecutablePath().then(() => {
                        if (this.isCopilotEnabled() && this.useAutoDiscovery) {
                            // A CLI that could not be found before may be reachable now.
                            this.discoverAndRegisterModels();
                        }
                    });
                } else if (event.preferenceName === COPILOT_ENABLED_PREF) {
                    if (this.isCopilotEnabled()) {
                        this.initializeModels();
                    } else {
                        this.removeAllCopilotModels();
                    }
                } else if (event.preferenceName === COPILOT_ENTERPRISE_URL_PREF) {
                    // The domain is only read at sign-in time, so a change while signed in has no effect
                    // until the next sign-in. Let the user know instead of silently ignoring it.
                    this.notifyEnterpriseUrlChanged();
                } else if (event.preferenceName === COPILOT_MODEL_OVERRIDES_PREF && this.isCopilotEnabled()) {
                    const newModels = this.preferenceService.get<string[]>(COPILOT_MODEL_OVERRIDES_PREF, []);
                    if (newModels.length > 0) {
                        this.useAutoDiscovery = false;
                        this.handleModelChanges(newModels);
                    } else {
                        this.useAutoDiscovery = true;
                        this.removeAllCopilotModels();
                        this.discoverAndRegisterModels();
                    }
                }
            });

            this.authService.onAuthStateChanged(async state => {
                if (this.isCopilotEnabled() && this.useAutoDiscovery) {
                    if (state.isAuthenticated) {
                        await this.discoverAndRegisterModels();
                    } else {
                        this.removeAllCopilotModels();
                    }
                }
            });

            this.aiCorePreferences.onPreferenceChanged(event => {
                if (event.preferenceName === PREFERENCE_NAME_MAX_RETRIES && this.isCopilotEnabled()) {
                    this.updateAllModels();
                }
            });
        });
    }

    protected isCopilotEnabled(): boolean {
        return this.preferenceService.get<boolean>(COPILOT_ENABLED_PREF, true);
    }

    /**
     * Hands the configured location of the Copilot CLI to the backend, which searches for it when
     * none is configured.
     */
    protected async updateExecutablePath(): Promise<void> {
        const executablePath = this.preferenceService.get<string>(COPILOT_EXECUTABLE_PATH_PREF, '').trim();
        await this.authService.setExecutablePath(executablePath || undefined);
    }

    /**
     * Tells the user why they are signed out after an update, since the sign-in of the previous
     * version cannot be carried over: it belonged to an OAuth application that is no longer used.
     */
    protected async notifySignInRequired(): Promise<void> {
        const signIn = nls.localize('theia/ai/copilot/commands/signIn', 'Sign in to GitHub Copilot');
        const action = await this.messageService.info(
            nls.localize('theia/ai/copilot/signInAgain',
                'GitHub Copilot now signs in through the GitHub Copilot CLI. Your previous sign-in could not be carried over and has been '
                + 'removed, please sign in again to use Copilot models.'),
            signIn
        );
        if (action === signIn) {
            this.commandService.executeCommand(CopilotCommands.SIGN_IN.id);
        }
    }

    /**
     * Tells the user that a changed GitHub Copilot domain only takes effect on the next sign-in, since
     * the domain is read when signing in and not while a session is already established.
     */
    protected async notifyEnterpriseUrlChanged(): Promise<void> {
        const authState = await this.authService.getAuthState();
        if (!authState.isAuthenticated) {
            return;
        }
        const signIn = nls.localize('theia/ai/copilot/commands/signIn', 'Sign in to GitHub Copilot');
        const action = await this.messageService.info(
            nls.localize('theia/ai/copilot/enterpriseUrlChanged',
                'The GitHub Copilot domain changed. Sign in again for it to take effect.'),
            signIn
        );
        if (action === signIn) {
            this.commandService.executeCommand(CopilotCommands.SIGN_IN.id);
        }
    }

    protected async initializeModels(): Promise<void> {
        const configuredModels = this.preferenceService.get<string[]>(COPILOT_MODEL_OVERRIDES_PREF, []);
        if (configuredModels.length > 0) {
            this.useAutoDiscovery = false;
            this.manager.createOrUpdateLanguageModels(
                ...configuredModels.map((modelId: string) => this.createCopilotModelDescription(modelId))
            );
            this.prevModels = [...configuredModels];
        } else {
            this.useAutoDiscovery = true;
            await this.discoverAndRegisterModels();
        }
    }

    protected async discoverAndRegisterModels(): Promise<void> {
        const modelIds = await this.manager.fetchAvailableModelIds();
        if (modelIds.length > 0) {
            const modelsToRemove = this.prevModels.filter(m => !modelIds.includes(m));
            if (modelsToRemove.length > 0) {
                this.manager.removeLanguageModels(
                    ...modelsToRemove.map(model => `${COPILOT_PROVIDER_ID}/${model}`)
                );
            }
            this.manager.createOrUpdateLanguageModels(
                ...modelIds.map((modelId: string) => this.createCopilotModelDescription(modelId))
            );
            this.prevModels = [...modelIds];
        }
    }

    protected removeAllCopilotModels(): void {
        if (this.prevModels.length > 0) {
            this.manager.removeLanguageModels(
                ...this.prevModels.map(model => `${COPILOT_PROVIDER_ID}/${model}`)
            );
            this.prevModels = [];
        }
    }

    protected handleModelChanges(newModels: string[]): void {
        const oldModels = new Set(this.prevModels);
        const updatedModels = new Set(newModels);

        const modelsToRemove = [...oldModels].filter(model => !updatedModels.has(model));
        const modelsToAdd = [...updatedModels].filter(model => !oldModels.has(model));

        this.manager.removeLanguageModels(...modelsToRemove.map(model => `${COPILOT_PROVIDER_ID}/${model}`));
        this.manager.createOrUpdateLanguageModels(...modelsToAdd.map((modelId: string) => this.createCopilotModelDescription(modelId)));
        this.prevModels = [...newModels];
    }

    protected updateAllModels(): void {
        if (this.useAutoDiscovery) {
            this.discoverAndRegisterModels();
            return;
        }
        const models = this.preferenceService.get<string[]>(COPILOT_MODEL_OVERRIDES_PREF, []);
        this.manager.createOrUpdateLanguageModels(...models.map((modelId: string) => this.createCopilotModelDescription(modelId)));
    }

    protected createCopilotModelDescription(modelId: string): CopilotModelDescription {
        const id = `${COPILOT_PROVIDER_ID}/${modelId}`;
        const maxRetries = this.aiCorePreferences.get(PREFERENCE_NAME_MAX_RETRIES) ?? 3;

        return {
            id,
            model: modelId,
            maxRetries
        };
    }
}
