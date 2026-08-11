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
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { MCPOAuthConfig } from '../common/mcp-oauth';
import {
    deriveCredentialScope,
    MCP_OAUTH_KEYSTORE_SERVICE,
    MCP_OAUTH_TOKEN_EXPIRY_BUFFER_MS,
    mcpOAuthAccount,
    parseStoredTokens,
    StoredOAuthTokens
} from './mcp-oauth-keystore';

/**
 * Reads and clears MCP OAuth credentials in the keystore without needing an active provider — used
 * for the autostart-eligibility check ({@link hasTokens}) and credential cleanup ({@link clear}).
 */
@injectable()
export class MCPOAuthCredentialStore {

    @inject(KeyStoreService)
    protected readonly keyStore: KeyStoreService;

    async hasTokens(serverName: string, serverUrl: string, config: MCPOAuthConfig): Promise<boolean> {
        const account = mcpOAuthAccount(serverName, deriveCredentialScope(serverUrl, config), 'tokens');
        const value = await this.keyStore.getPassword(MCP_OAUTH_KEYSTORE_SERVICE, account);
        if (value === undefined) {
            return false;
        }
        const tokens = parseStoredTokens(value);
        if (!tokens) {
            // Discard corrupt entries: a stale blob would otherwise block autostart until manual re-sign-in.
            console.warn(`Discarding corrupt MCP OAuth tokens for server "${serverName}" while checking autostart eligibility.`);
            await this.keyStore.deletePassword(MCP_OAUTH_KEYSTORE_SERVICE, account);
            return false;
        }
        return this.isUsableTokenString(tokens.refresh_token) || this.hasUnexpiredAccessToken(tokens);
    }

    protected isUsableTokenString(value: unknown): boolean {
        return typeof value === 'string' && value.length > 0;
    }

    protected hasUnexpiredAccessToken(tokens: StoredOAuthTokens): boolean {
        if (!this.isUsableTokenString(tokens.access_token)) {
            return false;
        }
        // Check saved_at first: only tokens this provider persisted carry it, so a hand-edited entry
        // without saved_at must not reach the `expires_in === undefined -> no expiry` branch below and
        // enable autostart on a stale token.
        if (tokens.saved_at === undefined) {
            return false;
        }
        if (tokens.expires_in === undefined) {
            return true; // auth server omitted expiry -> treat as non-expiring per the OAuth spec
        }
        // Subtract a buffer so a near-expiry token is not autostarted. The provider's `tokens()` read
        // path deliberately omits this buffer so the SDK can spend a token down to its last second.
        return Date.now() < tokens.saved_at + tokens.expires_in * 1000 - MCP_OAUTH_TOKEN_EXPIRY_BUFFER_MS;
    }

    async clear(serverName: string): Promise<void> {
        // Scan by serverName prefix so credentials left at a stale scope (after a URL/resource change)
        // are also removed. The snapshot-then-delete race is benign: production callers stop() the
        // server first, so only post-close background SDK writes could slip through.
        const accountPrefix = `${encodeURIComponent(serverName)}:`;
        const accounts = await this.keyStore.keys(MCP_OAUTH_KEYSTORE_SERVICE);
        await Promise.all(accounts
            .filter(account => account.startsWith(accountPrefix))
            .map(account => this.keyStore.deletePassword(MCP_OAUTH_KEYSTORE_SERVICE, account))
        );
    }
}
