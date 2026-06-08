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

import { expect } from 'chai';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { MCPOAuthFrontendDelegate } from '../common/mcp-oauth';
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';
import { MCPOAuthCallbackEndpoint } from './mcp-oauth-callback-endpoint';
import { MCPOAuthClientProviderFactory } from './mcp-oauth-client-provider-factory';

const FRONTEND_CALLBACK_URL = 'http://frontend.example/mcp/oauth/callback';
const LOOPBACK_CALLBACK_URL = 'http://127.0.0.1:28932/mcp/oauth/callback';

function createFactory(callbackEndpoint?: MCPOAuthCallbackEndpoint): { factory: MCPOAuthClientProviderFactory, calls: { frontend: number } } {
    const calls = { frontend: 0 };
    const factory = new MCPOAuthClientProviderFactory();
    (factory as unknown as { keyStore: KeyStoreService }).keyStore = {} as KeyStoreService;
    (factory as unknown as { callbackService: MCPOAuthCallbackService }).callbackService =
        { createState: () => 'state' } as unknown as MCPOAuthCallbackService;
    (factory as unknown as { frontendDelegate: MCPOAuthFrontendDelegate }).frontendDelegate = {
        openExternal: async () => undefined,
        getCallbackUrl: async () => { calls.frontend++; return FRONTEND_CALLBACK_URL; },
        setClient: () => undefined,
        disconnectClient: () => undefined
    };
    (factory as unknown as { callbackEndpoint?: MCPOAuthCallbackEndpoint }).callbackEndpoint = callbackEndpoint;
    return { factory, calls };
}

describe('MCPOAuthClientProviderFactory', () => {

    it('advertises the loopback redirect URL when an MCPOAuthCallbackEndpoint is bound (Electron)', async () => {
        const { factory, calls } = createFactory({ getRedirectUrl: async () => LOOPBACK_CALLBACK_URL });

        const provider = await factory.create('srv', 'https://mcp.example.com/mcp', {}, { interactive: false });

        expect(provider.redirectUrl).to.equal(LOOPBACK_CALLBACK_URL);
        // The endpoint takes precedence; the connection-scoped frontend delegate is not consulted.
        expect(calls.frontend).to.equal(0);
    });

    it('falls back to the frontend delegate callback URL when no endpoint is bound (browser/hosted)', async () => {
        const { factory, calls } = createFactory(undefined);

        const provider = await factory.create('srv', 'https://mcp.example.com/mcp', {}, { interactive: false });

        expect(provider.redirectUrl).to.equal(FRONTEND_CALLBACK_URL);
        expect(calls.frontend).to.equal(1);
    });
});
