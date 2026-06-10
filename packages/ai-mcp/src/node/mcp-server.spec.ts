// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { InvalidScopeError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { MCPServer } from './mcp-server';
import { MCPOAuthClientProvider } from './mcp-oauth-client-provider';
import { MCPOAuthClientProviderFactory } from './mcp-oauth-client-provider-factory';
import { MCPOAuthAuthorizationRequiredError, MCPOAuthAuthorizationServerError } from './mcp-oauth-errors';
import { MCPOAuthCancelledError } from './mcp-oauth-callback-service';
import { MCPServerDescription, MCPServerStatus } from '../common';

class TestClient {
    connectCalls = 0;
    closeCalls = 0;
    onerror?: (error: Error) => void;
    protected readonly connectErrors: Error[];

    constructor(connectErrors: boolean | Error[] = false) {
        this.connectErrors = connectErrors === true ? [new UnauthorizedError()] : connectErrors || [];
    }

    async connect(): Promise<void> {
        this.connectCalls++;
        const error = this.connectErrors.shift();
        if (error) {
            this.onerror?.(error);
            throw error;
        }
    }

    async close(): Promise<void> {
        this.closeCalls++;
    }

    async listTools(): Promise<{ tools: [] }> {
        return { tools: [] };
    }
}

class TestOAuthProvider {
    cancelCalls = 0;
    readonly invalidateCalls: string[] = [];

    constructor(protected readonly onWaitForAuthorization?: () => void) { }

    cancel(): void {
        this.cancelCalls++;
    }

    async invalidateCredentials(scope: string): Promise<void> {
        this.invalidateCalls.push(scope);
    }

    markInactive(): void {
        // unused; cancel() is the production path in MCPServer
    }

    async waitForAuthorization(): Promise<string> {
        this.onWaitForAuthorization?.();
        return 'authorization-code';
    }
}

class TestOAuthClientProviderFactory implements Partial<MCPOAuthClientProviderFactory> {
    createCalls = 0;
    readonly providersCreated: TestOAuthProvider[] = [];

    constructor(protected readonly onWaitForAuthorization?: () => void) { }

    async create(): Promise<MCPOAuthClientProvider> {
        this.createCalls++;
        const provider = new TestOAuthProvider(this.onWaitForAuthorization);
        this.providersCreated.push(provider);
        return provider as unknown as MCPOAuthClientProvider;
    }

    /** Total `cancel()` calls across every provider this factory created. */
    get totalCancelCalls(): number {
        return this.providersCreated.reduce((sum, provider) => sum + provider.cancelCalls, 0);
    }
}

/**
 * Returns a minimal MCPOAuthClientProvider-shaped mock for direct calls to `testConnectTransport`.
 * Tests that go through the full server.start() path get a real-shaped TestOAuthProvider via the
 * coordinator; this helper is for tests that bypass the coordinator.
 */
function makeAuthProviderMock(extras: object = {}): MCPOAuthClientProvider {
    return {
        waitForAuthorization: async () => 'authorization-code',
        ...extras
    } as unknown as MCPOAuthClientProvider;
}

class TestMCPServer extends MCPServer {
    readonly clients: TestClient[] = [];
    readonly transports: StreamableHTTPClientTransport[] = [];
    readonly sseTransports: Transport[] = [];
    finishedAuthCode?: string;
    readonly terminateSessionCalls: StreamableHTTPClientTransport[] = [];
    readonly oauthFactory: TestOAuthClientProviderFactory;

