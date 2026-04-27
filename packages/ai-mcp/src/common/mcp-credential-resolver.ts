// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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

/**
 * A request for a single credential, issued by the MCP server manager when
 * starting or (re-)authenticating a server. Resolvers can use the `kind`
 * hint to mask or obtain the value appropriately.
 */
export interface MCPCredentialRequest {
    /** The configured server name (e.g. `github`, `linear`). */
    serverName: string;

    /** The remote server URL for HTTP/SSE servers; `undefined` for local stdio. */
    serverUrl?: string;

    /**
     * Symbolic field identifier. For the built-in resolver this matches the
     * preference key suffix (e.g. `serverAuthToken`). Plugins can match on
     * their own prefixes (e.g. fields starting with `VAULT_`).
     */
    field: string;

    /** Optional operator-facing label for interactive prompts. */
    label?: string;

    /** Hint for how to render / mask the credential. */
    kind?: 'bearer-token' | 'api-key' | 'username-password' | 'oauth';

    /**
     * The literal value read from the server description for this field,
     * if any. Resolvers that interpret a sentinel placeholder (e.g.
     * `${env:GITHUB_TOKEN}` or `${mcp:credential}`) use this to decide
     * whether to resolve or defer. Plugins that ignore the literal and
     * resolve purely from external sources can leave this unread.
     */
    literal?: string;
}

export const MCPCredentialResolver = Symbol('MCPCredentialResolver');

/**
 * Contribution point for credential resolution. The MCP server manager asks
 * every registered resolver in descending-priority order; the first
 * non-`undefined` return wins. Returning `undefined` defers to the next
 * resolver. Errors are treated as `undefined` so one broken resolver cannot
 * block the chain.
 *
 * Typical use cases:
 *   - OAuth flows launching a browser and persisting tokens.
 *   - OS keychain access (`keytar`, `libsecret`).
 *   - Enterprise vaults (HashiCorp, 1Password CLI, AWS Secrets Manager).
 *
 * The built-in `PreferenceCredentialResolver` reads from Theia's preferences
 * and runs at priority `0`, so existing deployments keep their current
 * behaviour.
 */
export interface MCPCredentialResolver {
    readonly id: string;
    readonly priority?: number;

    resolve(request: MCPCredentialRequest): Promise<string | undefined>;
}
