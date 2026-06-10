// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport, StreamableHTTPClientTransportOptions, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { isLocalMCPServerDescription, isRemoteMCPServerDescription, MCPServerDescription, MCPServerStatus, ToolInformation } from '../common';
import { Emitter } from '@theia/core/lib/common/event.js';
import { nls } from '@theia/core/lib/common/nls';
import { CallToolResult, CallToolResultSchema, ListResourcesResult, ListRootsRequestSchema, ListRootsResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { MCPOAuthClientProvider } from './mcp-oauth-client-provider';
import { MCPOAuthClientProviderFactory } from './mcp-oauth-client-provider-factory';
import { MCPOAuthAuthorizationRequiredError, MCPOAuthAuthorizationServerError } from './mcp-oauth-errors';
import { MCPOAuthCancelledError } from './mcp-oauth-callback-service';

const HTTP_STATUS_UNAUTHORIZED = 401;

export class MCPServer {
    protected description: MCPServerDescription;
    protected transport: Transport;
    protected client: Client;
    protected error?: string;
    protected status: MCPServerStatus;
    protected workspaceRoots: string[] | undefined;
    /** Suppresses transient 401s during the OAuth handshake (set in connectTransport, cleared in its finally) so they don't surface as runtime errors. */
    protected suppressOAuthUnauthorizedErrors = false;
    /** OAuth provider for the current doStart attempt; lets stop() cancel an in-flight authorization. Cleared in doStart's finally. */
    protected authProvider: MCPOAuthClientProvider | undefined;
    /**
     * Whether finishAuth() succeeded in the current doStart attempt. handleStartupError reads it to tell a
     * post-handshake reconnect failure (sign-in already succeeded) from a genuine authorization-required failure.
     */
    protected oauthHandshakeCompletedDuringStart = false;
    protected startPromise: Promise<void> | undefined;

    protected readonly onDidUpdateStatusEmitter = new Emitter<MCPServerStatus>();
    readonly onDidUpdateStatus = this.onDidUpdateStatusEmitter.event;

    constructor(
        description: MCPServerDescription,
        protected readonly oauthClientProviderFactory: MCPOAuthClientProviderFactory
    ) {
        this.update(description);
    }

    getStatus(): MCPServerStatus {
        return this.status;
    }

    setStatus(status: MCPServerStatus): void {
        if (this.status === status) {
            return;
        }
        this.status = status;
        this.onDidUpdateStatusEmitter.fire(status);
    }

    /** Fully up: `Running` (local) or `Connected` (remote). Not the complement of {@link isStopped} — in-flight states and `Errored` are neither. */
    isRunning(): boolean {
        return this.status === MCPServerStatus.Running
            || this.status === MCPServerStatus.Connected;
    }

    /** Fully down: `NotRunning` (local) or `NotConnected` (remote). Not `!isRunning()` — see {@link isRunning}. */
    isStopped(): boolean {
        return this.status === MCPServerStatus.NotRunning
            || this.status === MCPServerStatus.NotConnected;
    }

    /**
     * Between start() being awaited and doStart settling on a terminal status. addOrUpdateServer reads this to
     * skip the post-update status reset, which would otherwise race doStart's eventual setStatus(Connected/Running).
     */
    isInFlight(): boolean {
        return this.status === MCPServerStatus.Starting
            || this.status === MCPServerStatus.Connecting
            || this.status === MCPServerStatus.AuthenticationRequired;
    }

    setWorkspaceRoots(roots: string[] | undefined): void {
        this.workspaceRoots = roots;
        if (this.isRunning() && this.workspaceRoots) {
            this.client.sendRootsListChanged();
        }
    }

    getCachedDescription(): MCPServerDescription {
        return {
            ...this.description,
            status: this.status,
            error: this.error
        };
    }

    async getDescription(): Promise<MCPServerDescription> {
        let toReturnTools: ToolInformation[] | undefined = undefined;
        if (this.isRunning()) {
            try {
                const { tools } = await this.getTools();
                toReturnTools = tools.map(tool => ({
                    name: tool.name,
                    description: tool.description
                }));
            } catch (error) {
                console.error('Error fetching tools for description:', error);
            }
        }

        return {
            ...this.description,
            status: this.status,
            error: this.error,
            tools: toReturnTools
        };
    }

    /**
     * @param options.interactive `true` for direct user actions, `false` for autostart. Flows to the OAuth
     *        provider's `interactive` field; non-interactive providers reject `redirectToAuthorization`, so
     *        autostart cannot inadvertently launch a browser.
     */
    async start(options: { interactive?: boolean } = {}): Promise<void> {
        if (this.startPromise) {
            return this.startPromise;
        }
        // AuthenticationRequired / Errored are deliberately not early-returned: start() is the retry entry point for both.
        if (this.isRunning()
            || (this.status === MCPServerStatus.Starting || this.status === MCPServerStatus.Connecting)) {
            return;
        }
        this.startPromise = this.doStart({ interactive: !!options.interactive });
        try {
            await this.startPromise;
        } finally {
            this.startPromise = undefined;
        }
    }

    protected async doStart(options: { interactive: boolean }): Promise<void> {
        let connected = false;
        let descHeaders: Record<string, string> | undefined;

        this.client = this.createClient();
        this.error = undefined;
        this.oauthHandshakeCompletedDuringStart = false;
        this.authProvider = undefined;

        // Wrap the whole body so setup failures (getCallbackUrl RPC, `new URL(...)`, the Stdio constructor) route
        // through handleStartupError instead of leaving status pinned at Connecting/Starting. The finally is the
        // single authProvider-disposal site for every exit path.
        try {
            if (isLocalMCPServerDescription(this.description)) {
                this.setStatus(MCPServerStatus.Starting);
                console.log(
                    `Starting server "${this.description.name}" with command: ${this.description.command} ` +
                    `and args: ${this.description.args?.join(' ')} and env: ${JSON.stringify(this.description.env)}`
                );

                const sanitizedEnv: Record<string, string> = Object.fromEntries(
                    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
                );

                const mergedEnv: Record<string, string> = {
                    ...sanitizedEnv,
                    ...(this.description.env || {})
                };
                this.transport = new StdioClientTransport({
                    command: this.description.command,
                    args: this.description.args,
                    env: mergedEnv,
                });
            } else if (isRemoteMCPServerDescription(this.description)) {
                this.setStatus(MCPServerStatus.Connecting);
                console.log(`Connecting to server "${this.description.name}" via MCP Server Communication with URL: ${this.description.serverUrl}`);

                if (this.description.headers) {
                    descHeaders = this.description.headers;
                }

                if (this.description.serverAuthToken) {
                    if (!descHeaders) {
                        descHeaders = {};
                    }

                    if (this.description.serverAuthTokenHeader) {
                        descHeaders = { ...descHeaders, [this.description.serverAuthTokenHeader]: this.description.serverAuthToken };
                    } else {
                        descHeaders = { ...descHeaders, Authorization: `Bearer ${this.description.serverAuthToken}` };
                    }
                }

                this.authProvider = this.description.oauth?.enabled
                    ? await this.createOAuthClientProvider(options.interactive)
                    : undefined;

                this.transport = this.createStreamableHttpTransport(descHeaders, this.authProvider);

                try {
                    await this.connectTransport(this.authProvider, descHeaders);
                    connected = true;
                    console.log(`MCP Streamable HTTP successful connected: ${this.description.serverUrl}`);
                } catch (e) {
                    // An OAuth-flow outcome (success, cancel, denial, retry-required) is final for this authorization;
                    // SSE fallback would create a fresh provider and re-prompt a user who was already involved.
                    // OAuthError covers error responses the SDK auth flow re-throws without self-healing.
                    if (e instanceof UnauthorizedError || e instanceof MCPOAuthCancelledError
                        || e instanceof MCPOAuthAuthorizationRequiredError || e instanceof MCPOAuthAuthorizationServerError
                        || e instanceof OAuthError || this.isIncompatibleAuthServerError(e)) {
                        await this.handleStartupError(e);
                        return;
                    }
                    console.log(`MCP SSE fallback initiated: ${this.description.serverUrl}`, e);
                    if (this.transport instanceof StreamableHTTPClientTransport) {
                        // Best-effort terminate of any session created during the failed connect, mirroring stop().
                        try {
                            await this.transport.terminateSession();
                        } catch (terminateError) {
                            console.warn(`Failed to terminate Streamable HTTP session before SSE fallback for MCP server "${this.description.name}"`, terminateError);
                        }
                    }
                    await this.client.close();
                    if (this.authProvider) {
                        this.authProvider.cancel();
                        // Fresh provider/state for the fallback so it can't reuse Streamable HTTP authorization state.
                        this.authProvider = await this.createOAuthClientProvider(options.interactive);
                    }
                    this.client = this.createClient();
                    this.transport = this.createSSETransport(descHeaders, this.authProvider);
                }
            } else {
                throw new Error('Unknown MCP server description type.');
            }

            this.configureErrorHandlers();

            if (!connected) {
                await this.connectTransport(this.authProvider, descHeaders);
            }
            // Clear any error recorded via a non-fatal `onerror` while the connect was still resolving.
            this.error = undefined;
            this.setStatus(isLocalMCPServerDescription(this.description) ? MCPServerStatus.Running : MCPServerStatus.Connected);
        } catch (e) {
            await this.handleStartupError(e);
        } finally {
            // cancel() (not markInactive()) also releases a pending callback await; it's a no-op once settled, so the success path adds no rejected entry.
            this.authProvider?.cancel();
            this.authProvider = undefined;
            // Reset again so the flag never spans attempts.
            this.oauthHandshakeCompletedDuringStart = false;
        }
    }

    protected async handleStartupError(error: unknown): Promise<void> {
        if (this.isStopped()) {
            return;
        }
        if (error instanceof MCPOAuthCancelledError) {
            this.error = undefined;
            await this.client.close();
            this.setStatus(isRemoteMCPServerDescription(this.description) ? MCPServerStatus.NotConnected : MCPServerStatus.NotRunning);
            return;
        }
        if (error instanceof MCPOAuthAuthorizationServerError) {
            // Surface the authorization server's diagnostic (e.g. "access_denied"); a re-start triggers a fresh sign-in.
            const description = error.authorizationServerErrorDescription ?? error.authorizationServerError;
            this.error = nls.localize('theia/ai/mcp/oauth/authorizationServerError', 'Authorization server reported: {0}', description);
            await this.client.close();
            this.setStatus(MCPServerStatus.AuthenticationRequired);
            return;
        }
        if (error instanceof OAuthError) {
            // A non-self-healing OAuth error response: invalidate stored credentials so the next interactive
            // start runs a fresh authorization instead of replaying the same failing flow.
            await this.authProvider?.invalidateCredentials?.('tokens');
            await this.authProvider?.invalidateCredentials?.('discovery');
            this.error = nls.localize('theia/ai/mcp/oauth/authorizationServerError', 'Authorization server reported: {0}', this.oauthErrorDiagnostic(error));
            await this.client.close();
            this.setStatus(MCPServerStatus.AuthenticationRequired);
            return;
        }
        if (error instanceof UnauthorizedError || error instanceof MCPOAuthAuthorizationRequiredError) {
            // If the handshake already succeeded this attempt, a later failure must not contradict the user's sign-in by re-asking for authorization.
            if (this.oauthHandshakeCompletedDuringStart && isRemoteMCPServerDescription(this.description) && this.description.oauth?.enabled) {
                this.error = nls.localize('theia/ai/mcp/oauth/postHandshakeConnectionFailed',
                    'MCP OAuth sign-in succeeded, but the connection still failed. Start the server again to retry.');
            } else {
                this.error = isRemoteMCPServerDescription(this.description) && this.description.oauth?.enabled
                    ? nls.localize('theia/ai/mcp/oauth/authorizationRequired', 'MCP OAuth authorization is required.')
                    : nls.localize('theia/ai/mcp/authenticationRequired', 'MCP server requires authentication. Configure the required authentication for this server.');
            }
            await this.client.close();
            this.setStatus(MCPServerStatus.AuthenticationRequired);
            return;
        }
        this.error = 'Error on MCP startup: ' + error;
        await this.client.close();
        this.setStatus(MCPServerStatus.Errored);
    }

    protected createClient(): Client {
        const client = new Client(
            {
                name: 'theia-client',
                version: '1.0.0',
            },
            this.workspaceRoots ? {
                capabilities: {
                    roots: {
                        listChanged: true
                    }
                }
            } : {
                capabilities: {}
            }
        );
        if (this.workspaceRoots) {
            client.setRequestHandler(ListRootsRequestSchema, async () => {
                const roots = this.workspaceRoots?.map(uri => ({
                    uri,
                    name: uri.split('/').pop() || uri
                }));
                return { roots } as ListRootsResult;
            });
        }
        return client;
    }

    protected configureErrorHandlers(): void {
        this.transport.onerror = error => this.handleSteadyStateError(error, 'Error: ');
        this.client.onerror = error => this.handleSteadyStateError(error, 'Error in MCP client: ');
    }

    protected handleSteadyStateError(error: Error, errorPrefix: string): void {
        if (this.isStopped() || this.isExpectedTransportError(error)) {
            return;
        }
        // A steady-state auth signal (e.g. refresh-token expiry) must surface as AuthenticationRequired, not Errored, so the badge guides a re-start.
        if (this.isAuthenticationRequiredError(error)) {
            this.error = this.authenticationRequiredErrorMessage(error);
            this.setStatus(MCPServerStatus.AuthenticationRequired);
            // close() is async and this handler is sync, so fire-and-forget.
            this.client.close().catch(closeError =>
                console.warn(`Failed to close MCP client after steady-state OAuth re-auth signal for "${this.description.name}"`, closeError));
            return;
        }
        console.error(errorPrefix, error);
        this.error = errorPrefix + error;
        this.setStatus(MCPServerStatus.Errored);
    }

    protected isAuthenticationRequiredError(error: Error): boolean {
        return error instanceof UnauthorizedError
            || error instanceof MCPOAuthAuthorizationRequiredError
            || error instanceof MCPOAuthAuthorizationServerError
            || error instanceof OAuthError;
    }

    protected authenticationRequiredErrorMessage(error: Error): string {
        if (error instanceof MCPOAuthAuthorizationServerError) {
            const description = error.authorizationServerErrorDescription ?? error.authorizationServerError;
            return nls.localize('theia/ai/mcp/oauth/authorizationServerError', 'Authorization server reported: {0}', description);
        }
        if (error instanceof OAuthError) {
            return nls.localize('theia/ai/mcp/oauth/authorizationServerError', 'Authorization server reported: {0}', this.oauthErrorDiagnostic(error));
        }
        return isRemoteMCPServerDescription(this.description) && this.description.oauth?.enabled
            ? nls.localize('theia/ai/mcp/oauth/authorizationRequired', 'MCP OAuth authorization is required.')
            : nls.localize('theia/ai/mcp/authenticationRequired', 'MCP server requires authentication. Configure the required authentication for this server.');
    }

    protected isExpectedTransportError(error: Error): boolean {
        // Only suppress expected 401s during the initial OAuth handshake; later 401s should surface as runtime errors.
        if (this.suppressOAuthUnauthorizedErrors && this.isUnauthorizedReconnectError(error)) {
            return true;
        }
        // @modelcontextprotocol/sdk 1.29 reports normal SSE disconnects with this prefix; a wording change on an SDK bump flips the SSE-disconnect tests.
        return this.isRunning()
            && isRemoteMCPServerDescription(this.description)
            && error.message.startsWith('SSE stream disconnected:');
    }

    protected createStreamableHttpTransport(headers: Record<string, string> | undefined, authProvider: MCPOAuthClientProvider | undefined): StreamableHTTPClientTransport {
        if (!isRemoteMCPServerDescription(this.description)) {
            throw new Error('MCP Streamable HTTP transport can only be created for remote servers.');
        }
        return new StreamableHTTPClientTransport(new URL(this.description.serverUrl), this.createStreamableHttpOptions(headers, authProvider));
    }

    protected createStreamableHttpOptions(
        headers: Record<string, string> | undefined,
        authProvider: MCPOAuthClientProvider | undefined
    ): StreamableHTTPClientTransportOptions | undefined {
        if (!headers && !authProvider) {
            return undefined;
        }
        return {
            ...(headers && { requestInit: { headers } }),
            ...(authProvider && { authProvider })
        };
    }

    protected createSSETransport(headers: Record<string, string> | undefined, authProvider: MCPOAuthClientProvider | undefined): SSEClientTransport {
        if (!isRemoteMCPServerDescription(this.description)) {
            throw new Error('MCP SSE transport can only be created for remote servers.');
        }
        if (!headers && !authProvider) {
            return new SSEClientTransport(new URL(this.description.serverUrl));
        }
        return new SSEClientTransport(new URL(this.description.serverUrl), {
            ...(headers && {
                eventSourceInit: {
                    fetch: (url, init) =>
                        fetch(url, { ...init, headers }),
                },
                requestInit: { headers },
            }),
            ...(authProvider && { authProvider })
        });
    }

    protected async createOAuthClientProvider(interactive: boolean): Promise<MCPOAuthClientProvider> {
        if (!isRemoteMCPServerDescription(this.description) || !this.description.oauth?.enabled) {
            throw new Error(nls.localize('theia/ai/mcp/oauth/notEnabled', 'MCP OAuth is not enabled for this server.'));
        }
        return this.oauthClientProviderFactory.create(this.description.name, this.description.serverUrl, this.description.oauth, { interactive });
    }

    protected async connectTransport(authProvider: MCPOAuthClientProvider | undefined, headers?: Record<string, string>): Promise<void> {
        this.suppressOAuthUnauthorizedErrors = !!authProvider;
        try {
            await this.client.connect(this.transport);
        } catch (error) {
            if (authProvider && error instanceof UnauthorizedError) {
                this.setStatus(MCPServerStatus.AuthenticationRequired);
                const code = await authProvider.waitForAuthorization();
                if (this.transport instanceof StreamableHTTPClientTransport || this.transport instanceof SSEClientTransport) {
                    await this.transport.finishAuth(code);
                    this.oauthHandshakeCompletedDuringStart = true;
                    if (this.transport instanceof StreamableHTTPClientTransport) {
                        // Best-effort terminate of the session created before the 401, so the next transport starts fresh.
                        try {
                            await this.transport.terminateSession();
                        } catch (terminateError) {
                            console.warn(`Failed to terminate previous Streamable HTTP session for MCP server "${this.description.name}"`, terminateError);
                        }
                    }
                    await this.client.close();
                    this.client = this.createClient();
                    // Reuse the same authProvider: it owns the tokens finishAuth just persisted and the matching OAuth
                    // state. (The SSE fallback differs — it discards the whole attempt and uses a fresh provider.)
                    this.transport = this.transport instanceof StreamableHTTPClientTransport
                        ? this.createStreamableHttpTransport(headers, authProvider)
                        : this.createSSETransport(headers, authProvider);
                    // Authorization is done; show Connecting for the final (sub-second) reconnect instead of leaving the badge at AuthenticationRequired.
                    this.setStatus(MCPServerStatus.Connecting);
                    this.configureErrorHandlers();
                    try {
                        await this.client.connect(this.transport);
                    } catch (reconnectError) {
                        if (this.isUnauthorizedReconnectError(reconnectError)) {
                            await authProvider.invalidateCredentials?.('tokens');
                            await authProvider.invalidateCredentials?.('discovery');
                            throw reconnectError instanceof UnauthorizedError ? reconnectError : new UnauthorizedError();
                        }
                        throw reconnectError;
                    }
                    return;
                }
            }
            throw error;
        } finally {
            this.suppressOAuthUnauthorizedErrors = false;
        }
    }

    protected isUnauthorizedReconnectError(error: unknown): boolean {
        return error instanceof UnauthorizedError
            || error instanceof StreamableHTTPError && error.code === HTTP_STATUS_UNAUTHORIZED;
    }

    /** `message` carries the OAuth `error_description`, which servers may omit; fall back to the bare error code. */
    protected oauthErrorDiagnostic(error: OAuthError): string {
        return error.message ? `${error.errorCode}: ${error.message}` : error.errorCode;
    }

    /**
     * The SDK reports unmet authorization-server capabilities (e.g. no dynamic client registration) as plain
     * Errors with this prefix. They are configuration outcomes, not transport failures, and must not trigger
     * the SSE fallback. Like the SSE-disconnect prefix, an SDK wording change flips the classification test.
     */
    protected isIncompatibleAuthServerError(error: unknown): boolean {
        return error instanceof Error && error.message.startsWith('Incompatible auth server:');
    }

    async callTool(toolName: string, arg_string: string): Promise<CallToolResult> {
        let args;
        try {
            args = JSON.parse(arg_string);
        } catch (error) {
            console.error(
                `Failed to parse arguments for calling tool "${toolName}" in MCP server "${this.description.name}".
                Invalid JSON: ${arg_string}`,
                error
            );
        }
        const params = {
            name: toolName,
            arguments: args,
        };
        // Cast needed since other result schemas (second parameter) might be possible.
        return this.client.callTool(params, CallToolResultSchema) as Promise<CallToolResult>;
    }

    async getTools(): ReturnType<Client['listTools']> {
        if (this.isRunning()) {
            return this.client.listTools();
        }
        return { tools: [] };
    }

    update(description: MCPServerDescription, resetStatus = true): void {
        // Strip runtime fields: a resolve() that re-emits getDescription() output would otherwise carry stale
        // status/error/tools into this.description (getCachedDescription overrides status/error, but tools would leak).
        const { status, error, tools, ...configuration } = description;
        this.description = configuration as MCPServerDescription;

        // Clear unconditionally (even when resetStatus=false): a stale message bound to the OLD config would mislead the badge hover.
        this.error = undefined;

        if (resetStatus) {
            // Use setStatus (not direct assignment) so onDidUpdateStatus subscribers see the transition.
            this.setStatus(isRemoteMCPServerDescription(this.description) ? MCPServerStatus.NotConnected : MCPServerStatus.NotRunning);
        }
    }

    async stop(): Promise<void> {
        // !this.client: never started. isStopped(): a second stop() after a successful one. close() is idempotent, but this avoids a redundant terminateSession.
        if (!this.client || this.isStopped()) {
            return;
        }
        // Cancel any in-flight OAuth flow first so the awaiting doStart unwinds before teardown; cancel() is idempotent, tolerating a concurrent reassignment.
        this.authProvider?.cancel();
        if (isLocalMCPServerDescription(this.description)) {
            console.log(`Stopping MCP server "${this.description.name}"`);
            await this.client.close();
            this.setStatus(MCPServerStatus.NotRunning);
        } else {
            console.log(`Disconnecting MCP server "${this.description.name}"`);
            if (this.transport instanceof StreamableHTTPClientTransport) {
                console.log(`Terminating session for MCP server "${this.description.name}"`);
                try {
                    await this.transport.terminateSession();
                } catch (error) {
                    console.warn(`Failed to terminate session for MCP server "${this.description.name}"`, error);
                }
            }
            await this.client.close();
            this.setStatus(MCPServerStatus.NotConnected);
        }
    }

    readResource(resourceId: string): Promise<ReadResourceResult> {
        const params = { uri: resourceId };
        return this.client.readResource(params);
    }

    getResources(): Promise<ListResourcesResult> {
        return this.client.listResources();
    }
}
