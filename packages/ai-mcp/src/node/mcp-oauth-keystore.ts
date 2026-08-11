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

import { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { MCPOAuthConfig } from '../common/mcp-oauth';

/** Keystore service name under which all MCP OAuth credentials are stored. */
export const MCP_OAUTH_KEYSTORE_SERVICE = 'theia-ai-mcp-oauth';

/**
 * Safety margin subtracted from a token's remaining lifetime by the autostart-eligibility check
 * (`MCPOAuthCredentialStore.hasUnexpiredAccessToken`), so a server with a near-expiry token is not
 * silently autostarted. Deliberately NOT applied on the provider's runtime `tokens()` read path.
 */
export const MCP_OAUTH_TOKEN_EXPIRY_BUFFER_MS = 30 * 1000;

export type StoredOAuthValue = OAuthClientInformationMixed | OAuthTokens | OAuthDiscoveryState;
export type StoredOAuthTokens = OAuthTokens & { saved_at?: number };

/**
 * Normalizes an OAuth URL so trailing-slash variants compare equal. Shared so {@link deriveCredentialScope}
 * and `MCPServerManagerImpl`'s scope-change check use the SAME normalization — otherwise a no-op edit
 * could wipe credentials whose storage key has not changed.
 */
export function normalizeOAuthUrl(url: string): string {
    return new URL(url).toString();
}

/** The normalized keystore-key component that isolates a server's stored credentials per resource/URL. See {@link normalizeOAuthUrl}. */
export function deriveCredentialScope(serverUrl: string, config: MCPOAuthConfig): string {
    return normalizeOAuthUrl(config.resource ?? serverUrl);
}

export function mcpOAuthAccountPrefix(serverName: string, credentialScope: string): string {
    // `encodeURIComponent` escapes `:` to `%3A` in both segments, so the only `:` characters in the
    // result are the two literal separators we control.
    return `${encodeURIComponent(serverName)}:${encodeURIComponent(credentialScope)}`;
}

export function mcpOAuthAccount(serverName: string, credentialScope: string, key: string): string {
    return `${mcpOAuthAccountPrefix(serverName, credentialScope)}:${key}`;
}

export function parseStoredTokens(value: string | undefined): StoredOAuthTokens | undefined {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(value) as StoredOAuthTokens;
    } catch {
        return undefined;
    }
}
