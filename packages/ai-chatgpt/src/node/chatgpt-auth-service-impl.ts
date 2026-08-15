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

import * as http from 'http';
import { Disposable, Emitter, Event, ILogger } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import {
    ChatGptAuthService,
    ChatGptAuthServiceClient,
    ChatGptAuthState,
    ChatGptCredentials,
    ChatGptLoginSession
} from '../common';
import {
    buildAuthorizationUrl,
    createLoginState,
    createPkcePair,
    decodeChatGptIdentity,
    parseAuthorizationInput,
    CHATGPT_CALLBACK_HOST,
    CHATGPT_CALLBACK_PATH,
    CHATGPT_CALLBACK_PORT,
    CHATGPT_CLIENT_ID,
    CHATGPT_REDIRECT_URI,
    CHATGPT_TOKEN_URL
} from './chatgpt-oauth';

const KEYSTORE_SERVICE = 'theia-chatgpt';
const KEYSTORE_ACCOUNT = 'default';
/** A login attempt is abandoned when the user does not complete it within this time. */
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
/** Access tokens are refreshed this long before they actually expire. */
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
/**
 * OAuth error codes with which the token endpoint reports a refresh token that can never be used again. Besides
 * the `invalid_grant` of RFC 6749 section 5.2, OpenAI answers with codes of its own naming the actual reason.
 */
const SPENT_REFRESH_TOKEN_ERRORS = new Set([
    'invalid_grant',
    'refresh_token_expired',
    'refresh_token_reused',
    'refresh_token_invalidated'
]);

interface StoredCredentials {
    accessToken: string;
    refreshToken: string;
    /** Expiration of the access token in epoch milliseconds. */
    expiresAt: number;
    /** The ChatGPT account the endpoint attributes the requests to. */
    accountId: string;
    accountLabel?: string;
    planType?: string;
}

/** The parts of a token response that make up a session. The account is only conveyed by tokens that carry the claim. */
interface TokenGrant extends Omit<StoredCredentials, 'accountId'> {
    accountId?: string;
}

interface PendingLogin {
    verifier: string;
    state: string;
    result: Deferred<boolean>;
    settled: boolean;
    server?: http.Server;
    timeout?: NodeJS.Timeout;
}

class TokenRequestError extends Error {
    /** @param oauthError the `error` code of an OAuth 2.0 error response (RFC 6749 section 5.2), if the endpoint sent one. */
    constructor(message: string, readonly oauthError?: string) {
        super(message);
    }
}

/**
 * Backend implementation of the "Sign in with ChatGPT" OAuth flow. The browser is sent to the OpenAI authorization
 * page and returns the authorization code to a loopback listener. If that listener is not reachable, e.g. because
 * the backend does not run on the user's machine, the code can be handed over manually instead.
 */
@injectable()
export class ChatGptAuthServiceImpl implements ChatGptAuthService {

    @inject(KeyStoreService)
    protected readonly keyStoreService: KeyStoreService;

    @inject(ILogger) @named('ai-chatgpt:ChatGptAuthServiceImpl')
    protected readonly logger: ILogger;

    protected readonly clients = new Set<ChatGptAuthServiceClient>();
    protected pendingLogin: PendingLogin | undefined;
    protected credentials: StoredCredentials | undefined;
    protected credentialsLoaded = false;
    protected credentialsLoading: Promise<StoredCredentials | undefined> | undefined;
    protected refreshInProgress: Promise<ChatGptCredentials | undefined> | undefined;
    /** Incremented whenever the credentials are invalidated, so results of requests started before that are discarded. */
    protected credentialsGeneration = 0;
    /** Serializes the key store updates, so a slow update cannot be applied on top of a later one. */
    protected keyStoreUpdates: Promise<unknown> = Promise.resolve();

    protected readonly onAuthStateChangedEmitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChanged: Event<ChatGptAuthState> = this.onAuthStateChangedEmitter.event;

    /**
     * Registers the client of a frontend connection. The credentials are shared by all frontends of this backend,
     * hence this is not part of the service interface.
     */
    addClient(client: ChatGptAuthServiceClient): Disposable {
        this.clients.add(client);
        return Disposable.create(() => this.clients.delete(client));
    }

