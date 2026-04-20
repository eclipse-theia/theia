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
    isLocalMCPServerDescription, isRemoteMCPServerDescription, MCPServerDescription,
    MCPServerStatus, ToolInformation,
    MCPTransportProvider, MCPToolFilter, MCPToolFilterOutcome,
    MCPClientFactory, MCPCredentialResolver,
} from '../common';
import { Emitter } from '@theia/core/lib/common/event.js';
import { CallToolResult, CallToolResultSchema, ListResourcesResult, ListRootsRequestSchema, ListRootsResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SdkTransportAdapter } from './mcp-transport-adapter';

export class MCPServer {
    private description: MCPServerDescription;
    private transport: Transport;
    private client: Client;
    private error?: string;
    private status: MCPServerStatus;
    private workspaceRoots: string[] | undefined;

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
     * Client factory contributions are accepted but not yet consumed: see the
     * Phase C follow-up in the RFC. The type is declared here so plugins
     * binding the contribution point today do not break once it is wired.
     */
    /** Placeholder for the forthcoming client-factory consumption — see `MCPServer` docstring. */
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

    async getDescription(): Promise<MCPServerDescription> {
        let toReturnTools: ToolInformation[] | undefined = undefined;
        if (this.isRunning()) {
            try {
                const { tools } = await this.getTools();
                toReturnTools = tools
                    .map(tool => ({
                        name: tool.name,
                        description: tool.description
                    }))
                    .map(tool => this.applyToolFilters(tool))
                    .filter((tool): tool is ToolInformation => tool !== undefined);
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
     * Run the tool-filter chain (priority-descending) against a single tool.
     * Returns `undefined` when any filter suppresses the tool; returns the
     * (possibly rewritten) tool otherwise.
     */
    protected applyToolFilters(tool: ToolInformation): ToolInformation | undefined {
        if (this.toolFilters.length === 0) {
            return tool;
        }
        const ordered = [...this.toolFilters].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        let current: ToolInformation = tool;
        for (const filter of ordered) {
            const outcome: MCPToolFilterOutcome = filter.filter(this.description.name, current);
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
                    field,
                    literal,
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
        // `${mcp:credential}`) into concrete values by running the credential
        // resolver chain. Descriptions without sentinels are returned
        // unchanged, preserving today's behaviour. We update `this.description`
        // so that both the transport-provider path and the inline fallback
        // path see the resolved values.
        this.description = await this.materialiseCredentials(this.description);

        let connected = false;

        // if the preference useWorkspaceRoots is set to false, we will receive undefined here
        // in that case the MCP server should have access to the entire filesystem, i.e. we don't configure roots
        if (!this.workspaceRoots) {
            this.client = new Client(
                {
                    name: 'theia-client',
                    version: '1.0.0',
                },
                {
                    capabilities: {}
                }
            );
        } else {
            this.client = new Client(
                {
                    name: 'theia-client',
                    version: '1.0.0',
                },
                {
                    capabilities: {
                        roots: {
                            listChanged: true
                        }
                    }
                }
            );
            // Register request handler to provide workspace roots when server requests them
            this.client.setRequestHandler(ListRootsRequestSchema, async () => {
                const roots = this.workspaceRoots?.map(uri => ({
                    uri,
                    name: uri.split('/').pop() || uri
                }));
                return { roots } as ListRootsResult;
            });
        }
        this.error = undefined;

        // Extension-point: consult transport providers first; fall back to
        // the inline construction when no provider matches so existing
        // deployments without any plugin bindings see zero behavioural change.
        const customProvider = this.pickTransportProvider(this.description);
        if (customProvider) {
            this.setStatus(
                isLocalMCPServerDescription(this.description)
                    ? MCPServerStatus.Starting
                    : MCPServerStatus.Connecting,
            );
            console.log(
                `Starting server "${this.description.name}" via transport provider "${customProvider.id}"`,
            );
            const adapter = await customProvider.create(this.description, new AbortController().signal);
            // Unwrap the SDK transport from the adapter (the default providers
            // wrap via SdkTransportAdapter). Third-party providers that bring
            // their own transport implementation need to supply an adapter
            // that extends SdkTransportAdapter so this cast still succeeds.
            if (adapter instanceof SdkTransportAdapter) {
                this.transport = adapter.sdkTransport;
            } else {
                throw new Error(
                    `Transport provider "${customProvider.id}" returned a non-SDK transport; `
                    + 'custom transports must extend SdkTransportAdapter until MCPServer gains '
                    + 'native support for the narrower MCPTransport interface.',
                );
            }
        } else if (isLocalMCPServerDescription(this.description)) {
            this.setStatus(MCPServerStatus.Starting);
            console.log(
                `Starting server "${this.description.name}" with command: ${this.description.command} ` +
                `and args: ${this.description.args?.join(' ')} and env: ${JSON.stringify(this.description.env)}`
            );

            // Filter process.env to exclude undefined values
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

            let descHeaders;
            if (this.description.headers) {
                descHeaders = this.description.headers;
            }

            // create header for auth token
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

            if (descHeaders) {
                this.transport = new StreamableHTTPClientTransport(new URL(this.description.serverUrl), {
                    requestInit: { headers: descHeaders },
                });
            } else {
                this.transport = new StreamableHTTPClientTransport(new URL(this.description.serverUrl));
            }

            try {
                await this.client.connect(this.transport);
                connected = true;
                console.log(`MCP Streamable HTTP successful connected: ${this.description.serverUrl}`);
            } catch (e) {
                console.log(`MCP SSE fallback initiated: ${this.description.serverUrl}`);
                await this.client.close();
                if (descHeaders) {
                    this.transport = new SSEClientTransport(new URL(this.description.serverUrl), {
                        eventSourceInit: {
                            fetch: (url, init) =>
                                fetch(url, { ...init, headers: descHeaders }),
                        },
                        requestInit: { headers: descHeaders },
                    });
                } else {
                    this.transport = new SSEClientTransport(new URL(this.description.serverUrl));
                }
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
            if (!connected) {
                await this.client.connect(this.transport);
            }
            this.setStatus(isLocalMCPServerDescription(this.description) ? MCPServerStatus.Running : MCPServerStatus.Connected);
        } catch (e) {
            this.error = 'Error on MCP startup: ' + e;
            await this.client.close();
            this.setStatus(MCPServerStatus.Errored);
        }
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
        // need to cast since other result schemas (second parameter) might be possible
        return this.client.callTool(params, CallToolResultSchema) as Promise<CallToolResult>;
    }

    async getTools(): ReturnType<Client['listTools']> {
        if (this.isRunning()) {
            return this.client.listTools();
        }
        return { tools: [] };
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
