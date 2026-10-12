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

// Default import so that tests can stub the real module; a namespace import would be an `esModuleInterop` copy.
import http from 'http';
import { randomUUID } from 'crypto';
import { Disposable, Emitter, Event, ILogger } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { createProxyFetch, getProxyUrl } from '@theia/ai-core/lib/node';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ChatGptAuthService, ChatGptAuthServiceClient, ChatGptAuthState, ChatGptCredentials, ChatGptLoginSession } from '../common/index.js';
import {
    AuthorizationCode, buildAuthorizationUrl, createLoginState, createPkcePair, isConcreteClientId,
    parseAuthorizationInput, CHATGPT_RESOURCE, CHATGPT_TOKEN_URL
} from './chatgpt-oauth.js';
import { ChatGptAuthServiceConfig, ChatGptBackendAuthSession } from './chatgpt-auth-service.js';
import { ChatGptIdTokenVerifier, VerifiedChatGptIdentity } from './chatgpt-id-token.js';

/** A login attempt is abandoned when the user does not complete it within this time. */
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
/** Access tokens are refreshed this long before they actually expire. */
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
/**
 * OAuth error codes with which the token endpoint reports a refresh token that can never be used again. Besides
 * the `invalid_grant` of RFC 6749 section 5.2, OpenAI answers with codes of its own naming the actual reason.
 */
const SPENT_REFRESH_TOKEN_ERRORS = new Set([
    'invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_reused', 'refresh_token_invalidated'
]);

export interface TokenSet {
    sessionId: string;
    /** OAuth bearer authorized for the requested public API resource. */
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
    scope: string;
}

interface RegisteredAccount {
    clientId: string;
    subject: string;
    accountLabel?: string;
    /** Previously verified ID token, retained as a backend-only reauthorization hint. */
    idTokenHint?: string;
    planType?: string;
    tokens?: TokenSet;
}

export interface StoredSession {
    version: 1;
    account?: RegisteredAccount;
}

export interface TokenGrant extends Omit<TokenSet, 'sessionId'> {
    planType?: string;
    identity?: VerifiedChatGptIdentity;
    idTokenHint?: string;
}

interface PendingLogin {
    verifier: string;
    state: string;
    nonce: string;
    expectedClientId?: string;
    result: Deferred<boolean>;
    settled: boolean;
    exchange?: Promise<boolean>;
    server?: http.Server;
    timeout?: NodeJS.Timeout;
}

export class TokenRequestError extends Error {
    constructor(message: string, readonly oauthError?: string) {
        super(message);
    }
}

/**
 * Backend implementation of the "Sign in with ChatGPT" OAuth flow, sharing session ownership and persistence with Codex.
 * The browser returns the authorization code to a loopback listener. If that listener is not reachable, e.g. because
 * the backend does not run on the user's machine, the full callback URL can be handed over manually instead.
 * OAuth secrets never cross the frontend RPC boundary.
 */
@injectable()
export class ChatGptAuthServiceImpl implements ChatGptBackendAuthSession {

    @inject(ChatGptAuthServiceConfig)
    protected readonly config: ChatGptAuthServiceConfig;

    @inject(KeyStoreService)
    protected readonly keyStoreService: KeyStoreService;

    @inject(ILogger) @named('ai-chatgpt:ChatGptAuthServiceImpl')
    protected readonly logger: ILogger;

    protected readonly clients = new Set<ChatGptAuthServiceClient>();
    protected pendingLogin: PendingLogin | undefined;
    protected session: StoredSession | undefined;
    protected sessionLoading: Promise<StoredSession> | undefined;
    protected hostIdLoading: Promise<string> | undefined;
    protected refreshInProgress: { sessionId: string; promise: Promise<void> } | undefined;
    protected disconnecting: Promise<void> = Promise.resolve();
    protected credentialsGeneration = 0;
    protected keyStoreUpdates: Promise<unknown> = Promise.resolve();
    /** Hides the old session immediately, including while its initial key store read is pending. */
    protected sessionHidden = false;
    protected readonly idTokenVerifier = new ChatGptIdTokenVerifier();
    protected readonly onAuthStateChangedEmitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChanged: Event<ChatGptAuthState> = this.onAuthStateChangedEmitter.event;

    protected get redirectUri(): string {
        this.validateConfig();
        return `http://${this.config.callbackHost}:${this.config.callbackPort}${this.config.callbackPath}`;
    }

