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
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
    isInProcessMCPServerDescription, isLocalMCPServerDescription, isRemoteMCPServerDescription, MCPServerDescription,
    MCPServerStatus, ToolInformation,
    MCPTransportProvider, MCPToolFilter, MCPToolFilterContext, MCPToolFilterOutcome, MCPWorkspaceTrustLevel,
    MCPClient, MCPClientFactory, MCPClientFactoryContext, MCPCredentialResolver,
} from '../common';
import { Emitter } from '@theia/core/lib/common/event.js';
import { CallToolResult, CallToolResultSchema, ListResourcesResult, ListRootsRequestSchema, ListRootsResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SdkTransportAdapter } from './mcp-transport-adapter';
import {
    fireDefaultClientDidInvokeTool,
    fireDefaultClientToolsAdded,
    fireDefaultClientWillInvokeTool,
} from './default-mcp-client-factory';

export class MCPServer {
    private description: MCPServerDescription;
    private transport: Transport;
    private client: Client;
    /**
     * The {@link MCPClient} produced by the picked {@link MCPClientFactory}
     * during {@link start}. Owns the public event surface
     * (`onDidAddTools` / `onClose` / `onWillInvokeTool` / `onDidInvokeTool`)
     * that consumers subscribe to. `MCPServer` fires invocation events on
     * this object around every {@link callTool}; the inventory events fire
     * via {@link fireDefaultClientToolsAdded} / `__fireClose` from the
     * default-client-factory hooks.
     */
    private mcpClient?: MCPClient;
    private error?: string;
    private status: MCPServerStatus;
    private workspaceRoots: string[] | undefined;
    private workspaceTrustLevel: MCPWorkspaceTrustLevel = 'unknown';

    /**
     * Maps a filter-rewritten tool name back to the upstream MCP server's
     * original name, populated by {@link getTools} when the filter chain
     * runs. {@link callTool} consults this map so the SDK call uses the
     * upstream name even when the registered tool name was rewritten.
     */
    private filteredNameToOriginal: Map<string, string> = new Map();

    private readonly onDidUpdateStatusEmitter = new Emitter<MCPServerStatus>();
    readonly onDidUpdateStatus = this.onDidUpdateStatusEmitter.event;

    /**
     * Optional provider arrays injected by {@link MCPServerManagerImpl}. When
     * present they are consulted in priority-descending order during
     * {@link start} and {@link getTools}/{@link getDescription}. When all are
     * empty (e.g. in unit tests that construct `MCPServer` directly), the
     * original inline behaviour is preserved so existing callers continue to
     * work unchanged.
     *
     * The picked {@link MCPClientFactory} is asked to produce the
     * event-bearing {@link MCPClient} that {@link callTool} fires
     * `__fireWillInvokeTool` / `__fireDidInvokeTool` on; see {@link start}
     * for the wiring. The factory's `.sdk` property (if any) is intentionally
     * unused — workspace-roots-aware SDK-Client construction stays in
     * {@link MCPServer} so capability negotiation and roots handling remain
     * in one place. Plugin factories that want to fully replace the SDK
     * client are tracked as a follow-up RFC.
     */
    protected readonly clientFactories: readonly MCPClientFactory[];

    constructor(
        description: MCPServerDescription,
        private readonly transportProviders: readonly MCPTransportProvider[] = [],
        private readonly toolFilters: readonly MCPToolFilter[] = [],
        clientFactories: readonly MCPClientFactory[] = [],
        private readonly credentialResolvers: readonly MCPCredentialResolver[] = [],
    ) {
        this.clientFactories = clientFactories;
        this.update(description);
    }

    getStatus(): MCPServerStatus {
        return this.status;
    }

    setStatus(status: MCPServerStatus): void {
        this.status = status;
        this.onDidUpdateStatusEmitter.fire(status);
    }

    isRunning(): boolean {
        return this.status === MCPServerStatus.Running
            || this.status === MCPServerStatus.Connected;
    }

