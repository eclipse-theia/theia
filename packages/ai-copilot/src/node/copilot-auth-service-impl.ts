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
import { Emitter, Event } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import {
    CopilotAuthService,
    CopilotAuthServiceClient,
    CopilotAuthState,
    DeviceCodeResponse
} from '../common/copilot-auth-service';

const COPILOT_CLIENT_ID = 'Iv23ctNZvWb5IGBKdyPY';
const COPILOT_SCOPE = 'read:user';
const COPILOT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const KEYSTORE_SERVICE = 'theia-copilot-auth';
const KEYSTORE_ACCOUNT = 'github-copilot';
const USER_AGENT = 'Theia-Copilot/1.0.0';

/**
 * Maximum number of polling attempts for token retrieval.
 * With a default 5-second interval, this allows approximately 5 minutes of polling.
 */
const MAX_POLLING_ATTEMPTS = 60;

interface StoredCredentials {
    accessToken: string;
    accountLabel?: string;
    enterpriseUrl?: string;
}

/**
 * Backend implementation of the GitHub Copilot OAuth Device Flow authentication service.
 * Handles device code generation, token polling, and credential storage.
 */
@injectable()
export class CopilotAuthServiceImpl implements CopilotAuthService {

    @inject(KeyStoreService)
    protected readonly keyStoreService: KeyStoreService;

    protected client: CopilotAuthServiceClient | undefined;
    protected cachedState: CopilotAuthState | undefined;

    protected readonly onAuthStateChangedEmitter = new Emitter<CopilotAuthState>();
    readonly onAuthStateChanged: Event<CopilotAuthState> = this.onAuthStateChangedEmitter.event;

    setClient(client: CopilotAuthServiceClient | undefined): void {
        this.client = client;
    }

    protected getOAuthEndpoints(enterpriseUrl?: string): { deviceCodeUrl: string; accessTokenUrl: string } {
        if (enterpriseUrl) {
            const domain = enterpriseUrl
                .replace(/^https?:\/\//, '')
                .replace(/\/$/, '');
            return {
                deviceCodeUrl: `https://${domain}/login/device/code`,
                accessTokenUrl: `https://${domain}/login/oauth/access_token`
            };
        }
        return {
            deviceCodeUrl: 'https://github.com/login/device/code',
            accessTokenUrl: 'https://github.com/login/oauth/access_token'
        };
    }

    async initiateDeviceFlow(enterpriseUrl?: string): Promise<DeviceCodeResponse> {
        const endpoints = this.getOAuthEndpoints(enterpriseUrl);

        const response = await fetch(endpoints.deviceCodeUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT
            },
            body: JSON.stringify({
                client_id: COPILOT_CLIENT_ID,
                scope: COPILOT_SCOPE
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to initiate device authorization: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as DeviceCodeResponse;
        return data;
    }

    async pollForToken(deviceCode: string, interval: number, enterpriseUrl?: string): Promise<boolean> {
        const endpoints = this.getOAuthEndpoints(enterpriseUrl);
        let attempts = 0;

        while (attempts < MAX_POLLING_ATTEMPTS) {
            await this.delay(interval * 1000);
            attempts++;

            const response = await fetch(endpoints.accessTokenUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT
                },
                body: JSON.stringify({
                    client_id: COPILOT_CLIENT_ID,
                    device_code: deviceCode,
                    grant_type: COPILOT_GRANT_TYPE
                })
            });

            if (!response.ok) {
                console.error(`Token request failed: ${response.status}`);
                continue;
            }

            const data = await response.json() as {
                access_token?: string;
                error?: string;
                error_description?: string;
            };

            if (data.access_token) {
                // Get user info for account label
                const accountLabel = await this.fetchAccountLabel(data.access_token, enterpriseUrl);

                // Store credentials
                const credentials: StoredCredentials = {
                    accessToken: data.access_token,
                    accountLabel,
                    enterpriseUrl
                };

                await this.keyStoreService.setPassword(
                    KEYSTORE_SERVICE,
                    KEYSTORE_ACCOUNT,
                    JSON.stringify(credentials)
                );

                // Update cached state and notify
                const newState: CopilotAuthState = {
                    isAuthenticated: true,
                    accountLabel,
                    enterpriseUrl
                };
                this.updateAuthState(newState);

                return true;
            }

            if (data.error === 'authorization_pending') {
                // User hasn't authorized yet, continue polling
                continue;
            }

            if (data.error === 'slow_down') {
                // Increase polling interval
                interval += 5;
                continue;
            }

            if (data.error === 'expired_token' || data.error === 'access_denied') {
                console.error(`Authorization failed: ${data.error} - ${data.error_description}`);
                return false;
            }

            if (data.error) {
                console.error(`Unexpected error: ${data.error} - ${data.error_description}`);
                return false;
            }
        }

        return false;
    }

    protected async fetchAccountLabel(accessToken: string, enterpriseUrl?: string): Promise<string | undefined> {
        try {
            const apiBaseUrl = enterpriseUrl
                ? `https://${enterpriseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/v3`
                : 'https://api.github.com';

            const response = await fetch(`${apiBaseUrl}/user`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'User-Agent': USER_AGENT,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const userData = await response.json() as { login?: string };
                return userData.login;
            }
        } catch (error) {
            console.warn('Failed to fetch GitHub user info:', error);
        }
        return undefined;
    }

    async getAuthState(): Promise<CopilotAuthState> {
        if (this.cachedState) {
            return this.cachedState;
        }

        try {
            const stored = await this.keyStoreService.getPassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT);
            if (stored) {
                const credentials: StoredCredentials = JSON.parse(stored);
                this.cachedState = {
                    isAuthenticated: true,
                    accountLabel: credentials.accountLabel,
                    enterpriseUrl: credentials.enterpriseUrl
                };
                return this.cachedState;
            }
        } catch (error) {
            console.warn('Failed to retrieve Copilot credentials:', error);
        }

        this.cachedState = { isAuthenticated: false };
        return this.cachedState;
    }

    async getAccessToken(): Promise<string | undefined> {
        try {
            const stored = await this.keyStoreService.getPassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT);
            if (stored) {
                const credentials: StoredCredentials = JSON.parse(stored);
                return credentials.accessToken;
            }
        } catch (error) {
            console.warn('Failed to retrieve Copilot access token:', error);
        }
        return undefined;
    }

    async signOut(): Promise<void> {
        try {
            await this.keyStoreService.deletePassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT);
        } catch (error) {
            console.warn('Failed to delete Copilot credentials:', error);
        }

        const newState: CopilotAuthState = { isAuthenticated: false };
        this.updateAuthState(newState);
    }

    protected updateAuthState(state: CopilotAuthState): void {
        this.cachedState = state;
        this.onAuthStateChangedEmitter.fire(state);
        this.client?.onAuthStateChanged(state);
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
