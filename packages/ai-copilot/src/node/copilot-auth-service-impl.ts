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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, ILogger } from '@theia/core';
import {
    CopilotAuthService,
    CopilotAuthServiceClient,
    CopilotAuthState,
    DeviceCodeResponse
} from '../common/copilot-auth-service';
import { CopilotCliAuthProvider } from './copilot-cli-auth-provider';
import { CopilotCliLocator } from './copilot-cli-locator';
import { CopilotCredentialStore } from './copilot-credential-store';

/**
 * Backend implementation of the GitHub Copilot authentication service.
 *
 * All Copilot requests are served by the official Copilot CLI, which owns its credentials, so this
 * service only drives the sign-in of the CLI and reports its state, see {@link CopilotCliAuthProvider}.
 */
@injectable()
export class CopilotAuthServiceImpl implements CopilotAuthService {

    @inject(CopilotCliAuthProvider)
    protected readonly cliAuthProvider: CopilotCliAuthProvider;

    @inject(CopilotCredentialStore)
    protected readonly credentialStore: CopilotCredentialStore;

    @inject(CopilotCliLocator)
    protected readonly cliLocator: CopilotCliLocator;

    @inject(ILogger) @named('ai-copilot:CopilotAuthServiceImpl')
    protected readonly logger: ILogger;

    protected client: CopilotAuthServiceClient | undefined;
    protected cachedState: CopilotAuthState | undefined;
    protected migrationRequired = false;
    protected legacyCleanup: Promise<void>;

    @postConstruct()
    protected init(): void {
        // The previous integration signed in with an OAuth application of its own and stored a token
        // that is of no use here. Remove it instead of leaving it on the machine of the user.
        this.legacyCleanup = this.credentialStore.deleteLegacy().then(async removed => {
            this.migrationRequired = removed;
            if (removed) {
                this.logger.info('Copilot: discarded the sign-in of the previous integration, a new sign-in is required.');
                this.updateAuthState(await this.computeAuthState());
            }
        }, error => this.logger.warn('Copilot: failed to clean up the previous sign-in:', error));
    }

    protected readonly onAuthStateChangedEmitter = new Emitter<CopilotAuthState>();
    readonly onAuthStateChanged: Event<CopilotAuthState> = this.onAuthStateChangedEmitter.event;

    setClient(client: CopilotAuthServiceClient | undefined): void {
        this.client = client;
    }

    async setExecutablePath(path: string | undefined): Promise<void> {
        this.cliLocator.setConfiguredPath(path);
    }

    async startSignIn(enterpriseUrl?: string): Promise<DeviceCodeResponse> {
        return this.cliAuthProvider.startLogin(enterpriseUrl);
    }

    async waitForSignIn(): Promise<boolean> {
        const success = await this.cliAuthProvider.waitForLogin();
        if (success) {
            this.cachedState = undefined;
            this.updateAuthState(await this.cliAuthProvider.getAuthState());
        }
        return success;
    }

    async cancelSignIn(): Promise<void> {
        await this.cliAuthProvider.cancelLogin();
    }

    async signOut(): Promise<void> {
        await this.cliAuthProvider.signOut();
        this.cachedState = undefined;
        this.updateAuthState(await this.getAuthState());
    }

    async getAuthState(): Promise<CopilotAuthState> {
        // Awaited so that a state requested early cannot be cached without the migration flag, which
        // is the only thing that tells the user why they were signed out. The frontend evaluates it
        // once at startup, so losing it there means losing it altogether.
        await this.legacyCleanup;
        if (!this.cachedState) {
            this.cachedState = await this.computeAuthState();
        }
        return this.cachedState;
    }

    /**
     * The state as it currently is, with the request for a new sign-in attached when the credentials
     * of the previous integration had to be discarded and none have been established since.
     *
     * Does not await the cleanup, so that it can be used from it.
     */
    protected async computeAuthState(): Promise<CopilotAuthState> {
        const state = await this.cliAuthProvider.getAuthState();
        return state.isAuthenticated || !this.migrationRequired ? state : { ...state, migrationRequired: true };
    }

    protected updateAuthState(state: CopilotAuthState): void {
        this.cachedState = state;
        this.onAuthStateChangedEmitter.fire(state);
        this.client?.onAuthStateChanged(state);
    }
}