    protected validateConfig(): void {
        if (this.config.callbackHost !== '127.0.0.1'
            || !Number.isInteger(this.config.callbackPort) || this.config.callbackPort < 1 || this.config.callbackPort > 65535
            || !/^\/[A-Za-z0-9/_-]*$/.test(this.config.callbackPath)
            || !nonBlank(this.config.agentName) || !nonBlank(this.config.keyStoreService) || !nonBlank(this.config.keyStoreAccount)) {
            throw new Error('Invalid ChatGPT backend authentication configuration.');
        }
    }

    addClient(client: ChatGptAuthServiceClient): Disposable {
        this.clients.add(client);
        return Disposable.create(() => this.clients.delete(client));
    }

    async startLogin(): Promise<ChatGptLoginSession> {
        this.validateConfig();
        if (this.pendingLogin) {
            this.settleLogin(this.pendingLogin, false);
        }
        const { verifier, challenge } = createPkcePair();
        const pending: PendingLogin = {
            verifier, state: createLoginState(), nonce: createLoginState(), expectedClientId: undefined,
            result: new Deferred<boolean>(), settled: false
        };
        pending.result.promise.catch(() => undefined);
        this.pendingLogin = pending;
        try {
            await this.disconnecting;
            const [session, hostId] = await Promise.all([this.readSession(), this.getHostId()]);
            if (!this.isPending(pending)) {
                throw new Error('The ChatGPT sign in was cancelled.');
            }
            const account = this.sessionHidden ? undefined : session.account;
            if (account?.tokens && this.hasPlanScope(account.tokens)) {
                throw new Error('Sign out of ChatGPT before signing in with another account.');
            }
            const clientId = account?.clientId;
            pending.expectedClientId = clientId;
            const idTokenHint = account?.idTokenHint;
            const server = await this.startCallbackServer(pending);
            if (!this.isPending(pending)) {
                server?.close();
                server?.closeAllConnections();
                throw new Error('The ChatGPT sign in was cancelled.');
            }
            pending.server = server;
            pending.timeout = setTimeout(() => this.settleLogin(pending, false), LOGIN_TIMEOUT_MS);
            return {
                authorizationUrl: this.buildAuthorizationUrl(challenge, pending.state, {
                    nonce: pending.nonce, hostId, clientId, redirectUri: this.redirectUri,
                    agentName: this.config.agentName, idTokenHint
                }),
                callbackListening: server !== undefined,
                loginId: pending.state
            };
        } catch (error) {
            this.settleLogin(pending, false);
            throw error;
        }
    }

    protected buildAuthorizationUrl(challenge: string, state: string, options: Parameters<typeof buildAuthorizationUrl>[2]): string {
        return buildAuthorizationUrl(challenge, state, options);
    }

    protected parseAuthorizationInput(input: string, state: string, clientId?: string): AuthorizationCode | undefined {
        return parseAuthorizationInput(input, state, this.redirectUri, clientId);
    }

    /** Invalidates ownership synchronously, before durable logout can wait on persistence. */
    suspend(): void {
        if (this.pendingLogin) {
            this.settleLogin(this.pendingLogin, false);
        }
        ++this.credentialsGeneration;
        this.sessionHidden = true;
    }

    waitForLogin(loginId: string): Promise<boolean> {
        const pending = this.pendingLogin;
        return pending && typeof loginId === 'string' && pending.state === loginId
            ? pending.result.promise : Promise.resolve(false);
    }

    async completeLogin(codeOrRedirectUrl: string, loginId: string): Promise<boolean> {
        const pending = this.pendingLogin;
        if (!pending || typeof loginId !== 'string' || pending.state !== loginId) {
            return false;
        }
        const code = this.parseAuthorizationInput(codeOrRedirectUrl, pending.state, pending.expectedClientId);
        if (!code) {
            this.settleLogin(pending, false);
            return false;
        }
        return this.exchangeCode(pending, code);
    }

    async cancelLogin(loginId: string): Promise<void> {
        if (this.pendingLogin && typeof loginId === 'string' && this.pendingLogin.state === loginId) {
            this.settleLogin(this.pendingLogin, false);
        }
    }

    async getAuthState(): Promise<ChatGptAuthState> {
        await this.readSession();
        return this.toAuthState();
    }

