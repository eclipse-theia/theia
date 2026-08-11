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

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MCPOAuthCallbackEndpoint } from '../node/mcp-oauth-callback-endpoint';
import { MCPOAuthLoopbackCallbackServer } from './mcp-oauth-loopback-callback-server';

/**
 * Electron-only backend module. Binds the RFC 8252 loopback callback server as the
 * {@link MCPOAuthCallbackEndpoint}, so OAuth redirects from the user's external system browser are
 * delivered to `http://127.0.0.1:<port>/mcp/oauth/callback` on a dedicated loopback HTTP server
 * that is not behind the Electron security-token cookie middleware. See
 * `mcp-oauth-loopback-callback-server.ts` for the security argument.
 */
export default new ContainerModule(bind => {
    bind(MCPOAuthLoopbackCallbackServer).toSelf().inSingletonScope();
    bind(MCPOAuthCallbackEndpoint).toService(MCPOAuthLoopbackCallbackServer);
    bind(BackendApplicationContribution).toService(MCPOAuthLoopbackCallbackServer);
});