    async startLogin(): Promise<ChatGptLoginSession> {
        await this.cancelLogin();
        const { verifier, challenge } = createPkcePair();
        const state = createLoginState();
        const pending: PendingLogin = { verifier, state, result: new Deferred<boolean>(), settled: false };
        // The result is only awaited when the browser callback is used, so failures must not surface as unhandled rejections.
        pending.result.promise.catch(() => undefined);
        this.pendingLogin = pending;
        pending.server = await this.startCallbackServer(pending);
        pending.timeout = setTimeout(() => this.settleLogin(pending, false), LOGIN_TIMEOUT_MS);
        return {
            authorizationUrl: buildAuthorizationUrl(challenge, state),
            callbackListening: pending.server !== undefined
        };
    }

    waitForLogin(): Promise<boolean> {
        if (!this.pendingLogin) {
            return Promise.resolve(false);
        }
        return this.pendingLogin.result.promise;
    }

    async completeLogin(codeOrRedirectUrl: string): Promise<boolean> {
        const pending = this.pendingLogin;
        if (!pending) {
            throw new Error('No ChatGPT sign in is in progress.');
        }
        return this.exchangeCode(pending, parseAuthorizationInput(codeOrRedirectUrl, pending.state));
    }

    async cancelLogin(): Promise<void> {
        if (this.pendingLogin) {
            this.settleLogin(this.pendingLogin, false);
        }
    }

    async getAuthState(): Promise<ChatGptAuthState> {
        return this.toAuthState(await this.readCredentials());
    }

    /**
     * Returns valid credentials for the ChatGPT endpoint, refreshing the access token when it is about to expire.
     * Backend only: the tokens must not leave the backend, which is what {@link createRemoteAuthService} enforces.
     */
    async getCredentials(): Promise<ChatGptCredentials | undefined> {
        const stored = await this.readCredentials();
        if (!stored) {
            return undefined;
        }
        if (stored.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
            return { accessToken: stored.accessToken, accountId: stored.accountId };
        }
        return this.refreshCredentials(stored);
    }