    isStopped(): boolean {
        return this.status === MCPServerStatus.NotRunning
            || this.status === MCPServerStatus.NotConnected;
    }

    setWorkspaceRoots(roots: string[] | undefined): void {
        this.workspaceRoots = roots;
        if (this.isRunning() && this.workspaceRoots) {
            this.client.sendRootsListChanged();
        }
    }

    setWorkspaceTrustLevel(level: MCPWorkspaceTrustLevel): void {
        this.workspaceTrustLevel = level;
    }

    async getDescription(): Promise<MCPServerDescription> {
        let toReturnTools: ToolInformation[] | undefined = undefined;
        if (this.isRunning()) {
            try {
                // `getTools()` already applies the filter chain — don't
                // re-filter here, just project to ToolInformation shape.
                const { tools } = await this.getTools();
                toReturnTools = tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                }));
            } catch (error) {
                console.error('Error fetching tools for description:', error);
            }
        }

        // Returns the operator-supplied description verbatim — credential
        // sentinels remain as `${env:...}` / `${helper}`. Resolved
        // material lives only inside `start()`'s local `resolved` copy
        // and never escapes to RPC consumers.
        return {
            ...this.description,
            status: this.status,
            error: this.error,
            tools: toReturnTools,
        };
    }

    /**
     * Run the tool-filter chain (priority-descending) against a single tool.
     * Returns `undefined` when any filter suppresses the tool; returns the
     * (possibly rewritten) tool otherwise. Each filter sees the
     * possibly-rewritten output of the previous filter via
     * {@link MCPToolFilterContext.tool}; the other context fields
     * (`serverName`, `serverDescription`, `workspaceTrustLevel`) are
     * stable across the chain.
     */
    protected applyToolFilters(tool: ToolInformation): ToolInformation | undefined {
        if (this.toolFilters.length === 0) {
            return tool;
        }
        const ordered = [...this.toolFilters].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        let current: ToolInformation = tool;
        for (const filter of ordered) {
            const context: MCPToolFilterContext = {
                serverName: this.description.name,
                serverDescription: this.description,
                tool: current,
                workspaceTrustLevel: this.workspaceTrustLevel,
            };
            const outcome: MCPToolFilterOutcome = filter.filter(context);
            if (outcome === 'passthrough') {
                continue;
            }
            if (outcome === undefined) {
                return undefined;
            }
            current = outcome;
        }
        return current;
    }

    /**
     * Literal values in `serverAuthToken` (and similar credential-shaped
     * fields) that look like `${...}` trigger a consult of the credential-
     * resolver chain. Plain string values are returned as-is.
     */
    protected isCredentialSentinel(value: string | undefined): boolean {
        if (!value) {
            return false;
        }
        return /^\$\{[^}]+\}$/.test(value);
    }

    /**
     * Run the credential-resolver chain (priority-descending) for `field`,
     * short-circuiting on the first non-`undefined` return. Errors in a
     * single resolver are swallowed so one broken plugin cannot block the
     * chain; the chain returns `undefined` only when every resolver abstains.
     */
    protected async resolveCredential(
        description: MCPServerDescription,
        field: string,
        literal: string | undefined,
    ): Promise<string | undefined> {
        if (this.credentialResolvers.length === 0) {
            return undefined;
        }
        const ordered = [...this.credentialResolvers].sort(
            (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
        );
        const serverUrl = isRemoteMCPServerDescription(description)
            ? description.serverUrl
            : undefined;
        for (const resolver of ordered) {
            try {
                const resolved = await resolver.resolve({
                    serverName: description.name,
                    serverUrl,
                    serverDescription: description,
                    field,
                    literal,
                    workspaceTrustLevel: this.workspaceTrustLevel,
                });
                if (resolved !== undefined) {
                    return resolved;
                }
            } catch (error) {
                console.error(
                    `[@theia/ai-mcp] credential resolver "${resolver.id}" threw:`,
                    error,
                );
            }
        }
        return undefined;
    }

    /**
     * Pre-process a remote description: if `serverAuthToken` or any of the
     * `headers` values look like a credential sentinel, consult the resolver
     * chain and materialise the resolved value into a working-copy of the
     * description. Non-sentinel values are left alone, preserving today's
     * behaviour.
     */
    protected async materialiseCredentials(description: MCPServerDescription): Promise<MCPServerDescription> {
        if (!isRemoteMCPServerDescription(description)) {
            return description;
        }
        let changed = false;
        const working = { ...description };

        if (this.isCredentialSentinel(working.serverAuthToken)) {
            const resolved = await this.resolveCredential(working, 'serverAuthToken', working.serverAuthToken);
            if (resolved !== undefined) {
                working.serverAuthToken = resolved;
            } else {
                console.warn(
                    `[@theia/ai-mcp] server "${working.name}" serverAuthToken is a sentinel `
                    + `(${working.serverAuthToken}) but no resolver returned a value; falling back to undefined.`,
                );
                working.serverAuthToken = undefined;
            }
            changed = true;
        }

        if (working.headers) {
            const rewritten: Record<string, string> = {};
            let anyHeaderChanged = false;
            for (const [key, value] of Object.entries(working.headers)) {
                if (this.isCredentialSentinel(value)) {
                    const resolved = await this.resolveCredential(working, `headers.${key}`, value);
                    if (resolved !== undefined) {
                        rewritten[key] = resolved;
                    } else {
                        console.warn(
                            `[@theia/ai-mcp] server "${working.name}" header "${key}" is a sentinel `
                            + 'but no resolver returned a value; dropping the header.',
                        );
                        // Intentionally skip: dropped header.
                    }
                    anyHeaderChanged = true;
                    continue;
                }
                rewritten[key] = value;
            }
            if (anyHeaderChanged) {
                working.headers = rewritten;
                changed = true;
            }
        }

        return changed ? working : description;
    }

    /**
     * Pick the highest-priority transport provider whose `matches()` returns
     * true for `description`. Returns `undefined` when no provider matches,
     * letting {@link start} fall back to the inline transport construction
     * that predates the extension-point wiring.
     */
    protected pickTransportProvider(description: MCPServerDescription): MCPTransportProvider | undefined {
        if (this.transportProviders.length === 0) {
            return undefined;
        }
        return [...this.transportProviders]
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .find(provider => provider.matches(description));
    }

    async start(): Promise<void> {
        if (this.isRunning()
            || (this.status === MCPServerStatus.Starting || this.status === MCPServerStatus.Connecting)) {
            return;
        }

        // Materialise credential-shaped sentinels (e.g. `${env:TOKEN}` or
        // `${helper}`) into concrete values for the transport layer. Keep the
        // operator-supplied `this.description` UNCHANGED — `getDescription()`
        // returns it over the frontend RPC, and resolved tokens / helper
        // outputs must never leak into that surface. Only `resolved` (a local
        // working copy) carries the materialised values, and it never
        // escapes `start()`.
        const resolved = await this.materialiseCredentials(this.description);
        this.error = undefined;
        this.filteredNameToOriginal = new Map();

        // Build the SDK Client with capabilities matching whether we have
        // workspace roots to advertise. Roots-list-changed handler is wired
        // in the with-roots branch.
        if (!this.workspaceRoots) {
            this.client = new Client(
                { name: 'theia-client', version: '1.0.0' },
                { capabilities: {} },
            );
        } else {
            this.client = new Client(
                { name: 'theia-client', version: '1.0.0' },
                { capabilities: { roots: { listChanged: true } } },
            );
            this.client.setRequestHandler(ListRootsRequestSchema, async () => {
                const roots = this.workspaceRoots?.map(uri => ({
                    uri,
                    name: uri.split('/').pop() || uri,
                }));
                return { roots } as ListRootsResult;
            });
        }

        // Build the raw SDK transport (provider path, stdio inline, or
        // remote inline). For every code path we ALSO produce a
        // `mcpTransport` (SdkTransportAdapter) so the picked
        // `MCPClientFactory` can be handed an `MCPTransport` that satisfies
        // its public contract.
        let mcpTransport: SdkTransportAdapter | undefined;
        const customProvider = this.pickTransportProvider(resolved);
        if (customProvider) {
            this.setStatus(
                isLocalMCPServerDescription(resolved)
                    ? MCPServerStatus.Starting
                    : MCPServerStatus.Connecting,
            );
            console.log(
                `Starting server "${resolved.name}" via transport provider "${customProvider.id}"`,
            );
            const adapter = await customProvider.create(resolved, new AbortController().signal);
            // Unwrap the SDK transport from the adapter. Plugin providers
            // must return an SdkTransportAdapter (or instance thereof) until
            // MCPServer gains native MCPTransport support — see MIGRATION
            // "Transport adapters" pitfall.
            if (adapter instanceof SdkTransportAdapter) {
                mcpTransport = adapter;
                this.transport = adapter.sdkTransport;
            } else {
                throw new Error(
                    `Transport provider "${customProvider.id}" returned a non-SDK transport; `
                    + 'custom transports must extend SdkTransportAdapter until MCPServer gains '
                    + 'native support for the narrower MCPTransport interface.',
                );
            }
        } else if (isLocalMCPServerDescription(resolved)) {
            this.setStatus(MCPServerStatus.Starting);
            console.log(
                `Starting server "${resolved.name}" with command: ${resolved.command} ` +
                `and args: ${resolved.args?.join(' ')} and env: ${JSON.stringify(resolved.env)}`,
            );
            const sanitizedEnv: Record<string, string> = Object.fromEntries(
                Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
            );
            const mergedEnv: Record<string, string> = {
                ...sanitizedEnv,
                ...(resolved.env || {}),
            };
            this.transport = new StdioClientTransport({
                command: resolved.command,
                args: resolved.args,
                env: mergedEnv,
            });
            mcpTransport = new SdkTransportAdapter(this.transport, 'stdio');
        } else if (isRemoteMCPServerDescription(resolved)) {
            this.setStatus(MCPServerStatus.Connecting);
            console.log(`Connecting to server "${resolved.name}" via MCP Server Communication with URL: ${resolved.serverUrl}`);
            const descHeaders = this.buildRemoteHeaders(resolved);
            this.transport = descHeaders
                ? new StreamableHTTPClientTransport(new URL(resolved.serverUrl), { requestInit: { headers: descHeaders } })
                : new StreamableHTTPClientTransport(new URL(resolved.serverUrl));
            mcpTransport = new SdkTransportAdapter(this.transport, 'http');
        } else if (isInProcessMCPServerDescription(resolved)) {
            // In-process descriptions have no command and no serverUrl —
            // they MUST be served by a plugin-contributed MCPTransportProvider
            // (typically wrapping `createInProcessTransportPair`). If we
            // reach this branch, no provider matched: fail loudly so the
            // configuration error surfaces immediately rather than as a
            // mysterious "transport is undefined" downstream.
            throw new Error(
                `No MCPTransportProvider matched in-process MCP server "${resolved.name}". `
                + 'A plugin must contribute an MCPTransportProvider that handles in-process descriptions, '
                + 'typically wrapping `createInProcessTransportPair` to bridge to a server-side `Server` from '
                + '`@modelcontextprotocol/sdk/server`.',
            );
        }

        // Pick the highest-priority MCPClientFactory and ask it to build
        // an MCPClient (the public event-bearing wrapper). Stored on
        // `this.mcpClient` so `callTool` can fire `__fireWillInvokeTool` /
        // `__fireDidInvokeTool` around real invocations. The factory's
        // returned `.sdk` (if any) is intentionally NOT used: the SDK
        // Client constructed above owns the workspace-roots handler and
        // capability negotiation. Plugin factories that want to fully
        // replace the SDK client are tracked as a follow-up.
        this.mcpClient = undefined;
        const factory = this.pickClientFactory();
        if (factory && mcpTransport) {
            try {
                const ctx: MCPClientFactoryContext = {
                    resolveCredential: req => this.resolveCredential(resolved, req.field, req.literal),
                };
                this.mcpClient = await factory.create(resolved, mcpTransport, ctx);
            } catch (factoryError) {
                console.warn(
                    `[@theia/ai-mcp] MCPClientFactory "${factory.id}" failed to create an MCPClient ` +
                    `for "${resolved.name}"; invocation events will not fire.`,
                    factoryError,
                );
            }
        }

        this.transport.onerror = error => {
            if (this.isStopped()) {
                return;
            }
            console.error('Error: ', error);
            this.error = 'Error: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        this.client.onerror = error => {
            console.error('Error in MCP client: ', error);
            this.error = 'Error in MCP client: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        try {
            await this.client.connect(this.transport);
            this.setStatus(isLocalMCPServerDescription(resolved) ? MCPServerStatus.Running : MCPServerStatus.Connected);
        } catch (initialConnectError) {
            // SSE fallback — only meaningful when the failed transport was
            // Streamable-HTTP (default for remote descriptions). Plugin
            // providers returning other transport types don't get a
            // fallback; the catch below rethrows in that case.
            if (isRemoteMCPServerDescription(resolved)
                && this.transport instanceof StreamableHTTPClientTransport) {
                console.log(`MCP SSE fallback initiated: ${resolved.serverUrl}`);
                try {
                    await this.client.close();
                } catch {
                    // The streamable client may already be in a bad state;
                    // ignore close errors so we can proceed with SSE.
                }
                const descHeaders = this.buildRemoteHeaders(resolved);
                this.transport = descHeaders
                    ? new SSEClientTransport(new URL(resolved.serverUrl), {
                        eventSourceInit: {
                            fetch: (url, init) => fetch(url, { ...init, headers: descHeaders }),
                        },
                        requestInit: { headers: descHeaders },
                    })
                    : new SSEClientTransport(new URL(resolved.serverUrl));
                try {
                    await this.client.connect(this.transport);
                    this.setStatus(MCPServerStatus.Connected);
                } catch (sseError) {
                    this.error = 'Error on MCP startup: ' + sseError;
                    await this.client.close();
                    this.setStatus(MCPServerStatus.Errored);
                }
            } else {
                this.error = 'Error on MCP startup: ' + initialConnectError;
                await this.client.close();
                this.setStatus(MCPServerStatus.Errored);
            }
        }
    }

    /**
     * Build the outbound header map for a remote description: explicit
     * `headers` map plus the auth token slotted into either
     * `serverAuthTokenHeader` or `Authorization: Bearer ...`. Returns
     * `undefined` when there are no headers to set, so the
     * `StreamableHTTPClientTransport` / `SSEClientTransport` constructor
     * doesn't get an empty `requestInit`.
     */
    protected buildRemoteHeaders(description: MCPServerDescription): Record<string, string> | undefined {
        if (!isRemoteMCPServerDescription(description)) {
            return undefined;
        }
        let headers: Record<string, string> | undefined;
        if (description.headers) {
            headers = { ...description.headers };
        }
        if (description.serverAuthToken) {
            if (!headers) {
                headers = {};
            }
            if (description.serverAuthTokenHeader) {
                headers[description.serverAuthTokenHeader] = description.serverAuthToken;
            } else {
                headers.Authorization = `Bearer ${description.serverAuthToken}`;
            }
        }
        return headers;
    }

    /**
     * Pick the highest-priority {@link MCPClientFactory} from the injected
     * contributions. Returns `undefined` when no factories are wired (e.g.
     * unit tests that construct {@link MCPServer} directly without a
     * factory list) — in that case `start()` skips factory invocation and
     * invocation events are silently a no-op.
     */
    protected pickClientFactory(): MCPClientFactory | undefined {
        if (this.clientFactories.length === 0) {
            return undefined;
        }
        return [...this.clientFactories]
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
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
        // If the LLM-facing name was rewritten by a filter (see
        // `getTools`), translate back to the upstream MCP server's
        // original tool name before calling the SDK.
        const sdkToolName = this.filteredNameToOriginal.get(toolName) ?? toolName;
        const params = {
            name: sdkToolName,
            arguments: args,
        };

        // Fire the public invocation events on the factory-supplied
        // MCPClient. Default-factory clients are picked up via the
        // `__fire*` hooks; plugin clients without those hooks see
        // `false` and silently skip — those plugins own their own event
        // wiring around their own callTool proxy. The argsJSON is the
        // raw incoming JSON so it survives JSON-roundtripping for
        // cross-process consumers.
        if (this.mcpClient) {
            fireDefaultClientWillInvokeTool(this.mcpClient, { toolName, argsJSON: arg_string });
        }
        const startedAt = Date.now();
        try {
            // need to cast since other result schemas (second parameter) might be possible
            const result = await this.client.callTool(params, CallToolResultSchema) as CallToolResult;
            if (this.mcpClient) {
                fireDefaultClientDidInvokeTool(this.mcpClient, {
                    toolName,
                    durationMs: Date.now() - startedAt,
                    ok: true,
                });
            }
            return result;
        } catch (callError) {
            if (this.mcpClient) {
                const err = callError instanceof Error ? callError : new Error(String(callError));
                fireDefaultClientDidInvokeTool(this.mcpClient, {
                    toolName,
                    durationMs: Date.now() - startedAt,
                    ok: false,
                    error: { name: err.name, message: err.message },
                });
            }
            throw callError;
        }
    }

    async getTools(): ReturnType<Client['listTools']> {
        if (!this.isRunning()) {
            return { tools: [] };
        }
        const raw = await this.client.listTools();

        // Rebuild the filter chain on every list — `tools/list_changed`
        // refreshes from the server should be reflected in both the
        // returned tool set and the name-remap that `callTool` consults.
        const newMap = new Map<string, string>();
        const filtered: typeof raw.tools = [];
        for (const tool of raw.tools) {
            const info: ToolInformation = {
                name: tool.name,
                description: tool.description,
            };
            const result = this.applyToolFilters(info);
            if (result === undefined) {
                // Suppressed — exclude from the registered set so the
                // LLM cannot invoke it via the tool registry.
                continue;
            }
            // If the filter chain renamed the tool, remember the original
            // upstream name so `callTool` can translate back.
            const originalName = result.originalName ?? tool.name;
            newMap.set(result.name, originalName);
            filtered.push({
                ...tool,
                name: result.name,
                description: result.description,
            });
        }
        this.filteredNameToOriginal = newMap;

        // Notify factory-supplied MCPClients that the inventory changed
        // (post-filter view). For the default factory this fires the
        // public `onDidAddTools` event so reactive UI can refresh
        // without polling.
        if (this.mcpClient) {
            const infos: ToolInformation[] = filtered.map(t => ({
                name: t.name,
                description: t.description,
            }));
            fireDefaultClientToolsAdded(this.mcpClient, infos);
        }

        return { ...raw, tools: filtered };
    }

    update(description: MCPServerDescription): void {
        this.description = description;

        if (isRemoteMCPServerDescription(description)) {
            this.status = MCPServerStatus.NotConnected;
        } else {
            this.status = MCPServerStatus.NotRunning;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning() || !this.client) {
            return;
        }
        if (isLocalMCPServerDescription(this.description)) {
            console.log(`Stopping MCP server "${this.description.name}"`);
            this.setStatus(MCPServerStatus.NotRunning);
        } else {
            console.log(`Disconnecting MCP server "${this.description.name}"`);
            if (this.transport instanceof StreamableHTTPClientTransport) {
                console.log(`Terminating session for MCP server "${this.description.name}"`);
                await (this.transport as StreamableHTTPClientTransport).terminateSession();
            }
            this.setStatus(MCPServerStatus.NotConnected);
        }
        await this.client.close();
    }

    readResource(resourceId: string): Promise<ReadResourceResult> {
        const params = { uri: resourceId };
        return this.client.readResource(params);
    }

    getResources(): Promise<ListResourcesResult> {
        return this.client.listResources();
    }
}
