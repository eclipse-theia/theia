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

import { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { nls } from '@theia/core/lib/common/nls';
import { MCPOAuthConfig, MCPOAuthFrontendDelegate } from '../common/mcp-oauth';
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';
import { MCPOAuthAuthorizationRequiredError, MCPOAuthAuthorizationServerError } from './mcp-oauth-errors';
import { MCP_OAUTH_KEYSTORE_SERVICE, mcpOAuthAccountPrefix, normalizeOAuthUrl, StoredOAuthTokens, StoredOAuthValue } from './mcp-oauth-keystore';

/**
 * Constructor options for {@link MCPOAuthClientProvider}. Using an options object prevents silent
 * reorder bugs across the four same-typed `string` fields (`serverName`, `callbackUrl`, `stateValue`,
 * `credentialScope`).
 */
export interface MCPOAuthClientProviderOptions {
    serverName: string;
    config: MCPOAuthConfig;
    callbackUrl: string;
    stateValue: string;
    credentialScope: string;
    keyStore: KeyStoreService;
    frontendDelegate: MCPOAuthFrontendDelegate;
    callbackService: MCPOAuthCallbackService;
    /**
     * `true` when the OAuth flow was initiated by a direct user action; `false` for autostart and
     * other non-interactive paths. Non-interactive providers reject
     * {@link MCPOAuthClientProvider.redirectToAuthorization} before reaching the delegate, so
     * autostart cannot inadvertently open a browser tab.
     */
    interactive: boolean;
}

export class MCPOAuthClientProvider implements OAuthClientProvider {

    protected readonly serverName: string;
    protected readonly config: MCPOAuthConfig;
    protected readonly callbackUrl: string;
    protected readonly stateValue: string;
    protected readonly credentialScope: string;
    protected readonly keyStore: KeyStoreService;
    protected readonly frontendDelegate: MCPOAuthFrontendDelegate;
    protected readonly callbackService: MCPOAuthCallbackService;
    protected readonly accountPrefix: string;
    protected readonly interactive: boolean;
    protected active = true;
    protected codeVerifierValue: string | undefined;

    constructor(options: MCPOAuthClientProviderOptions) {
        this.serverName = options.serverName;
        this.config = options.config;
        this.callbackUrl = options.callbackUrl;
        this.stateValue = options.stateValue;
        this.credentialScope = options.credentialScope;
        this.keyStore = options.keyStore;
        this.frontendDelegate = options.frontendDelegate;
        this.callbackService = options.callbackService;
        this.interactive = options.interactive;
        this.accountPrefix = mcpOAuthAccountPrefix(this.serverName, this.credentialScope);
    }

    get redirectUrl(): string {
        return this.callbackUrl;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            redirect_uris: [this.callbackUrl],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            client_name: 'Theia MCP Client',
            scope: this.config.scopes?.join(' ')
        };
    }

    state(): string {
        return this.stateValue;
    }

    async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
        if (this.config.clientId) {
            return {
                client_id: this.config.clientId
            };
        }
        return this.readClientInformation();
    }

    saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
        if (this.config.clientId) {
            console.debug(`Ignoring dynamic MCP OAuth client information for server "${this.serverName}" because a static clientId is configured.`);
            return Promise.resolve();
        }
        return this.write('client', this.publicClientInformation(clientInformation));
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        // Asymmetry with hasUnexpiredAccessToken (autostart gate) is deliberate: this read path reports
        // literal remaining lifetime (clamped to >= 0). The SDK has its own clock-skew logic on the
        // runtime path; MCP_OAUTH_TOKEN_EXPIRY_BUFFER_MS belongs to the autostart decision only.
        const storedTokens = await this.read<StoredOAuthTokens>('tokens');
        if (!storedTokens) {
            return undefined;
        }
        const { saved_at, ...tokens } = storedTokens;
        // Foreign entries where `token_type` is an object/array/number would coerce to a garbage
        // Authorization-header prefix (`[object Object] <token>`). Force a refresh so the SDK reissues
        // with a valid `token_type` from the auth server.
        if (typeof tokens.token_type !== 'string' || tokens.token_type.length === 0) {
            return { ...tokens, expires_in: 0 };
        }
        // Check `saved_at` BEFORE `expires_in`. Only tokens persisted by this provider include `saved_at`;
        // without this check, a hand-edited `{ access_token: "stale", refresh_token: "..." }` would fall
        // into the `expires_in === undefined -> trust forever` branch and reuse a stale token forever.
        if (saved_at === undefined) {
            // Force a refresh: SDK contract for `expires_in: 0` is "expired now -> refresh via refresh_token".
            return { ...tokens, expires_in: 0 };
        }
        // `expires_in` may legitimately be absent on a token this provider persisted (auth server omitted
        // the field). With `saved_at` present we treat that as "no expiry, use forever" per the OAuth spec.
        if (tokens.expires_in === undefined) {
            return tokens;
        }
        // Without this guard, a foreign object/array `expires_in` would coerce to NaN through the
        // arithmetic below and hand the SDK `expires_in: NaN`. Treat as untrusted: force a refresh.
        if (typeof tokens.expires_in !== 'number' || !Number.isFinite(tokens.expires_in)) {
            return { ...tokens, expires_in: 0 };
        }
        // The SDK expects expires_in to mean remaining lifetime from now, so adjust persisted values on read.
        const remainingMs = saved_at + tokens.expires_in * 1000 - Date.now();
        return { ...tokens, expires_in: Math.max(0, Math.floor(remainingMs / 1000)) };
    }

    saveTokens(tokens: OAuthTokens): Promise<void> {
        return this.write('tokens', { ...tokens, saved_at: Date.now() } as StoredOAuthTokens);
    }

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
        if (!this.active) {
            throw new MCPOAuthAuthorizationRequiredError();
        }
        if (!this.interactive) {
            // Non-interactive flows (autostart, workspace-restore) reject before reaching the frontend
            // delegate. Anchoring the decision in the provider — which knows interactivity at construction
            // time — keeps autostart from silently launching the user's external browser.
            console.debug(`Refusing non-interactive MCP OAuth authorization for server "${this.serverName}"; the user must initiate sign-in explicitly.`);
            throw new MCPOAuthAuthorizationRequiredError();
        }
        try {
            await this.frontendDelegate.openExternal(authorizationUrl.toString());
        } catch (error) {
            console.warn(`Failed to open MCP OAuth authorization URL for server "${this.serverName}".`, error);
            // Preserve the underlying cause on the thrown chain (ES2022 `cause`) so downstream error handlers
            // and the badge hover can surface the root reason; the warn above keeps it in logs as well.
            throw new MCPOAuthAuthorizationRequiredError({ cause: error });
        }
    }

    /**
     * Marks the provider inactive (rejects further `redirectToAuthorization` calls) and drops the
     * in-memory PKCE verifier. Use {@link cancel} for the full cleanup that also aborts a pending
     * callback await.
     */
    markInactive(): void {
        this.active = false;
        this.codeVerifierValue = undefined;
    }

    /**
     * Aborts this provider's OAuth flow: marks inactive and cancels the callback-service state,
     * releasing any in-flight {@link waitForAuthorization} await and recording a cancellation message
     * for a late-arriving browser callback.
     */
    cancel(message?: string): void {
        this.markInactive();
        this.callbackService.cancel(this.stateValue, message);
    }

    async waitForAuthorization(): Promise<string> {
        const callback = await this.callbackService.waitForCallback(this.stateValue);
        if (callback.error) {
            // Typed so MCPServer.doStart's catch can short-circuit the SSE fallback (which would
            // trigger a fresh authorization round-trip after the server already denied the previous one).
            throw new MCPOAuthAuthorizationServerError(callback.error, callback.errorDescription);
        }
        if (!callback.code) {
            throw new Error(nls.localize('theia/ai/mcp/oauth/missingAuthorizationCode',
                'MCP OAuth authorization callback did not include an authorization code.'));
        }
        return callback.code;
    }

    async saveCodeVerifier(codeVerifier: string): Promise<void> {
        if (this.active) {
            this.codeVerifierValue = codeVerifier;
        }
    }

    async codeVerifier(): Promise<string> {
        if (!this.codeVerifierValue) {
            throw new Error(nls.localize('theia/ai/mcp/oauth/signInSessionExpired', 'MCP OAuth sign-in session expired. Start the server again to sign in.'));
        }
        return this.codeVerifierValue;
    }

    async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
        const configuredResource = this.config.resource;
        if (configuredResource) {
            const configuredResourceUrl = new URL(configuredResource);
            if (!checkResourceAllowed({ requestedResource: serverUrl, configuredResource: configuredResourceUrl })) {
                throw new Error(nls.localize('theia/ai/mcp/oauth/configuredResourceMismatch',
                    'Configured MCP OAuth resource {0} does not match {1}.', configuredResource, serverUrl.toString()));
            }
            return configuredResourceUrl;
        }
        if (resource) {
            const resourceUrl = new URL(resource);
            if (!checkResourceAllowed({ requestedResource: serverUrl, configuredResource: resourceUrl })) {
                throw new Error(nls.localize('theia/ai/mcp/oauth/protectedResourceMismatch',
                    'Protected MCP OAuth resource {0} does not match {1}.', resource, serverUrl.toString()));
            }
            return resourceUrl;
        }
        const defaultResourceUrl = typeof serverUrl === 'string' ? new URL(serverUrl) : new URL(serverUrl.href);
        defaultResourceUrl.hash = '';
        return defaultResourceUrl;
    }

    async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
        if (this.config.authorizationServer
            && normalizeOAuthUrl(state.authorizationServerUrl) !== normalizeOAuthUrl(this.config.authorizationServer)) {
            throw new Error(nls.localize('theia/ai/mcp/oauth/authorizationServerMismatch',
                'Discovered MCP OAuth authorization server {0} does not match configured authorization server {1}.',
                state.authorizationServerUrl, this.config.authorizationServer));
        }
        await this.write('discovery', state);
    }

    async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
        const discovery = await this.read<OAuthDiscoveryState>('discovery');
        if (!discovery) {
            return undefined;
        }
        if (this.config.authorizationServer
            && normalizeOAuthUrl(discovery.authorizationServerUrl) !== normalizeOAuthUrl(this.config.authorizationServer)) {
            console.debug(
                `Ignoring stored MCP OAuth discovery state for server "${this.serverName}": stored authorization server `
                + `"${discovery.authorizationServerUrl}" does not match configured "${this.config.authorizationServer}". `
                + 'Re-discovering.'
            );
            return undefined;
        }
        return discovery;
    }

    async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
        if (scope === 'all') {
            this.codeVerifierValue = undefined;
            await Promise.all([
                this.delete('client'),
                this.delete('tokens'),
                this.delete('discovery')
            ]);
            return;
        }
        if (scope === 'verifier') {
            // Verifier invalidation is in-memory only because PKCE verifiers are never persisted.
            this.codeVerifierValue = undefined;
            return;
        }
        // 'client' / 'tokens' / 'discovery' deliberately preserve `codeVerifierValue`: dropping the
        // verifier here would break an in-flight `redirectToAuthorization` round-trip mid-handshake.
        await this.delete(scope);
    }

    getServerName(): string {
        return this.serverName;
    }

    getState(): string {
        return this.stateValue;
    }

    protected async readClientInformation(): Promise<OAuthClientInformationMixed | undefined> {
        const clientInformation = await this.read<OAuthClientInformationMixed>('client');
        return clientInformation && this.publicClientInformation(clientInformation);
    }

    protected publicClientInformation(clientInformation: OAuthClientInformationMixed): OAuthClientInformationMixed {
        // MCP OAuth runs as a public PKCE client and must not persist confidential client secrets.
        if (clientInformation.client_secret) {
            console.warn(`Ignoring OAuth client_secret returned for public MCP OAuth client registration for server "${this.serverName}".`);
        }
        const { client_secret, ...publicClientInformation } = clientInformation;
        return publicClientInformation;
    }

    protected async read<T extends StoredOAuthValue>(key: string): Promise<T | undefined> {
        const value = await this.keyStore.getPassword(MCP_OAUTH_KEYSTORE_SERVICE, this.account(key));
        if (!value) {
            return undefined;
        }
        try {
            return JSON.parse(value) as T;
        } catch (error) {
            // Self-heal corrupt entries (e.g. partial write, manual edit of the credential store) so the
            // SDK can re-acquire the value. The warn is deliberate: silent deletion leaves no audit trail.
            console.warn(`Discarding corrupt MCP OAuth value for server "${this.serverName}" key "${key}".`, error);
            await this.delete(key);
            return undefined;
        }
    }

    protected write(key: string, value: StoredOAuthValue): Promise<void> {
        return this.keyStore.setPassword(MCP_OAUTH_KEYSTORE_SERVICE, this.account(key), JSON.stringify(value));
    }

    protected delete(key: string): Promise<boolean> {
        return this.keyStore.deletePassword(MCP_OAUTH_KEYSTORE_SERVICE, this.account(key));
    }

    protected account(key: string): string {
        return `${this.accountPrefix}:${key}`;
    }
}
