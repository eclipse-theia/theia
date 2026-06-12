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
import { MCPOAuthFrontendDelegateClient } from '../common/mcp-oauth';
import { MCPOAuthCallbackEndpoint } from './mcp-oauth-callback-endpoint';
import { MCPOAuthFrontendDelegateImpl } from './mcp-oauth-frontend-delegate';

class TestOAuthFrontendDelegateClient implements MCPOAuthFrontendDelegateClient {
    prepareAuthorizationCalls = 0;

    prepareAuthorizationSync(): boolean {
        this.prepareAuthorizationCalls++;
        return true;
    }

    isAuthorizationPending(): boolean {
        return false;
    }

    clearPreparedAuthorization(): void { }

    async openExternal(): Promise<void> { }

    async getCallbackUrl(): Promise<string> {
        return 'http://localhost/mcp/oauth/callback';
    }
}

describe('MCPOAuthFrontendDelegateImpl', () => {
    it('throws before a frontend client is set', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();

        try {
            await delegate.getCallbackUrl();
            throw new Error('Expected missing client error');
        } catch (error) {
            expect((error as Error).message).to.equal('MCP OAuth frontend delegate client not set.');
        }
    });

    it('delegates to the current frontend client', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();
        const client = new TestOAuthFrontendDelegateClient();

        delegate.setClient(client);

        expect(await delegate.getCallbackUrl()).to.equal('http://localhost/mcp/oauth/callback');
    });

    it('rejects a second frontend client in the same connection container', () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();
        delegate.setClient(new TestOAuthFrontendDelegateClient());

        expect(() => delegate.setClient(new TestOAuthFrontendDelegateClient()))
            .to.throw('MCP OAuth frontend delegate is scoped to a single frontend connection.');
    });

    it('clears the frontend client on disconnect', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();
        const client = new TestOAuthFrontendDelegateClient();
        delegate.setClient(client);

        delegate.disconnectClient(client);

        try {
            await delegate.getCallbackUrl();
            throw new Error('Expected missing client error');
        } catch (error) {
            expect((error as Error).message).to.equal('MCP OAuth frontend delegate client not set.');
        }
    });

    it('prefers the loopback callback endpoint for the effective redirect URL (Electron)', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();
        const endpoint: MCPOAuthCallbackEndpoint = { getRedirectUrl: async () => 'http://127.0.0.1:28932/mcp/oauth/callback' };
        (delegate as unknown as { callbackEndpoint?: MCPOAuthCallbackEndpoint }).callbackEndpoint = endpoint;
        delegate.setClient(new TestOAuthFrontendDelegateClient());

        expect(await delegate.getEffectiveRedirectUrl()).to.equal('http://127.0.0.1:28932/mcp/oauth/callback');
    });

    it('falls back to the frontend client callback URL for the effective redirect URL (browser/hosted)', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();
        delegate.setClient(new TestOAuthFrontendDelegateClient());

        expect(await delegate.getEffectiveRedirectUrl()).to.equal('http://localhost/mcp/oauth/callback');
    });

    it('fails the effective redirect URL without a callback endpoint or frontend client', async () => {
        const delegate = new MCPOAuthFrontendDelegateImpl();

        try {
            await delegate.getEffectiveRedirectUrl();
            throw new Error('Expected missing client error');
        } catch (error) {
            expect((error as Error).message).to.equal('MCP OAuth frontend delegate client not set.');
        }
    });
});
