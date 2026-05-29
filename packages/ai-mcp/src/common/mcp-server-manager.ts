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

import type { CallToolResult, ListResourcesResult, ListToolsResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';
import { Event } from '@theia/core/lib/common/event';

export const MCPFrontendService = Symbol('MCPFrontendService');
export interface MCPFrontendService {
    startServer(serverName: string): Promise<void>;
    hasServer(serverName: string): Promise<boolean>;
    isServerStarted(serverName: string): Promise<boolean>;
    registerToolsForAllStartedServers(): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    addOrUpdateServer(description: MCPServerDescription): Promise<void>;
    getStartedServers(): Promise<string[]>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    getTools(serverName: string): Promise<ListToolsResult | undefined>;
    getPromptTemplateId(serverName: string): string;
    /**
     * Push the current workspace trust level down to the backend so that
     * `MCPToolFilter`s see a meaningful `workspaceTrustLevel` in their
     * context. Called by the frontend application contribution on init
     * and on `WorkspaceTrustService.onDidChangeWorkspaceTrust`. The
     * backend-side `WorkspaceTrustService` does not exist (it is a
     * browser module), so the value must be pushed.
     */
    setWorkspaceTrustLevel(level: 'trusted' | 'restricted' | 'unknown'): Promise<void>;
}

export const MCPFrontendNotificationService = Symbol('MCPFrontendNotificationService');
export interface MCPFrontendNotificationService {
    readonly onDidUpdateMCPServers: Event<void>;
    didUpdateMCPServers(): void;
}

export interface MCPServer {
    callTool(toolName: string, arg_string: string): Promise<CallToolResult>;
    getTools(): Promise<ListToolsResult>;
    readResource(resourceId: string): Promise<ReadResourceResult>;
    getResources(): Promise<ListResourcesResult>;
    description: MCPServerDescription;
}

export interface MCPServerManager {
    callTool(serverName: string, toolName: string, arg_string: string): Promise<CallToolResult>;
    removeServer(name: string): void;
    addOrUpdateServer(description: MCPServerDescription): void;
    getTools(serverName: string): Promise<ListToolsResult>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    startServer(serverName: string): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    getRunningServers(): Promise<string[]>;
    setClient(client: MCPFrontendNotificationService): void;
    disconnectClient(client: MCPFrontendNotificationService): void;
    readResource(serverName: string, resourceId: string): Promise<ReadResourceResult>;
    getResources(serverName: string): Promise<ListResourcesResult>;
    setWorkspaceRoots(roots: string[] | undefined): void;
    /**
     * See {@link MCPFrontendService.setWorkspaceTrustLevel}. The backend
     * caches the value and exposes it to {@link MCPToolFilter}s through
     * the filter context.
     */
    setWorkspaceTrustLevel(level: 'trusted' | 'restricted' | 'unknown'): void;
}

export interface ToolInformation {
    name: string;
    description?: string;
    /**
     * The tool's name as advertised by the upstream MCP server, before
     * any rewrites by the {@link MCPToolFilter} chain. Filters that
     * rename a tool MUST preserve this if not already set, so downstream
     * filters and consent UIs can attribute the tool back to its origin.
     */
    originalName?: string;
    /**
     * Free-form provenance tag identifying the tool's upstream origin.
     * Useful in federated / gateway-fronted topologies (e.g. an MCP
     * gateway that fronts multiple upstream servers under one connection)
     * where `serverName` alone doesn't tell consumers which physical
     * server backed the tool. Conventional values: the upstream server
     * name (`"github-mcp-server"`), or `"<gateway>:<upstream>"`
     * (`"agentgateway:jira"`).
     */
    provenance?: string;
}

export enum MCPServerStatus {
    NotRunning = 'Not Running',
    NotConnected = 'Not Connected',
    Starting = 'Starting',
    Connecting = 'Connecting',
    Running = 'Running',
    Connected = 'Connected',
    Errored = 'Errored'
}

export interface BaseMCPServerDescription {
    /**
     * The unique name of the MCP server.
     */
    name: string;

    /**
     * Flag indicating whether the server should automatically start when the application starts.
     */
    autostart?: boolean;

    /**
     * The current status of the server. Optional because only set by the server.
     */
    status?: MCPServerStatus;

    /**
     * Last error message that the server has returned.
     */
    error?: string;

    /**
     * List of available tools for the server. Returns the name and description if available.
     */
    tools?: ToolInformation[];

    /**
     * Optional resolve function that gets called during server definition resolution.
     * This function can be used to dynamically modify server configurations,
     * resolve environment variables, validate configurations, or perform any
     * necessary preprocessing before the server starts.
     *
     * @param description The current server description
     * @returns A promise that resolves to the processed server description
     */
    resolve?: (description: MCPServerDescription) => Promise<MCPServerDescription>;
}

export interface LocalMCPServerDescription extends BaseMCPServerDescription {
    /**
     * The command to execute the MCP server.
     */
    command: string;

    /**
     * An array of arguments to pass to the command.
     */
    args?: string[];

    /**
     * Optional environment variables to set when starting the server.
     */
    env?: { [key: string]: string };
}

export interface RemoteMCPServerDescription extends BaseMCPServerDescription {
    /**
     * The URL of the remote MCP server.
     */
    serverUrl: string;

    /**
     * The authentication token for the server, if required.
     */
    serverAuthToken?: string;

    /**
     * The header name to use for the server authentication token.
     */
    serverAuthTokenHeader?: string;

    /**
     * Optional additional headers to include in requests to the server.
     */
    headers?: Record<string, string>;

    /**
     * Optional shell command that emits credential JSON to stdout — same
     * shape as `git credential-helper` / `kubectl exec-credential`. When
     * a `serverAuthToken` or any `headers` value is the sentinel
     * `${helper}` (or `${helper:fieldName}`), the
     * `HeadersHelperCredentialResolver` invokes this command with
     * `MCP_SERVER_NAME` and `MCP_SERVER_URL` in env, parses the JSON,
     * and uses the `field` (or explicit `fieldName`) as the lookup key.
     *
     * Hard-gated on workspace trust: the helper only runs when the
     * frontend has pushed `workspaceTrustLevel: 'trusted'` to the
     * backend. Untrusted / unknown workspaces fall through silently so
     * an attacker-supplied project config can't run arbitrary code.
     */
    headersHelper?: string;
}

export interface InProcessMCPServerDescription extends BaseMCPServerDescription {
    /**
     * Marker discriminating this variant from local (subprocess) and
     * remote (HTTP/SSE) servers. The MCP server lives in the same
     * Node.js process as Theia's backend; transport is a linked-pair
     * memory channel created by `createInProcessTransportPair`.
     *
     * In-process servers have no `command` and no `serverUrl` because
     * their lifecycle is owned by the contributing plugin, not by a
     * subprocess or remote endpoint. The plugin writes its own
     * `MCPTransportProvider` to wire the linked pair into a
     * server-side `Server` from `@modelcontextprotocol/sdk/server`.
     *
     * Typically registered programmatically by a plugin's
     * `BackendApplicationContribution.onStart` rather than via user
     * preferences — these descriptions identify a plugin-bundled
     * capability surface rather than an operator-managed connection.
     */
    kind: 'in-process';
}

export type MCPServerDescription =
    | LocalMCPServerDescription
    | RemoteMCPServerDescription
    | InProcessMCPServerDescription;

export function isLocalMCPServerDescription(description: MCPServerDescription): description is LocalMCPServerDescription {
    return (description as LocalMCPServerDescription).command !== undefined;
}
export function isRemoteMCPServerDescription(description: MCPServerDescription): description is RemoteMCPServerDescription {
    return (description as RemoteMCPServerDescription).serverUrl !== undefined;
}
export function isInProcessMCPServerDescription(description: MCPServerDescription): description is InProcessMCPServerDescription {
    return (description as InProcessMCPServerDescription).kind === 'in-process';
}

export const MCPServerManager = Symbol('MCPServerManager');
export const MCPServerManagerPath = '/services/mcpservermanager';