    /** A caller pinned to an account must not silently switch tokens during an in-flight tool cycle. */
    async getCredentials(clientId?: string, sessionId?: string): Promise<ChatGptCredentials | undefined> {
        const generation = this.credentialsGeneration;
        await this.disconnecting;
        const account = (await this.readSession()).account;
        if (generation !== this.credentialsGeneration || this.sessionHidden || !account?.tokens || (clientId !== undefined && clientId !== account.clientId)
            || (sessionId !== undefined && sessionId !== account.tokens.sessionId)) {
            return undefined;
        }
        if (!this.hasPlanScope(account.tokens)) {
            throw new Error('ChatGPT token sharing is not enabled. Reconnect this account to enable it.');
        }
        if (account.tokens.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
            return this.inferenceCredentials(account.clientId, account.tokens);
        }
        const requestedSessionId = account.tokens.sessionId;
        try {
            await this.refreshCredentials(account);
        } catch (error) {
            if (generation !== this.credentialsGeneration) {
                return undefined;
            }
            throw error;
        }
        if (generation !== this.credentialsGeneration || this.sessionHidden || !this.isCurrentSession(account.clientId, requestedSessionId)) {
            return undefined;
        }
        const refreshed = this.session!.account!.tokens!;
        if (!this.hasPlanScope(refreshed)) {
            throw new TokenRequestError('ChatGPT token sharing is not enabled. Reconnect this account to enable it.');
        }
        if (refreshed.expiresAt <= Date.now()) {
            throw new TokenRequestError('The renewed ChatGPT access token has expired. Please reconnect this account.');
        }
        return this.inferenceCredentials(account.clientId, refreshed);
    }

    signOut(): Promise<void> {
        this.suspend();
        const disconnected = this.disconnecting.catch(() => undefined).then(async () => {
            const account = (await this.readSession()).account;
            await this.enqueueKeyStoreUpdate(async () => {
                if (!account) {
                    const stored = await this.keyStoreService.getPassword(this.config.keyStoreService, this.config.keyStoreAccount);
                    // Leave incompatible data untouched, particularly released Codex credentials in the shared legacy slot.
                    if (stored && !this.parseSession(stored)) {
                        return;
                    }
                }
                const next: StoredSession = { version: 1 };
                await this.keyStoreService.setPassword(this.config.keyStoreService, this.config.keyStoreAccount, JSON.stringify(next));
                this.session = next;
            });
            if (account?.tokens) {
                // Remote discovery must not delay durable local logout or the next login.
                this.revokeTokens(account.clientId, account.tokens).catch(() =>
                    this.logger.warn('Could not revoke the ChatGPT session remotely. Disconnecting locally.'));
            }
        }).catch(() => {
            throw new Error('Could not persist the disconnected ChatGPT session.');
        });
        this.disconnecting = disconnected;
        this.notifyAuthStateChanged();
        return disconnected;
    }

    /** Expiry retains the registration for ordinary reauthorization, unlike explicit logout. */
    protected async disconnectSession(clientId: string, sessionId: string): Promise<void> {
        if (!this.isCurrentSession(clientId, sessionId)) {
            return;
        }
        const generation = this.credentialsGeneration;
        await this.storeSession(next => {
            next.account!.tokens = undefined;
        }, generation);
    }

