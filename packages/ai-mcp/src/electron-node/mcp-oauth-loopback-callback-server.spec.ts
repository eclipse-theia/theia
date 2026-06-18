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
import * as http from 'http';
import { AddressInfo } from 'net';
import { MCPOAuthCallbackService } from '../node/mcp-oauth-callback-service';
import { MCPOAuthCallbackResponder } from '../node/mcp-oauth-callback-responder';
import {
    MCPOAuthLoopbackCallbackServer,
    MCP_OAUTH_CALLBACK_PORT_ENV,
    MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT,
    MCP_OAUTH_LOOPBACK_HOST
} from './mcp-oauth-loopback-callback-server';

class TestableMCPOAuthLoopbackCallbackServer extends MCPOAuthLoopbackCallbackServer {
    portOverride: number | undefined;

    protected override getConfiguredPort(): number {
        return this.portOverride ?? super.getConfiguredPort();
    }

    configuredPort(): number {
        return this.getConfiguredPort();
    }

    boundAddress(): AddressInfo | undefined {
        return this.server?.address() as AddressInfo | undefined;
    }
}

function createServer(): { server: TestableMCPOAuthLoopbackCallbackServer, callbackService: MCPOAuthCallbackService } {
    const callbackService = new MCPOAuthCallbackService();
    const responder = new MCPOAuthCallbackResponder();
    (responder as unknown as { callbackService: MCPOAuthCallbackService }).callbackService = callbackService;
    const server = new TestableMCPOAuthLoopbackCallbackServer();
    (server as unknown as { responder: MCPOAuthCallbackResponder }).responder = responder;
    // Bind an OS-assigned port to avoid clashing with the fixed default port in CI.
    server.portOverride = 0;
    return { server, callbackService };
}

function httpGet(url: string): Promise<{ status: number, body: string, headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
        }).on('error', reject);
    });
}

describe('MCPOAuthLoopbackCallbackServer', () => {

    describe('server', () => {
        let server: TestableMCPOAuthLoopbackCallbackServer;
        let callbackService: MCPOAuthCallbackService;

        beforeEach(() => {
            ({ server, callbackService } = createServer());
        });

        afterEach(() => {
            server.onStop();
        });

        it('binds 127.0.0.1 and advertises the loopback callback URL on the bound port', async () => {
            const redirectUrl = await server.getRedirectUrl();

            const address = server.boundAddress();
            expect(address?.address).to.equal(MCP_OAUTH_LOOPBACK_HOST);
            expect(redirectUrl).to.equal(`http://${MCP_OAUTH_LOOPBACK_HOST}:${address?.port}/mcp/oauth/callback`);
        });

        it('dispatches a GET with state+code to the callback service and renders the done page', async () => {
            const base = await server.getRedirectUrl();
            const state = callbackService.createState();
            const pending = callbackService.waitForCallback(state);

            const response = await httpGet(`${base}?state=${encodeURIComponent(state)}&code=authorization-code`);

            expect(response.status).to.equal(200);
            expect(response.body).to.contain('All done. You can close this tab now.');
            expect(response.headers['content-security-policy']).to.equal("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
            expect(response.headers['cache-control']).to.equal('no-store');
            const callback = await pending;
            expect(callback.code).to.equal('authorization-code');
        });

        it('renders the generic rejection page for a bogus state', async () => {
            const base = await server.getRedirectUrl();

            const response = await httpGet(`${base}?state=bogus-state&code=authorization-code`);

            expect(response.status).to.equal(400);
            expect(response.body).to.contain('Unknown or expired OAuth state.');
        });

        it('returns 404 for a request that is not the OAuth callback path', async () => {
            const base = await server.getRedirectUrl();
            const origin = new URL(base);

            const response = await httpGet(`http://${MCP_OAUTH_LOOPBACK_HOST}:${origin.port}/not/the/callback`);

            expect(response.status).to.equal(404);
        });
    });

    describe('getConfiguredPort', () => {
        const originalEnv = process.env[MCP_OAUTH_CALLBACK_PORT_ENV];

        afterEach(() => {
            if (originalEnv === undefined) {
                delete process.env[MCP_OAUTH_CALLBACK_PORT_ENV];
            } else {
                process.env[MCP_OAUTH_CALLBACK_PORT_ENV] = originalEnv;
            }
        });

        it('returns the fixed default port when the environment variable is unset', () => {
            delete process.env[MCP_OAUTH_CALLBACK_PORT_ENV];

            expect(new TestableMCPOAuthLoopbackCallbackServer().configuredPort()).to.equal(MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT);
        });

        it('honors a valid environment-variable override', () => {
            process.env[MCP_OAUTH_CALLBACK_PORT_ENV] = '40123';

            expect(new TestableMCPOAuthLoopbackCallbackServer().configuredPort()).to.equal(40123);
        });

        it('falls back to the default for an invalid environment-variable value', () => {
            process.env[MCP_OAUTH_CALLBACK_PORT_ENV] = 'not-a-port';
            const originalWarn = console.warn;
            console.warn = () => { /* suppress fallback diagnostic */ };
            try {
                expect(new TestableMCPOAuthLoopbackCallbackServer().configuredPort()).to.equal(MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT);
            } finally {
                console.warn = originalWarn;
            }
        });
    });
});
