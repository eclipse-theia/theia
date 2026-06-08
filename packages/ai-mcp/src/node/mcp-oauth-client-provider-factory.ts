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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { MCPOAuthConfig, MCPOAuthFrontendDelegate } from '../common/mcp-oauth';
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';
import { MCPOAuthCallbackEndpoint } from './mcp-oauth-callback-endpoint';
import { MCPOAuthClientProvider } from './mcp-oauth-client-provider';
import { deriveCredentialScope } from './mcp-oauth-keystore';

/**
 * Connection-scoped factory for {@link MCPOAuthClientProvider}. Wires each provider to the shared
 * callback service and the connection's cached callback URL. Per-flow lifecycle (cancellation,
 * waiting for the callback) is owned by the provider; credential storage is owned by
 * `MCPOAuthCredentialStore`. This class only constructs providers.
 */
@injectable()
export class MCPOAuthClientProviderFactory {

    @inject(KeyStoreService)
    protected readonly keyStore: KeyStoreService;

    @inject(MCPOAuthFrontendDelegate)
    protected readonly frontendDelegate: MCPOAuthFrontendDelegate;

    @inject(MCPOAuthCallbackService)
    protected readonly callbackService: MCPOAuthCallbackService;

    /**
     * Process-global override for the redirect URI source. Bound in Electron (the loopback callback
     * server); unbound in browser/hosted, where the connection-scoped frontend delegate's
     * origin-based callback URL is the only component that knows the public frontend origin.
     * `@optional()` resolves the root binding from this connection-scoped factory (child containers
     * resolve parent bindings) and is `undefined` when not bound.
     */
    @inject(MCPOAuthCallbackEndpoint) @optional()
    protected readonly callbackEndpoint?: MCPOAuthCallbackEndpoint;

    protected callbackUrlPromise: Promise<string> | undefined;

    async create(serverName: string, serverUrl: string, config: MCPOAuthConfig, options: { interactive: boolean }): Promise<MCPOAuthClientProvider> {
        const callbackUrl = await this.getCallbackUrl();
        const state = this.callbackService.createState();
        return new MCPOAuthClientProvider({
            serverName,
            config,
            callbackUrl,
            stateValue: state,
            credentialScope: deriveCredentialScope(serverUrl, config),
            keyStore: this.keyStore,
            frontendDelegate: this.frontendDelegate,
            callbackService: this.callbackService,
            interactive: options.interactive
        });
    }

    protected getCallbackUrl(): Promise<string> {
        // Cached for this connection-scoped factory; a new frontend connection gets a new instance.
        // On rejection we clear the cache so the next start retries instead of returning the poisoned
        // failure forever. Clearing on the cached promise lets parallel awaiters receive the rejection too.
        if (!this.callbackUrlPromise) {
            // Electron binds MCPOAuthCallbackEndpoint (the loopback server); browser/hosted leaves it
            // unbound and falls back to the frontend delegate's origin-based callback URL.
            const pending = this.callbackEndpoint
                ? this.callbackEndpoint.getRedirectUrl()
                : this.frontendDelegate.getCallbackUrl();
            this.callbackUrlPromise = pending;
            pending.catch(() => {
                if (this.callbackUrlPromise === pending) {
                    this.callbackUrlPromise = undefined;
                }
            });
        }
        return this.callbackUrlPromise;
    }
}
