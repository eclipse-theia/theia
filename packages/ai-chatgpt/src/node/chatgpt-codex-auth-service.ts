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
import { randomUUID } from 'crypto';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { ChatGptCredentials } from '../common';
import { AccountRegistry, ChatGptAuthServiceImpl, TokenGrant, TokenRequestError, TokenSet } from './chatgpt-auth-service-impl';
import { ChatGptAuthServiceConfig } from './chatgpt-auth-service';
import { AuthorizationCode, AuthorizationOptions } from './chatgpt-oauth';
import * as codex from './chatgpt-codex-oauth';

export const ChatGptCodexAuthServiceConfig = Symbol('ChatGptCodexAuthServiceConfig');

export interface ChatGptCodexAuthServiceConfig extends ChatGptAuthServiceConfig {
    readonly clientId: string;
}

/** Retains the legacy Codex wire protocol while sharing session ownership and serialized persistence. */
@injectable()
export class ChatGptCodexAuthService extends ChatGptAuthServiceImpl {

    @inject(ChatGptCodexAuthServiceConfig)
    protected override readonly config: ChatGptCodexAuthServiceConfig;

    protected override validateConfig(): void {
        if (!this.config.clientId.trim() || !['localhost', '127.0.0.1'].includes(this.config.callbackHost)
            || !Number.isInteger(this.config.callbackPort) || this.config.callbackPort < 1 || this.config.callbackPort > 65535
            || !/^\/[A-Za-z0-9/_-]*$/.test(this.config.callbackPath)) {
            throw new Error('Invalid Codex backend authentication configuration.');
        }
    }

    protected override validateLoginIdentity(): void {
        // Codex has one replaceable account under its fixed client registration, unlike issued OSS clients.
    }

    protected override getHostId(): Promise<string> {
        return Promise.resolve('');
    }

    protected override buildAuthorizationUrl(challenge: string, state: string, _options: AuthorizationOptions): string {
        return codex.buildAuthorizationUrl(challenge, state, this.redirectUri, this.config.clientId);
    }

    protected override parseAuthorizationInput(input: string, state: string): AuthorizationCode {
        return { code: codex.parseAuthorizationInput(input, state, this.config.callbackPath), clientId: this.config.clientId };
    }

    protected override async requestTokens(body: URLSearchParams): Promise<TokenGrant> {
        const requestBody = new URLSearchParams(body);
        requestBody.set('client_id', this.config.clientId);
        requestBody.delete('resource');
        const proxyFetch = createProxyFetch(getProxyUrl(codex.CHATGPT_TOKEN_URL)) ?? fetch;
        const response = await proxyFetch(codex.CHATGPT_TOKEN_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: requestBody,
            redirect: 'error', signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) {
            // Use the shared token-error classification without exposing a response body or token.
            let error: string | undefined;
            try {
                const failure = await response.json() as { error?: unknown };
                error = typeof failure.error === 'string' ? failure.error : undefined;
            } catch { /* Non-JSON error bodies are deliberately discarded. */ }
            throw new TokenRequestError(`The OpenAI token request failed with status ${response.status}.`, error);
        }
        const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
        if (typeof payload.access_token !== 'string' || !payload.access_token.trim()
            || (payload.refresh_token !== undefined && typeof payload.refresh_token !== 'string')) {
            throw new Error('The OpenAI token response did not contain an access token.');
        }
        const identity = codex.decodeChatGptIdentity(payload.access_token);
        const accountId = identity.accountId ?? (body.get('grant_type') === 'refresh_token'
            ? this.registry?.accounts.find(account => account.clientId === this.config.clientId)?.subject : undefined);
        if (!accountId) {
            throw new Error('The ChatGPT account could not be determined from the token. Please try again.');
        }
        const expiresAt = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
            ? Date.now() + payload.expires_in * 1000 : identity.expiresAt ?? Date.now();
        return {
            accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt,
            scope: 'resource.invoke chatgpt.tokens.use.direct',
            identity: { subject: accountId, email: identity.email },
            planType: identity.planType
        };
    }

    protected override inferenceCredentials(clientId: string, tokens: TokenSet): ChatGptCredentials {
        const account = this.registry?.accounts.find(candidate => candidate.clientId === clientId);
        return { ...super.inferenceCredentials(clientId, tokens), accountId: account!.subject };
    }

    protected override revokeTokens(): Promise<void> {
        // The legacy client did not revoke tokens remotely; OSS discovery must never see a Codex token.
        return Promise.resolve();
    }

    protected override async readStoredRegistry(): Promise<string | undefined> {
        const existing = await super.readStoredRegistry();
        if (existing !== undefined) {
            return existing;
        }
        // Import HEAD's single-account credentials once, without altering the OSS registry in the old slot.
        const legacyAccount = this.config.keyStoreAccount.replace(/:codex$/, '');
        const stored = await this.keyStoreService.getPassword(this.config.keyStoreService, legacyAccount);
        const legacy = stored ? this.parseLegacyCredentials(stored) : undefined;
        if (!legacy) {
            return undefined;
        }
        const value = JSON.stringify(legacy);
        await this.enqueueKeyStoreUpdate(() => this.keyStoreService.setPassword(this.config.keyStoreService, this.config.keyStoreAccount, value));
        return value;
    }

    protected parseLegacyCredentials(stored: string): AccountRegistry | undefined {
        try {
            const value = JSON.parse(stored) as {
                version?: unknown; accessToken?: string; refreshToken?: string; accountId?: string; expiresAt?: number; accountLabel?: string; planType?: string
            };
            if (!value || value.version !== undefined || typeof value.accessToken !== 'string' || !value.accessToken.trim()
                || typeof value.accountId !== 'string' || !value.accountId.trim() || typeof value.refreshToken !== 'string'
                || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)
                || (value.accountLabel !== undefined && typeof value.accountLabel !== 'string')
                || (value.planType !== undefined && typeof value.planType !== 'string')) {
                return undefined;
            }
            return {
                version: 3, activeClientId: this.config.clientId,
                accounts: [{
                    clientId: this.config.clientId, subject: value.accountId, accountLabel: value.accountLabel, planType: value.planType,
                    tokens: {
                        accessToken: value.accessToken, refreshToken: value.refreshToken || undefined, expiresAt: value.expiresAt,
                        scope: 'resource.invoke chatgpt.tokens.use.direct', sessionId: randomUUID()
                    }
                }]
            };
        } catch {
            return undefined;
        }
    }
}
