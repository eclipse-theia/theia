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

import { nls } from '@theia/core/lib/common/nls';

export class MCPOAuthAuthorizationRequiredError extends Error {
    /**
     * The `cause` carries the underlying error from a failed `openExternal` so steady-state error handlers
     * and the badge hover can surface the root cause; the localized `message` stays user-facing.
     */
    constructor(options?: { cause?: unknown }) {
        super(
            nls.localize('theia/ai/mcp/oauth/authorizationRequiredFromUi', 'MCP OAuth authorization is required. Start the server from the UI to sign in.'),
            options
        );
        this.name = 'MCPOAuthAuthorizationRequiredError';
    }
}

/**
 * Thrown when the OAuth authorization server replies to the callback with an `error` parameter
 * (e.g. `access_denied`, `server_error`). Distinct from a transport-level failure so the start
 * orchestration in `MCPServer.doStart` does not silently fall back to SSE and trigger a fresh
 * authorization round-trip after the user already saw the authorization server's denial.
 */
export class MCPOAuthAuthorizationServerError extends Error {
    constructor(
        public readonly authorizationServerError: string,
        public readonly authorizationServerErrorDescription: string | undefined
    ) {
        super(authorizationServerErrorDescription ?? authorizationServerError);
        this.name = 'MCPOAuthAuthorizationServerError';
    }
}
