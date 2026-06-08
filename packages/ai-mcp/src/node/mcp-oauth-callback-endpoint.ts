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

export const MCPOAuthCallbackEndpoint = Symbol('MCPOAuthCallbackEndpoint');

/**
 * Optional, process-global source of the OAuth `redirect_uri` advertised to the authorization
 * server. Electron binds the loopback callback server here so the redirect is delivered to
 * `http://127.0.0.1:<port>/mcp/oauth/callback`, outside the security-token cookie middleware.
 * Browser/hosted leaves it unbound and `MCPOAuthClientProviderFactory` falls back to the frontend
 * delegate's origin-based callback URL (the only component that knows the public frontend origin).
 */
export interface MCPOAuthCallbackEndpoint {
    /** The `redirect_uri` to advertise to the authorization server. */
    getRedirectUrl(): Promise<string>;
}