    protected async revokeTokens(clientId: string, tokens: TokenSet): Promise<void> {
        try {
            const endpoint = await this.getRevocationEndpoint();
            if (!endpoint) {
                this.logger.warn('OpenAI discovery did not provide a revocation endpoint. Disconnecting locally.');
                return;
            }
            const proxyFetch = createProxyFetch(getProxyUrl(endpoint)) ?? fetch;
            const response = await proxyFetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    token: tokens.refreshToken ?? tokens.accessToken, client_id: clientId,
                    token_type_hint: tokens.refreshToken ? 'refresh_token' : 'access_token'
                }),
                redirect: 'error', signal: AbortSignal.timeout(10_000)
            });
            if (!response.ok) {
                this.logger.warn('Could not revoke the ChatGPT session remotely. Disconnecting locally.');
            }
        } catch {
            this.logger.warn('Could not revoke the ChatGPT session remotely. Disconnecting locally.');
        }
    }

    protected getRevocationEndpoint(): Promise<string | undefined> {
        return this.idTokenVerifier.getRevocationEndpoint();
    }

    protected enqueueKeyStoreUpdate<T>(update: () => Promise<T>): Promise<T> {
        const result = this.keyStoreUpdates.then(update, update);
        this.keyStoreUpdates = result.catch(() => undefined);
        return result;
    }

    protected async getHostId(): Promise<string> {
        if (!this.hostIdLoading) {
            const request = this.enqueueKeyStoreUpdate(async () => {
                const account = `${this.config.keyStoreAccount}:agent-host`;
                const existing = await this.keyStoreService.getPassword(this.config.keyStoreService, account);
                if (nonBlank(existing)) {
                    return existing!;
                }
                const id = `urn:uuid:${randomUUID()}`;
                await this.keyStoreService.setPassword(this.config.keyStoreService, account, id);
                return id;
            }).catch(() => {
                if (this.hostIdLoading === request) {
                    this.hostIdLoading = undefined;
                }
                throw new Error('Could not persist the ChatGPT application host id.');
            });
            this.hostIdLoading = request;
        }
        return this.hostIdLoading;
    }

    protected async startCallbackServer(pending: PendingLogin): Promise<http.Server | undefined> {
        const server = http.createServer((request, response) => this.handleCallbackRequest(pending, request, response));
        return new Promise(resolve => {
            server.once('error', () => {
                this.logger.info('Could not start the ChatGPT loopback listener. Provide the full callback URL manually.');
                resolve(undefined);
            });
            server.listen(this.config.callbackPort, this.config.callbackHost, () => resolve(server));
        });
    }

    protected handleCallbackRequest(pending: PendingLogin, request: http.IncomingMessage, response: http.ServerResponse): void {
        let code: AuthorizationCode | undefined;
        try {
            const url = new URL(request.url ?? '', this.redirectUri);
            if (url.pathname !== this.config.callbackPath) {
                this.respond(response, 404, 'Unknown callback route.');
                return;
            }
            if (!this.isPending(pending)) {
                throw new Error();
            }
            code = this.parseAuthorizationInput(url.toString(), pending.state, pending.expectedClientId);
        } catch {
            this.respond(response, 400, 'The sign in could not be verified. Please start the sign in again from Theia.');
            return;
        }
        if (!code) {
            this.respond(response, 200, 'Sign in cancelled. You can close this tab and return to Theia.');
            this.settleLogin(pending, false);
            return;
        }
        this.respond(response, 200, 'Sign in received. You can close this tab and return to Theia.');
        this.exchangeCode(pending, code).catch(() => this.logger.error('Failed to complete the ChatGPT sign in.'));
    }

    protected respond(response: http.ServerResponse, statusCode: number, message: string): void {
        response.statusCode = statusCode;
        response.setHeader('Connection', 'close');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!DOCTYPE html><html><head><title>Theia</title></head><body><p>${message}</p></body></html>`);
    }

    protected isPending(pending: PendingLogin): boolean {
        return !pending.settled && this.pendingLogin === pending;
    }

    protected exchangeCode(pending: PendingLogin, code: AuthorizationCode): Promise<boolean> {
        if (!this.isPending(pending)) {
            return Promise.resolve(false);
        }
        // A browser callback and a manual callback can arrive together; a code may only be exchanged once.
        pending.exchange ??= this.doExchangeCode(pending, code);
        return pending.exchange;
    }

    protected async doExchangeCode(pending: PendingLogin, { code, clientId }: AuthorizationCode): Promise<boolean> {
        const generation = this.credentialsGeneration;
        try {
            const grant = await this.requestTokens(new URLSearchParams({
                grant_type: 'authorization_code', client_id: clientId, code, resource: CHATGPT_RESOURCE,
                code_verifier: pending.verifier, redirect_uri: this.redirectUri
            }), clientId, pending.nonce);
            if (!this.isPending(pending) || generation !== this.credentialsGeneration) {
                return false;
            }
            const identity = grant.identity!;
            const existing = this.session?.account;
            this.validateLoginIdentity(existing?.subject, identity);
            const signedIn = await this.storeSession(next => {
                next.account = {
                    clientId, subject: identity.subject, accountLabel: identity.email ?? identity.name ?? existing?.accountLabel,
                    tokens: this.toTokenSet(grant, randomUUID()), idTokenHint: grant.idTokenHint ?? existing?.idTokenHint,
                    planType: grant.planType ?? existing?.planType
                };
            }, generation, pending);
            this.settleLogin(pending, signedIn);
            return signedIn;
        } catch (error) {
            if (!this.isPending(pending) || generation !== this.credentialsGeneration) {
                return false;
            }
            const safeError = error instanceof TokenRequestError ? error : new Error('The ChatGPT sign in could not be completed.');
            this.settleLogin(pending, safeError);
            throw safeError;
        }
    }

    protected validateLoginIdentity(subject: string | undefined, identity: VerifiedChatGptIdentity): void {
        if (subject && subject !== identity.subject) {
            throw new Error('The reconnected ChatGPT account does not match its registered identity.');
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
        pending.server?.close();
        pending.server?.closeAllConnections();
        if (this.pendingLogin === pending) {
            this.pendingLogin = undefined;
        }
        if (result instanceof Error) {
            pending.result.reject(result);
        } else {
            pending.result.resolve(result);
        }
    }

    protected isCurrentSession(clientId: string, sessionId: string): boolean {
        return !this.sessionHidden && this.session?.account?.clientId === clientId && this.session.account.tokens?.sessionId === sessionId;
    }

    protected refreshCredentials(account: RegisteredAccount): Promise<void> {
        const stored = account.tokens!;
        if (this.refreshInProgress?.sessionId === stored.sessionId) {
            return this.refreshInProgress.promise;
        }
        const promise = this.doRefreshCredentials(account, stored).finally(() => {
            if (this.refreshInProgress?.promise === promise) {
                this.refreshInProgress = undefined;
            }
        });
        this.refreshInProgress = { sessionId: stored.sessionId, promise };
        return promise;
    }

    protected async doRefreshCredentials(account: RegisteredAccount, stored: TokenSet): Promise<void> {
        const session = { clientId: account.clientId, sessionId: stored.sessionId };
        try {
            if (!stored.refreshToken) {
                await this.disconnectSession(account.clientId, stored.sessionId);
                return;
            }
            const grant = await this.requestTokens(new URLSearchParams({
                grant_type: 'refresh_token', client_id: account.clientId, refresh_token: stored.refreshToken, resource: CHATGPT_RESOURCE
            }), account.clientId);
            if (!this.isCurrentSession(account.clientId, stored.sessionId)) {
                return;
            }
            if (grant.identity && grant.identity.subject !== account.subject) {
                throw new TokenRequestError('The refreshed OpenAI identity does not match the registered account.');
            }
            const tokens = this.toTokenSet({ ...grant, refreshToken: grant.refreshToken ?? stored.refreshToken }, stored.sessionId);
            await this.storeSession(next => {
                const registered = next.account!;
                registered.tokens = tokens;
                registered.accountLabel = grant.identity?.email ?? grant.identity?.name ?? registered.accountLabel;
                registered.idTokenHint = grant.idTokenHint ?? registered.idTokenHint;
                registered.planType = grant.planType ?? registered.planType;
            }, undefined, undefined, session);
        } catch (error) {
            if (!this.isCurrentSession(account.clientId, stored.sessionId)) {
                return;
            }
            if (error instanceof TokenRequestError && error.oauthError && SPENT_REFRESH_TOKEN_ERRORS.has(error.oauthError)) {
                await this.disconnectSession(account.clientId, stored.sessionId);
                throw new Error('The ChatGPT session has expired. Please sign in with ChatGPT again.');
            }
            throw error instanceof TokenRequestError ? error : new Error('The ChatGPT session could not be refreshed.');
        }
    }

    protected verifyIdToken(token: string, clientId: string, nonce?: string): Promise<VerifiedChatGptIdentity> {
        return this.idTokenVerifier.verify(token, clientId, nonce);
    }

    protected async requestTokens(body: URLSearchParams, clientId: string, nonce?: string): Promise<TokenGrant> {
        let response: Response;
        try {
            const proxyFetch = createProxyFetch(getProxyUrl(CHATGPT_TOKEN_URL)) ?? fetch;
            response = await proxyFetch(CHATGPT_TOKEN_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
                redirect: 'error', signal: AbortSignal.timeout(30_000)
            });
        } catch {
            throw new TokenRequestError('The OpenAI token request could not be completed.');
        }
        if (!response.ok) {
            let oauthError: string | undefined;
            try {
                const errorPayload = await response.json() as { error?: unknown };
                // Only recognized codes affect lifecycle; neither unknown codes nor response bodies enter error messages.
                if (typeof errorPayload.error === 'string' && SPENT_REFRESH_TOKEN_ERRORS.has(errorPayload.error)) {
                    oauthError = errorPayload.error;
                }
            } catch { /* Non-JSON errors are also deliberately discarded. */ }
            throw new TokenRequestError(`The OpenAI token request failed with status ${response.status}.`, oauthError);
        }
        const payload = await response.json() as {
            access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; expires_at?: unknown; scope?: unknown;
            token_type?: unknown; id_token?: unknown; profile?: { subject?: unknown; sub?: unknown; email?: unknown; name?: unknown };
        };
        const expiresAt = tokenExpiration(payload.expires_at, payload.expires_in);
        if (!nonBlank(payload.access_token) || expiresAt === undefined || typeof payload.scope !== 'string'
            || typeof payload.token_type !== 'string' || payload.token_type.toLowerCase() !== 'bearer'
            || (payload.refresh_token !== undefined && !nonBlank(payload.refresh_token))) {
            throw new TokenRequestError('The OpenAI token response did not contain a usable token set.');
        }
        let identity: VerifiedChatGptIdentity | undefined;
        if (payload.id_token !== undefined || nonce !== undefined) {
            if (!nonBlank(payload.id_token)) {
                throw new TokenRequestError('The OpenAI token response did not contain an ID token.');
            }
            identity = await this.verifyIdToken(payload.id_token as string, clientId, nonce);
            const hint = payload.profile;
            const subject = hint?.subject ?? hint?.sub;
            if (subject !== undefined && subject !== identity.subject) {
                throw new TokenRequestError('The OpenAI profile does not match the verified identity.');
            }
            identity.email ??= nonBlank(hint?.email);
            identity.name ??= nonBlank(hint?.name);
        }
        return {
            accessToken: payload.access_token as string, refreshToken: payload.refresh_token as string | undefined,
            expiresAt, scope: payload.scope, identity,
            idTokenHint: identity ? payload.id_token as string : undefined
        };
    }

    protected inferenceCredentials(clientId: string, tokens: TokenSet): ChatGptCredentials {
        return { accessToken: tokens.accessToken, clientId, sessionId: tokens.sessionId };
    }

    protected toTokenSet(grant: Omit<TokenSet, 'sessionId'>, sessionId: string): TokenSet {
        return {
            accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresAt: grant.expiresAt, scope: grant.scope,
            sessionId
        };
    }

    protected readSession(): Promise<StoredSession> {
        if (this.session) {
            return Promise.resolve(this.session);
        }
        if (!this.sessionLoading) {
            this.sessionLoading = this.loadSession().finally(() => this.sessionLoading = undefined);
        }
        return this.sessionLoading;
    }

    protected async loadSession(): Promise<StoredSession> {
        await this.keyStoreUpdates;
        let loaded: StoredSession | undefined;
        try {
            const stored = await this.readStoredSession();
            loaded = stored ? this.parseSession(stored) : undefined;
            if (stored && !loaded) {
                this.logger.warn('Ignoring incompatible or malformed stored ChatGPT credentials.');
            }
        } catch {
            throw new Error('Could not load the ChatGPT session.');
        }
        this.session = loaded ?? { version: 1 };
        return this.session;
    }

    protected readStoredSession(): Promise<string | undefined> {
        return this.keyStoreService.getPassword(this.config.keyStoreService, this.config.keyStoreAccount);
    }

    /** Versioned protocol-local storage never imports unreleased multi-account formats. */
    protected parseSession(stored: string): StoredSession | undefined {
        try {
            const parsed = JSON.parse(stored) as StoredSession & { accounts?: unknown; activeClientId?: unknown };
            if (!parsed || parsed.version !== 1 || parsed.accounts !== undefined || parsed.activeClientId !== undefined) {
                return undefined;
            }
            const account = parsed.account;
            if (account === undefined) {
                return { version: 1 };
            }
            if (!account || !isConcreteClientId(account.clientId) || !nonBlank(account.subject)
                || (account.accountLabel !== undefined && typeof account.accountLabel !== 'string')
                || (account.idTokenHint !== undefined && !nonBlank(account.idTokenHint))
                || (account.planType !== undefined && typeof account.planType !== 'string')) {
                return undefined;
            }
            const tokens = account.tokens;
            if (tokens !== undefined && (!tokens || !nonBlank(tokens.accessToken) || !Number.isFinite(tokens.expiresAt)
                || typeof tokens.scope !== 'string' || !nonBlank(tokens.sessionId)
                || (tokens.refreshToken !== undefined && !nonBlank(tokens.refreshToken)))) {
                return undefined;
            }
            return {
                version: 1, account: {
                    clientId: account.clientId, subject: account.subject, accountLabel: account.accountLabel,
                    idTokenHint: account.idTokenHint, planType: account.planType,
                    tokens: tokens ? this.toTokenSet(tokens, tokens.sessionId) : undefined
                }
            };
        } catch {
            return undefined;
        }
    }

    /** Publish after persistence and roll back all tentative writes which lost ownership, inside the same queue item. */
    protected async storeSession(update: (session: StoredSession) => void, generation: number | undefined, pending?: PendingLogin,
        session?: { clientId: string; sessionId: string }): Promise<boolean> {
        await this.readSession();
        const isCurrent = (): boolean => session ? this.isCurrentSession(session.clientId, session.sessionId)
            : generation === this.credentialsGeneration && (!pending || this.isPending(pending));
        return this.enqueueKeyStoreUpdate(async () => {
            if (!isCurrent()) {
                return false;
            }
            const previous = await this.keyStoreService.getPassword(this.config.keyStoreService, this.config.keyStoreAccount);
            if (!isCurrent()) {
                return false;
            }
            const next = JSON.parse(JSON.stringify(this.session)) as StoredSession;
            update(next);
            await this.keyStoreService.setPassword(this.config.keyStoreService, this.config.keyStoreAccount, JSON.stringify(next));
            if (!isCurrent()) {
                if (previous !== undefined) {
                    await this.keyStoreService.setPassword(this.config.keyStoreService, this.config.keyStoreAccount, previous);
                } else {
                    await this.keyStoreService.deletePassword(this.config.keyStoreService, this.config.keyStoreAccount);
                }
                return false;
            }
            this.session = next;
            if (pending) {
                this.credentialsGeneration++;
            }
            this.sessionHidden = false;
            this.notifyAuthStateChanged();
            return true;
        });
    }

    protected hasPlanScope(tokens: TokenSet): boolean {
        return tokens.scope.split(/\s+/).includes('chatgpt.tokens.use.direct')
            && tokens.scope.split(/\s+/).includes('resource.invoke');
    }

    protected toAuthState(): ChatGptAuthState {
        const account = this.sessionHidden ? undefined : this.session?.account;
        return {
            isAuthenticated: !!account?.tokens && !this.sessionHidden,
            canUseChatGptPlan: !!account?.tokens && !this.sessionHidden && this.hasPlanScope(account.tokens),
            accountLabel: account?.accountLabel,
            planType: account?.planType
        };
    }

    protected notifyAuthStateChanged(): void {
        const state = this.toAuthState();
        this.onAuthStateChangedEmitter.fire(state);
        this.clients.forEach(client => client.onAuthStateChanged(state));
    }
}

/** Explicit facade: RPC dispatch by method name must never expose getCredentials or backend helpers. */
export function createRemoteAuthService(service: ChatGptAuthService): ChatGptAuthService {
    return {
        startLogin: () => service.startLogin(),
        waitForLogin: loginId => service.waitForLogin(loginId),
        completeLogin: (input, loginId) => service.completeLogin(input, loginId),
        cancelLogin: loginId => service.cancelLogin(loginId),
        getAuthState: () => service.getAuthState(),
        signOut: () => service.signOut(),
        onAuthStateChanged: service.onAuthStateChanged
    };
}

function tokenExpiration(expiresAt: unknown, expiresIn: unknown): number | undefined {
    if (expiresAt !== undefined) {
        // Absolute timestamps can be Unix seconds, Unix milliseconds or an ISO timestamp.
        const absolute = typeof expiresAt === 'number'
            ? expiresAt < 1_000_000_000_000 ? expiresAt * 1000 : expiresAt
            : typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
        return Number.isFinite(absolute) && absolute > 0 ? absolute : undefined;
    }
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn < 0) {
        return undefined;
    }
    const expiration = Date.now() + expiresIn * 1000;
    return Number.isFinite(expiration) ? expiration : undefined;
}

function nonBlank(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