    constructor(
        onWaitForAuthorization?: () => void,
        protected readonly clientErrors: Error[][] = []
    ) {
        const oauthFactory = new TestOAuthClientProviderFactory(onWaitForAuthorization);
        super(
            { name: 'test', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } },
            oauthFactory as unknown as MCPOAuthClientProviderFactory
        );
        this.oauthFactory = oauthFactory;
    }

    setInitialState(client: TestClient, transport: StreamableHTTPClientTransport): void {
        (this as unknown as { client: Client }).client = client as unknown as Client;
        (this as unknown as { transport: Transport }).transport = transport;
    }

    testConnectTransport(authProvider: MCPOAuthClientProvider): Promise<void> {
        return this.connectTransport(authProvider, undefined);
    }

    testHandleStartupError(error: unknown): Promise<void> {
        return this.handleStartupError(error);
    }

    testConfigureErrorHandlers(): void {
        this.configureErrorHandlers();
    }

    testSetStatus(status: MCPServerStatus): void {
        this.setStatus(status);
    }

    protected override createClient(): Client {
        const client = new TestClient(this.clientErrors.shift() ?? []);
        this.clients.push(client);
        return client as unknown as Client;
    }

    protected override createStreamableHttpTransport(): StreamableHTTPClientTransport {
        const transport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        transport.finishAuth = async code => {
            this.finishedAuthCode = code;
        };
        transport.terminateSession = async () => {
            this.terminateSessionCalls.push(transport);
        };
        this.transports.push(transport);
        return transport;
    }

    protected override createSSETransport(): SSEClientTransport {
        const transport = new SSEClientTransport(new URL('https://mcp.example.com/mcp'));
        this.sseTransports.push(transport);
        return transport;
    }
}

async function withConsoleErrorsSuppressed(fn: () => Promise<void>): Promise<void> {
    const originalConsoleError = console.error;
    console.error = () => { };
    try {
        await fn();
    } finally {
        console.error = originalConsoleError;
    }
}

async function withConsoleOutputSuppressed(fn: () => Promise<void>): Promise<void> {
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    console.log = () => { };
    console.warn = () => { };
    try {
        await fn();
    } finally {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
    }
}

