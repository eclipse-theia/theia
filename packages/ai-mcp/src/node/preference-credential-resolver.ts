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
 * Default, lowest-priority {@link MCPCredentialResolver} contribution.
 *
 * Today's `MCPServer` reads `description.serverAuthToken` directly when
 * constructing HTTP headers; this resolver preserves that behaviour by
 * returning the same value through the new resolver chain. The server
 * passes the already-read `serverAuthToken` as the request's `field`
 * default so that higher-priority plugin resolvers can take over when
 * present, and this resolver is only consulted as the final fallback.
 */
@injectable()
export class PreferenceCredentialResolver implements MCPCredentialResolver {

    readonly id = 'preference';
    readonly priority = 0;

    async resolve(_request: MCPCredentialRequest): Promise<string | undefined> {
        // In Phase B this resolver is a no-op; the current value passed in
        // from the server description is the authoritative source. Phase C
        // extends this to understand the `${mcp:credential}` sentinel and
        // pull from a dedicated preference path.
        return undefined;
    }
}
