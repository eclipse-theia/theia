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

import * as http from 'http';
import { AddressInfo } from 'net';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MCP_OAUTH_CALLBACK_PATH } from '../common/mcp-oauth';
import { MCPOAuthCallbackEndpoint } from '../node/mcp-oauth-callback-endpoint';
import { MCPOAuthCallbackResponder } from '../node/mcp-oauth-callback-responder';
import { ILogger } from '@theia/core';

/** RFC 8252 loopback host. `127.0.0.1` (not `localhost`) so the bound address is unambiguous and unreachable off-host. */
export const MCP_OAUTH_LOOPBACK_HOST = '127.0.0.1';

/**
 * Default port for the loopback callback server: in the registered range, below every OS ephemeral
 * range (Linux 32768+, Windows/macOS 49152+) so a fixed bind is not stolen by a transient connection,
 * and clear of well-known service/dev ports. Override via {@link MCP_OAUTH_CALLBACK_PORT_ENV}.
 * Static-`clientId` providers must register `http://127.0.0.1:<port>/mcp/oauth/callback` exactly.
 */
export const MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT = 28932;

/**
 * Environment variable overriding {@link MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT}. An env var rather
 * than a preference because this runs in the backend, where the `PreferenceService` resolves only
 * schema defaults, never user-set values.
 */
export const MCP_OAUTH_CALLBACK_PORT_ENV = 'THEIA_MCP_OAUTH_CALLBACK_PORT';

/**
 * Electron-only RFC 8252 loopback callback server, bound to `127.0.0.1` on a fixed port and separate
 * from the main backend, so it sits outside the security-token cookie middleware that would otherwise
 * `403` the cookie-less OAuth redirect. One server multiplexes all flows and frontends through the
 * shared {@link MCPOAuthCallbackResponder} (keyed by `state`), started lazily on first use and closed
 * on shutdown.
 */
@injectable()
export class MCPOAuthLoopbackCallbackServer implements MCPOAuthCallbackEndpoint, BackendApplicationContribution {

    @inject(MCPOAuthCallbackResponder)
    protected readonly responder: MCPOAuthCallbackResponder;

    @inject(ILogger) @named('ai-mcp:MCPOAuthLoopbackCallbackServer')
    protected readonly logger: ILogger;

    protected server: http.Server | undefined;
    protected startPromise: Promise<number> | undefined;

    async getRedirectUrl(): Promise<string> {
        const port = await this.ensureServer();
        return `http://${MCP_OAUTH_LOOPBACK_HOST}:${port}${MCP_OAUTH_CALLBACK_PATH}`;
    }

    onStop(): void {
        this.server?.close();
        this.server = undefined;
        this.startPromise = undefined;
    }

    protected ensureServer(): Promise<number> {
        if (!this.startPromise) {
            const pending = this.startServer();
            this.startPromise = pending;
            // Clear the cache on bind failure so the next authorization retries instead of reusing the rejected promise.
            pending.catch(() => {
                if (this.startPromise === pending) {
                    this.startPromise = undefined;
                }
            });
        }
        return this.startPromise;
    }

    protected startServer(): Promise<number> {
        const port = this.getConfiguredPort();
        return new Promise<number>((resolve, reject) => {
            const server = http.createServer((req, res) => this.handleRequest(req, res));
            server.on('error', error => reject(new Error(
                `Failed to start the MCP OAuth loopback callback server on ${MCP_OAUTH_LOOPBACK_HOST}:${port}. `
                + `Set ${MCP_OAUTH_CALLBACK_PORT_ENV} to a free port and register the matching redirect URI with the `
                + `OAuth provider. Cause: ${error instanceof Error ? error.message : String(error)}`
            )));
            // Bind 127.0.0.1 only (never 0.0.0.0) so the server is unreachable off-host.
            server.listen(port, MCP_OAUTH_LOOPBACK_HOST, () => {
                this.server = server;
                resolve((server.address() as AddressInfo).port);
            });
        });
    }

    protected handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = new URL(req.url ?? '/', `http://${MCP_OAUTH_LOOPBACK_HOST}`);
        if (req.method !== 'GET' || url.pathname !== MCP_OAUTH_CALLBACK_PATH) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            res.end('Not found');
            return;
        }
        const response = this.responder.renderResponse({
            state: url.searchParams.get('state') ?? undefined,
            code: url.searchParams.get('code') ?? undefined,
            error: url.searchParams.get('error') ?? undefined,
            errorDescription: url.searchParams.get('error_description') ?? undefined
        });
        res.writeHead(response.status, response.headers);
        res.end(response.body);
    }

    protected getConfiguredPort(): number {
        const configured = process.env[MCP_OAUTH_CALLBACK_PORT_ENV];
        if (configured) {
            const parsed = Number(configured);
            if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535) {
                return parsed;
            }
            this.logger.warn(`Ignoring invalid ${MCP_OAUTH_CALLBACK_PORT_ENV}="${configured}"; expected an integer in [0, 65535]. `
                + `Falling back to ${MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT}.`);
        }
        return MCP_OAUTH_DEFAULT_ELECTRON_CALLBACK_PORT;
    }
}