    async signOut(): Promise<void> {
        await this.cancelLogin();
        this.credentialsGeneration++;
        this.credentials = undefined;
        this.credentialsLoaded = true;
        await this.enqueueKeyStoreUpdate(async () => {
            try {
                await this.keyStoreService.deletePassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT);
            } catch (error) {
                this.logger.warn('Failed to delete the stored ChatGPT credentials:', error);
            }
        });
        this.notifyAuthStateChanged();
    }

    protected enqueueKeyStoreUpdate<T>(update: () => Promise<T>): Promise<T> {
        const result = this.keyStoreUpdates.then(update, update);
        this.keyStoreUpdates = result.catch(() => undefined);
        return result;
    }

    protected async startCallbackServer(pending: PendingLogin): Promise<http.Server | undefined> {
        const server = http.createServer((request, response) => this.handleCallbackRequest(pending, request, response));

        return new Promise<http.Server | undefined>(resolve => {
            server.once('error', error => {
                this.logger.info(`Could not listen on ${CHATGPT_REDIRECT_URI}, the authorization code has to be provided manually: ${error.message}`);
                resolve(undefined);
            });
            server.listen(CHATGPT_CALLBACK_PORT, CHATGPT_CALLBACK_HOST, () => resolve(server));
        });
    }

    protected handleCallbackRequest(pending: PendingLogin, request: http.IncomingMessage, response: http.ServerResponse): void {
        const url = new URL(request.url ?? '', `http://${CHATGPT_CALLBACK_HOST}`);
        if (url.pathname !== CHATGPT_CALLBACK_PATH) {
            this.respond(response, 404, 'Unknown callback route.');
            return;
        }
        if (url.searchParams.get('state') !== pending.state) {
            this.respond(response, 400, 'The sign in could not be verified. Please start the sign in again from Theia.');
            return;
        }
        const code = url.searchParams.get('code');
        if (!code) {
            this.respond(response, 400, 'The authorization code is missing. Please start the sign in again from Theia.');
            return;
        }
        this.respond(response, 200, 'Sign in complete. You can close this tab and return to Theia.');
        this.exchangeCode(pending, code).catch(error => this.logger.error('Failed to complete the ChatGPT sign in:', error));
    }

    /** The messages are application constants, so they need no escaping. */
    protected respond(response: http.ServerResponse, statusCode: number, message: string): void {
        response.statusCode = statusCode;
        response.setHeader('Connection', 'close');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!DOCTYPE html><html><head><title>Theia</title></head><body><p>${message}</p></body></html>`);
    }

    protected async exchangeCode(pending: PendingLogin, code: string): Promise<boolean> {
        if (pending.settled) {
            return false;
        }
        const generation = this.credentialsGeneration;
        try {
            const grant = await this.requestTokens(new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CHATGPT_CLIENT_ID,
                code,
                code_verifier: pending.verifier,
                redirect_uri: CHATGPT_REDIRECT_URI
            }));
            if (!grant.accountId) {
                throw new Error('The ChatGPT account could not be determined from the token. Please try again.');
            }
            // The attempt may have been cancelled or replaced by a newer one while the tokens were being requested.
            if (pending.settled || generation !== this.credentialsGeneration) {
                return false;
            }
            const signedIn = await this.storeCredentials({ ...grant, accountId: grant.accountId });
            this.settleLogin(pending, signedIn);
            return signedIn;
        } catch (error) {
            this.settleLogin(pending, error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    protected settleLogin(pending: PendingLogin, result: boolean | Error): void {
        if (pending.settled) {
            return;
        }
        pending.settled = true;
        if (pending.timeout) {
            clearTimeout(pending.timeout);
        }
        if (pending.server) {
            pending.server.close();
            pending.server.closeAllConnections();
        }
        if (this.pendingLogin === pending) {
            this.pendingLogin = undefined;
        }
        if (result instanceof Error) {
            pending.result.reject(result);
        } else {
            pending.result.resolve(result);
        }
    }

    protected async refreshCredentials(stored: StoredCredentials): Promise<ChatGptCredentials | undefined> {
        if (!this.refreshInProgress) {
            this.refreshInProgress = this.doRefreshCredentials(stored).finally(() => this.refreshInProgress = undefined);
        }
        return this.refreshInProgress;
    }

    protected async doRefreshCredentials(stored: StoredCredentials): Promise<ChatGptCredentials | undefined> {
        const generation = this.credentialsGeneration;
        try {
            const grant = await this.requestTokens(new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: CHATGPT_CLIENT_ID,
                refresh_token: stored.refreshToken
            }));
            if (generation !== this.credentialsGeneration) {
                return undefined;
            }
            // The account, its label and its plan describe the session rather than the individual token, so they are
            // carried over when a refreshed token does not restate them.
            const credentials: StoredCredentials = {
                ...grant,
                refreshToken: grant.refreshToken || stored.refreshToken,
                accountId: grant.accountId ?? stored.accountId,
                accountLabel: grant.accountLabel ?? stored.accountLabel,
                planType: grant.planType ?? stored.planType
            };
            if (!await this.storeCredentials(credentials)) {
                return undefined;
            }
            return { accessToken: credentials.accessToken, accountId: credentials.accountId };
        } catch (error) {
            // Only a rejected grant proves that the session is gone. Other failures, e.g. rate limiting or a server
            // error, must not cost the user their credentials.
            if (error instanceof TokenRequestError && error.oauthError !== undefined && SPENT_REFRESH_TOKEN_ERRORS.has(error.oauthError)) {
                // The rejection concerns the session this refresh started with. If that session has since been
                // replaced, signing out would discard the credentials of whoever is signed in now.
                if (generation !== this.credentialsGeneration) {
                    return undefined;
                }
                this.logger.info('The stored ChatGPT credentials are no longer valid, signing out.');
                await this.signOut();
                throw new Error('The ChatGPT session has expired. Please sign in with ChatGPT again.');
            }
            throw error;
        }
    }

    protected async requestTokens(body: URLSearchParams): Promise<TokenGrant> {
        const proxyFetch = createProxyFetch(getProxyUrl(CHATGPT_TOKEN_URL)) ?? fetch;
        const response = await proxyFetch(CHATGPT_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new TokenRequestError(`The OpenAI token request failed with status ${response.status}: ${errorBody}`, parseOAuthError(errorBody));
        }
        const payload = await response.json() as { access_token?: string, refresh_token?: string, expires_in?: number };
        if (!payload.access_token) {
            throw new TokenRequestError('The OpenAI token response did not contain an access token.');
        }
        const identity = decodeChatGptIdentity(payload.access_token);
        const expiresIn = typeof payload.expires_in === 'number' ? Date.now() + payload.expires_in * 1000 : undefined;
        return {
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token ?? '',
            expiresAt: expiresIn ?? identity.expiresAt ?? Date.now(),
            accountId: identity.accountId,
            accountLabel: identity.email,
            planType: identity.planType
        };
    }

    protected async readCredentials(): Promise<StoredCredentials | undefined> {
        if (this.credentialsLoaded) {
            return this.credentials;
        }
        // Callers arriving while the key store is being read have to see the loaded credentials, not the empty cache.
        if (!this.credentialsLoading) {
            this.credentialsLoading = this.loadCredentials().finally(() => this.credentialsLoading = undefined);
        }
        return this.credentialsLoading;
    }

    protected async loadCredentials(): Promise<StoredCredentials | undefined> {
        const generation = this.credentialsGeneration;
        let loaded: StoredCredentials | undefined;
        try {
            const stored = await this.keyStoreService.getPassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT);
            if (stored) {
                loaded = this.toStoredCredentials(stored);
                if (!loaded) {
                    this.logger.warn('Ignoring the stored ChatGPT credentials because they are not a usable session.');
                }
            }
        } catch (error) {
            this.logger.warn('Failed to read the stored ChatGPT credentials:', error);
        }
        if (generation !== this.credentialsGeneration) {
            return this.credentials;
        }
        this.credentials = loaded;
        this.credentialsLoaded = true;
        return this.credentials;
    }

    /** Parses a stored session, rejecting anything that could not be used to authenticate a request. */
    protected toStoredCredentials(stored: string): StoredCredentials | undefined {
        let parsed: Partial<StoredCredentials> | undefined;
        try {
            parsed = JSON.parse(stored) as Partial<StoredCredentials>;
        } catch {
            return undefined;
        }
        const accessToken = nonBlank(parsed?.accessToken);
        const accountId = nonBlank(parsed?.accountId);
        const refreshToken = parsed?.refreshToken;
        const expiresAt = parsed?.expiresAt;
        if (!accessToken || !accountId || typeof refreshToken !== 'string' || typeof expiresAt !== 'number') {
            return undefined;
        }
        return {
            accessToken,
            refreshToken,
            expiresAt,
            accountId,
            accountLabel: nonBlank(parsed?.accountLabel),
            planType: nonBlank(parsed?.planType)
        };
    }

    /**
     * Persists the session before publishing it, so a failed write cannot leave the backend reporting a session that
     * is not stored. Returns `false` if the session was ended while it was being obtained or written, in which case
     * the sign out queued behind this update removes what was written.
     */
    protected async storeCredentials(credentials: StoredCredentials): Promise<boolean> {
        const generation = this.credentialsGeneration;
        return this.enqueueKeyStoreUpdate(async () => {
            if (generation !== this.credentialsGeneration) {
                return false;
            }
            await this.keyStoreService.setPassword(KEYSTORE_SERVICE, KEYSTORE_ACCOUNT, JSON.stringify(credentials));
            if (generation !== this.credentialsGeneration) {
                return false;
            }
            this.credentials = credentials;
            this.credentialsLoaded = true;
            this.notifyAuthStateChanged();
            return true;
        });
    }

    protected notifyAuthStateChanged(): void {
        const state = this.toAuthState(this.credentials);
        this.onAuthStateChangedEmitter.fire(state);
        this.clients.forEach(client => client.onAuthStateChanged(state));
    }

    protected toAuthState(credentials: StoredCredentials | undefined): ChatGptAuthState {
        return credentials
            ? { isAuthenticated: true, accountLabel: credentials.accountLabel, planType: credentials.planType }
            : { isAuthenticated: false };
    }
}

/**
 * Narrows the service down to what a frontend may invoke. The RPC proxy dispatches requests by method name on the
 * object it serves, so handing out the service itself would let any client of the connection call
 * {@link ChatGptAuthServiceImpl.getCredentials} and read the access token of the signed in account.
 */
export function createRemoteAuthService(service: ChatGptAuthServiceImpl): ChatGptAuthService {
    return {
        startLogin: () => service.startLogin(),
        waitForLogin: () => service.waitForLogin(),
        completeLogin: codeOrRedirectUrl => service.completeLogin(codeOrRedirectUrl),
        cancelLogin: () => service.cancelLogin(),
        getAuthState: () => service.getAuthState(),
        signOut: () => service.signOut(),
        onAuthStateChanged: service.onAuthStateChanged
    };
}

function nonBlank(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseOAuthError(errorBody: string): string | undefined {
    try {
        const parsed = JSON.parse(errorBody) as { error?: unknown };
        return typeof parsed.error === 'string' ? parsed.error : undefined;
    } catch {
        return undefined;
    }
}
