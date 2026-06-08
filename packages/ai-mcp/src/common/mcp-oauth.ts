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

export const MCP_OAUTH_CALLBACK_PATH = '/mcp/oauth/callback';

export interface MCPOAuthConfig {
    enabled?: boolean;
    clientId?: string;
    scopes?: string[];
    authorizationServer?: string;
    resource?: string;
}

export interface MCPOAuthCallback {
    state: string;
    code?: string;
    error?: string;
    errorDescription?: string;
}

export const MCPOAuthFrontendDelegateClient = Symbol('MCPOAuthFrontendDelegateClient');
export interface MCPOAuthFrontendDelegateClient {
    /**
     * Launches the authorization URL in the user's default browser.
     */
    openExternal(url: string): Promise<void>;

    getCallbackUrl(): Promise<string>;
}

export const MCPOAuthFrontendDelegate = Symbol('MCPOAuthFrontendDelegate');

/**
 * Backend-side bridge to the browser client for OAuth operations that must run in the frontend.
 */
export interface MCPOAuthFrontendDelegate extends Pick<MCPOAuthFrontendDelegateClient, 'openExternal' | 'getCallbackUrl'> {
    setClient(client: MCPOAuthFrontendDelegateClient): void;
    disconnectClient(client: MCPOAuthFrontendDelegateClient): void;
}

export const mcpOAuthFrontendDelegatePath = '/services/mcpOAuthFrontendDelegate';