describe('MCPServer OAuth reconnect', () => {
    it('waits for authorization and reconnects with a fresh client and transport', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);

        await server.testConnectTransport(makeAuthProviderMock());

        expect(server.finishedAuthCode).to.equal('authorization-code');
        expect(initialClient.closeCalls).to.equal(1);
        expect(server.clients.length).to.equal(1);
        expect(server.clients[0].connectCalls).to.equal(1);
        expect(server.transports.length).to.equal(1);
        expect(server.transports[0]).to.not.equal(initialTransport);
    });

    it('reflects the Connecting status during the finishAuth reconnect window', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);

        const statusEvents: MCPServerStatus[] = [];
        server.onDidUpdateStatus(status => statusEvents.push(status));

        await server.testConnectTransport(makeAuthProviderMock());

        // The user already finished sign-in by the time we get here; pinning AuthenticationRequired
        // throughout would prevent the UI from showing the Connecting affordance during the final reconnect.
        expect(statusEvents).to.deep.equal([MCPServerStatus.AuthenticationRequired, MCPServerStatus.Connecting]);
    });

    it('does not fall back to SSE when the authorization server replies with an OAuth error', async () => {
        const server = new TestMCPServer(
            () => { throw new MCPOAuthAuthorizationServerError('access_denied', 'The user denied the request.'); },
            [[new UnauthorizedError()]]
        );

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('The user denied the request.');
        // Critical regression assertion: the SSE fallback path would create a second OAuth provider and
        // navigate the user to a fresh sign-in popup after they already saw the authorization server's denial.
        expect(server.oauthFactory.createCalls).to.equal(1);
        expect(server.sseTransports).to.have.length(0);
        expect(server.clients[0].closeCalls).to.equal(1);
    });

    it('does not fall back to SSE when the SDK auth flow re-throws an OAuth error response', async () => {
        // auth() self-heals invalid_grant/invalid_client but re-throws every other OAuth error response raw;
        // treating those as transport failures would replay the identical failing flow over SSE.
        const server = new TestMCPServer(undefined, [[new InvalidScopeError('The requested scope is invalid.')]]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('invalid_scope');
        expect((await server.getDescription()).error).to.contain('The requested scope is invalid.');
        expect(server.oauthFactory.createCalls).to.equal(1);
        expect(server.sseTransports).to.have.length(0);
        // Stored credentials are invalidated so the next interactive start runs a fresh authorization.
        expect(server.oauthFactory.providersCreated[0].invalidateCalls).to.deep.equal(['tokens', 'discovery']);
    });

    it('does not fall back to SSE when the authorization server lacks a required OAuth capability', async () => {
        // 'Incompatible auth server:' errors are configuration outcomes; the SSE fallback would re-run the
        // identical failing discovery in a second authorization round-trip.
        const server = new TestMCPServer(undefined, [[new Error('Incompatible auth server: does not support dynamic client registration')]]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.Errored);
        expect((await server.getDescription()).error).to.contain('does not support dynamic client registration');
        expect(server.sseTransports).to.have.length(0);
        expect(server.oauthFactory.createCalls).to.equal(1);
    });

    it('cleans up startup when OAuth is intentionally cancelled during Streamable HTTP connect', async () => {
        const server = new TestMCPServer(() => { throw new MCPOAuthCancelledError(); }, [[new UnauthorizedError()]]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
        expect(server.clients[0].closeCalls).to.equal(1);
        // doStart's finally calls provider.cancel() to release any pending callback await.
        expect(server.oauthFactory.totalCancelCalls).to.equal(1);
        expect(server.sseTransports).to.have.length(0);
    });

    it('does not mark the server errored when OAuth is intentionally cancelled', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        server.setInitialState(initialClient, new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp')));
        server.testSetStatus(MCPServerStatus.AuthenticationRequired);

        await server.testHandleStartupError(new MCPOAuthCancelledError());

        expect(initialClient.closeCalls).to.equal(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('ignores expected OAuth Unauthorized events during the OAuth connection handshake', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);
        server.testConfigureErrorHandlers();

        await server.testConnectTransport(makeAuthProviderMock());

        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('ignores asynchronous OAuth Unauthorized events during the authorization window', async () => {
        const clientRef: { current?: TestClient } = {};
        // The asynchronous Unauthorized arrives via the provider's waitForAuthorization callback.
        const server = new TestMCPServer();
        const authProvider = makeAuthProviderMock({
            waitForAuthorization: async () => {
                clientRef.current?.onerror?.(new UnauthorizedError());
                return 'authorization-code';
            }
        });
        const initialClient = new TestClient(true);
        clientRef.current = initialClient;
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);
        server.testConfigureErrorHandlers();

        await server.testConnectTransport(authProvider);

        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('clears an error recorded by a transient onerror once the OAuth reconnect succeeds', async () => {
        // The SDK can emit non-fatal asynchronous errors (e.g. a failing GET/SSE notification stream)
        // through `onerror` while `connect()` itself still resolves. The steady-state handler records the
        // error before the start attempt completes; it must not survive into the Connected state, where
        // the UI would show "Connected" and an error indicator at the same time.
        const server = new TestMCPServer(undefined, [[new UnauthorizedError()], []]);
        const originalCreateClient = (server as unknown as { createClient: () => Client }).createClient.bind(server);
        (server as unknown as { createClient: () => Client }).createClient = () => {
            const client = originalCreateClient() as unknown as TestClient;
            if (server.clients.length === 2) {
                // The reconnect client: fire a non-OAuth transport error while its connect still succeeds.
                const originalConnect = client.connect.bind(client);
                client.connect = async () => {
                    client.onerror?.(new Error('GET stream failed'));
                    return originalConnect();
                };
            }
            return client as unknown as Client;
        };

        await withConsoleOutputSuppressed(async () => {
            await withConsoleErrorsSuppressed(async () => {
                await server.start();
            });
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.Connected);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('falls back to SSE for OAuth-enabled servers when Streamable HTTP fails without Unauthorized', async () => {
        const server = new TestMCPServer(undefined, [[new Error('streamable http unavailable')], []]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.sseTransports.length).to.equal(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.Connected);
    });

    it('terminates the previous Streamable HTTP session when falling back to SSE', async () => {
        const server = new TestMCPServer(undefined, [[new Error('streamable http unavailable')], []]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        // Mirrors stop() and the finishAuth reconnect path: any server-side session created by the failed
        // Streamable HTTP connect attempt is cleaned up best-effort instead of being left to time out.
        expect(server.terminateSessionCalls).to.have.length(1);
        expect(server.terminateSessionCalls[0]).to.equal(server.transports[0]);
    });

    it('continues the SSE fallback even when terminating the Streamable HTTP session fails', async () => {
        const server = new TestMCPServer(undefined, [[new Error('streamable http unavailable')], []]);
        const originalCreateStreamableHttpTransport = (server as unknown as {
            createStreamableHttpTransport: () => StreamableHTTPClientTransport;
        }).createStreamableHttpTransport.bind(server);
        (server as unknown as { createStreamableHttpTransport: () => StreamableHTTPClientTransport })
            .createStreamableHttpTransport = () => {
                const transport = originalCreateStreamableHttpTransport();
                transport.terminateSession = async () => { throw new Error('terminate failed'); };
                return transport;
            };

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        expect(server.sseTransports).to.have.length(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.Connected);
    });

    it('cancels the first OAuth provider and creates a fresh one for the SSE fallback', async () => {
        const server = new TestMCPServer(undefined, [[new Error('streamable http unavailable')], []]);

        await withConsoleOutputSuppressed(async () => {
            await server.start();
        });

        // Two providers: one for Streamable HTTP, one for SSE fallback. The first is cancelled before
        // SSE re-create; the second is cancelled in doStart's finally.
        expect(server.oauthFactory.createCalls).to.equal(2);
        expect(server.oauthFactory.totalCancelCalls).to.equal(2);
    });

    it('shows a post-handshake message when SSE fallback after a successful sign-in still needs authorization', async () => {
        // Narrow but real scenario:
        // 1. Streamable HTTP returns 401 → OAuth handshake completes (finishAuth succeeds, tokens saved).
        // 2. Post-finishAuth reconnect throws a non-OAuth error → SSE fallback runs.
        // 3. Fresh provider/state created; SSE connect attempts re-auth but the popup was consumed in step 1.
        // The status badge MUST NOT say "authorization is required" because the user just signed in.
        // Instead, an honest "sign-in succeeded but the connection failed" message guides the retry click.
        const server = new TestMCPServer(undefined, [
            [new UnauthorizedError()],
            [new Error('post-handshake reconnect failed')],
            [new MCPOAuthAuthorizationRequiredError()]
        ]);

        await withConsoleOutputSuppressed(async () => {
            await withConsoleErrorsSuppressed(async () => {
                await server.start();
            });
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('sign-in succeeded');
        // The flag must be observable on the post-handshake error path; sanity-check the SSE fallback ran.
        expect(server.sseTransports).to.have.length(1);
    });

    it('invalidates tokens when OAuth reconnect is still unauthorized after finishAuth', async () => {
        const server = new TestMCPServer(undefined, [[new UnauthorizedError()]]);
        const authProvider = {
            invalidateCalls: [] as string[],
            waitForAuthorization: async () => 'authorization-code',
            invalidateCredentials: async (scope: 'tokens' | 'discovery') => { authProvider.invalidateCalls.push(scope); }
        };
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);

        try {
            await server.testConnectTransport(authProvider as unknown as MCPOAuthClientProvider);
            throw new Error('Expected reconnect UnauthorizedError');
        } catch (error) {
            expect(error).to.be.instanceOf(UnauthorizedError);
        }

        expect(authProvider.invalidateCalls).to.deep.equal(['tokens', 'discovery']);
    });

    it('invalidates tokens when OAuth reconnect fails with Streamable HTTP 401 after finishAuth', async () => {
        const server = new TestMCPServer(undefined, [[new StreamableHTTPError(401, 'Server returned 401 after successful authentication')]]);
        const authProvider = {
            invalidateCalls: [] as string[],
            waitForAuthorization: async () => 'authorization-code',
            invalidateCredentials: async (scope: 'tokens' | 'discovery') => { authProvider.invalidateCalls.push(scope); }
        };
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);

        try {
            await server.testConnectTransport(authProvider as unknown as MCPOAuthClientProvider);
            throw new Error('Expected reconnect UnauthorizedError');
        } catch (error) {
            expect(error).to.be.instanceOf(UnauthorizedError);
        }

        expect(authProvider.invalidateCalls).to.deep.equal(['tokens', 'discovery']);
    });

    it('routes steady-state Unauthorized events on OAuth servers to AuthenticationRequired', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        const initialClient = new TestClient();
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        initialClient.onerror?.(new UnauthorizedError());

        // Steady-state behavior must match the startup path (handleStartupError): the user re-starts the
        // server to re-authenticate, so AuthenticationRequired guides that workflow instead of the
        // generic Errored status the previous implementation produced.
        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('MCP OAuth authorization is required');
    });

    it('routes steady-state MCPOAuthAuthorizationRequiredError to AuthenticationRequired', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        const initialClient = new TestClient();
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        // The disposed provider rejects redirectToAuthorization with this error; that rejection
        // propagates through the SDK to transport.onerror / client.onerror.
        initialClient.onerror?.(new MCPOAuthAuthorizationRequiredError());

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('MCP OAuth authorization is required');
    });

    it('routes steady-state MCPOAuthAuthorizationServerError to AuthenticationRequired with the authorization server diagnostic', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        const initialClient = new TestClient();
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        initialTransport.onerror?.(new MCPOAuthAuthorizationServerError('access_denied', 'User declined re-consent.'));

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('User declined re-consent');
    });

    it('routes steady-state OAuth error responses to AuthenticationRequired with the authorization server diagnostic', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        const initialClient = new TestClient();
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        // A mid-session token refresh rejected with a non-self-healing OAuth error surfaces via client.onerror.
        initialClient.onerror?.(new InvalidScopeError('The requested scope is invalid.'));

        expect(server.getStatus()).to.equal(MCPServerStatus.AuthenticationRequired);
        expect((await server.getDescription()).error).to.contain('invalid_scope');
        expect((await server.getDescription()).error).to.contain('The requested scope is invalid.');
    });

    it('ignores transient SSE stream disconnect events while the remote server remains connected', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        const initialClient = new TestClient();
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        const sseError = new Error('SSE stream disconnected: TypeError: terminated');
        initialTransport.onerror?.(sseError);
        initialClient.onerror?.(sseError);

        expect(server.getStatus()).to.equal(MCPServerStatus.Connected);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('surfaces SSE stream disconnect events before the remote server is connected', async () => {
        const server = new TestMCPServer();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        server.setInitialState(new TestClient(), initialTransport);
        server.testSetStatus(MCPServerStatus.Connecting);
        server.testConfigureErrorHandlers();

        await withConsoleErrorsSuppressed(async () => {
            initialTransport.onerror?.(new Error('SSE stream disconnected: TypeError: terminated'));
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.Errored);
        expect((await server.getDescription()).error).to.contain('SSE stream disconnected: TypeError: terminated');
    });

    it('disconnects remote servers even when terminating the HTTP session fails', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.terminateSession = async () => {
            throw new UnauthorizedError();
        };
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);

        await withConsoleOutputSuppressed(async () => {
            await server.stop();
        });

        expect(initialClient.closeCalls).to.equal(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('disconnects remote servers while authorization is required', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.terminateSession = async () => { };
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.AuthenticationRequired);

        await withConsoleOutputSuppressed(async () => {
            await server.stop();
        });

        expect(initialClient.closeCalls).to.equal(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
    });

    it('clears the OAuth Unauthorized suppression flag after connectTransport succeeds', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        server.setInitialState(initialClient, initialTransport);

        await server.testConnectTransport({} as MCPOAuthClientProvider);

        expect((server as unknown as { suppressOAuthUnauthorizedErrors: boolean }).suppressOAuthUnauthorizedErrors).to.be.false;
    });

    it('clears the OAuth Unauthorized suppression flag after connectTransport throws a non-Unauthorized error', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient([new Error('connect failed')]);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        server.setInitialState(initialClient, initialTransport);

        try {
            await server.testConnectTransport({} as MCPOAuthClientProvider);
            throw new Error('Expected connect failure');
        } catch (error) {
            expect((error as Error).message).to.equal('connect failed');
        }

        expect((server as unknown as { suppressOAuthUnauthorizedErrors: boolean }).suppressOAuthUnauthorizedErrors).to.be.false;
    });

    it('clears the OAuth Unauthorized suppression flag after the OAuth handshake completes', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient(true);
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.finishAuth = async code => {
            server.finishedAuthCode = code;
        };
        server.setInitialState(initialClient, initialTransport);

        await server.testConnectTransport(makeAuthProviderMock());

        expect((server as unknown as { suppressOAuthUnauthorizedErrors: boolean }).suppressOAuthUnauthorizedErrors).to.be.false;
    });

    it('ignores client errors after a remote server has been stopped', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        initialTransport.terminateSession = async () => { };
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        server.testConfigureErrorHandlers();

        await withConsoleOutputSuppressed(async () => {
            await server.stop();
        });
        initialClient.onerror?.(new UnauthorizedError());

        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('clears the stale error and resets status when update(description, true) runs after a startup failure', async () => {
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Errored);
        (server as unknown as { error: string }).error = 'Error on MCP startup: stale failure';

        const statusEvents: MCPServerStatus[] = [];
        server.onDidUpdateStatus(status => statusEvents.push(status));

        server.update({ name: 'test', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } });

        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
        // The status transition must reach onDidUpdateStatus subscribers so internal listeners (e.g. the
        // manager's notifyClients hookup) see it even without the explicit addOrUpdateServer notification.
        expect(statusEvents).to.deep.equal([MCPServerStatus.NotConnected]);
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('clears stale error when update(description, false) leaves a running server alive', async () => {
        // Defensive pin: if a future code path were to leave `this.error` populated while status is
        // Running/Connected, the badge hover would surface a diagnostic bound to the OLD configuration
        // that we just replaced in update(). `update()` clears `this.error` unconditionally so the
        // resetStatus=false path (running server, non-connection field change) cannot leak stale state.
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);
        (server as unknown as { error: string }).error = 'stale error message from prior configuration';

        const statusEvents: MCPServerStatus[] = [];
        server.onDidUpdateStatus(status => statusEvents.push(status));

        server.update({ name: 'test', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } }, false);

        // Running connection is preserved (no status transition emitted).
        expect(server.getStatus()).to.equal(MCPServerStatus.Connected);
        expect(statusEvents).to.deep.equal([]);
        // But the stale error from the prior configuration is gone.
        expect((await server.getDescription()).error).to.be.undefined;
    });

    it('routes pre-connectTransport setup failures through handleStartupError instead of leaving status pinned at Connecting', async () => {
        // createOAuthClientProvider awaits an RPC (getCallbackUrl) that can reject transiently. Before the
        // outer try/catch was added, that rejection escaped doStart without going through handleStartupError
        // and the status stayed at Connecting forever.
        const server = new TestMCPServer();
        (server.oauthFactory as unknown as { create: () => Promise<MCPOAuthClientProvider> }).create =
            async () => { throw new Error('callback URL RPC failed'); };

        await withConsoleOutputSuppressed(async () => {
            await withConsoleErrorsSuppressed(async () => {
                await server.start();
            });
        });

        expect(server.getStatus()).to.equal(MCPServerStatus.Errored);
        expect((await server.getDescription()).error).to.contain('callback URL RPC failed');
    });

    it('treats a second stop() after a successful stop as a no-op', async () => {
        // `!this.client` only catches the never-started case. The new `isStopped()` guard catches the
        // already-stopped case so a second stop call does not re-close the client and re-terminate the
        // session. Mostly defensive: SDK close() is idempotent, but the guard removes spurious side calls.
        const server = new TestMCPServer();
        const initialClient = new TestClient();
        const initialTransport = new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'));
        let terminateCalls = 0;
        initialTransport.terminateSession = async () => { terminateCalls++; };
        server.setInitialState(initialClient, initialTransport);
        server.testSetStatus(MCPServerStatus.Connected);

        await withConsoleOutputSuppressed(async () => {
            await server.stop();
            await server.stop();
        });

        expect(initialClient.closeCalls).to.equal(1);
        expect(terminateCalls).to.equal(1);
        expect(server.getStatus()).to.equal(MCPServerStatus.NotConnected);
    });

    it('strips runtime fields from descriptions passed through update()', () => {
        const server = new TestMCPServer();
        server.testSetStatus(MCPServerStatus.NotConnected);

        // Simulate a permissive resolve() implementation that splats a getDescription() result, which mixes
        // runtime status/error/tools into the configuration the manager hands to update().
        server.update({
            name: 'test',
            serverUrl: 'https://mcp.example.com/mcp',
            oauth: { enabled: true },
            status: MCPServerStatus.Errored,
            error: 'stale error from getDescription',
            tools: [{ name: 'stale-tool' }]
        });

        const stored = (server as unknown as { description: MCPServerDescription }).description;
        expect(stored.status).to.be.undefined;
        expect(stored.error).to.be.undefined;
        expect(stored.tools).to.be.undefined;
        // Configuration fields must still round-trip.
        expect(stored.name).to.equal('test');
        expect((stored as { serverUrl: string }).serverUrl).to.equal('https://mcp.example.com/mcp');
        // getCachedDescription must not surface the stripped runtime fields either.
        const cached = server.getCachedDescription();
        expect(cached.tools).to.be.undefined;
    });
});
