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

import { injectable } from '@theia/core/shared/inversify';
import {
    MCPCredentialRequest,
    MCPCredentialResolver,
} from '../common/mcp-credential-resolver';

/**
 * Pattern matching `${env:NAME}` — the NAME capture group is the
 * environment variable to look up via `process.env`.
 */
const ENV_SENTINEL_RE = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Resolves credentials written as `${env:VAR_NAME}` in the server
 * description by looking up `process.env[VAR_NAME]`. Runs at the middle
 * of the resolver chain (priority 50) so plugin resolvers with higher
 * priority can still win, and the lowest-priority preference resolver
 * remains a fallback.
 *
 * Intended use cases:
 *   - Keeping API keys out of settings.json by pointing at an env var
 *     the operator exports from their shell or systemd unit.
 *   - CI/CD where credentials are already in the environment.
 *
 * The resolver matches on the **value** of the request's `field`: the
 * server manager reads `description.serverAuthToken` (or whatever other
 * field is being resolved), checks for the sentinel shape, and hands
 * that string to the chain. The chain member that recognises the shape
 * returns the resolved value.
 */
@injectable()
export class EnvCredentialResolver implements MCPCredentialResolver {

    readonly id = 'env';
    readonly priority = 50;

    async resolve(request: MCPCredentialRequest): Promise<string | undefined> {
        const literal = (request as MCPCredentialRequest & { literal?: string }).literal;
        if (!literal) {
            return undefined;
        }
        const match = literal.match(ENV_SENTINEL_RE);
        if (!match) {
            return undefined;
        }
        const value = process.env[match[1]];
        if (!value || value.length === 0) {
            console.warn(
                `[@theia/ai-mcp] EnvCredentialResolver: server "${request.serverName}" ` +
                `asked for env var "${match[1]}" but it is not set.`,
            );
            return undefined;
        }
        return value;
    }
}
