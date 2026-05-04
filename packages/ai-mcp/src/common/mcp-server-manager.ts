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
import { MCPOAuthConfig } from './mcp-oauth';

export const MCPFrontendService = Symbol('MCPFrontendService');
export interface MCPFrontendService {
    startServer(serverName: string): Promise<void>;
    /**
     * Starts a server initiated by a direct user action. Permits the OAuth flow to launch the user's
     * default browser when authorization is required.
     *
     * @returns `true` when the start was attempted; `false` when a pre-flight check failed (the pre-flight
     *          has already surfaced its own diagnostic).
     */
    startServerInteractive(serverName: string): Promise<boolean>;
    /**
     * Runs the OAuth sign-in flow for a remote OAuth server without leaving the server running.
     * The obtained tokens stay in the credential store, so subsequent starts connect silently.
     *
     * @returns `true` when the sign-in completed; `false` when a pre-flight check failed (the pre-flight
     *          has already surfaced its own diagnostic) or the authorization handshake did not complete.
     */
    signIn(serverName: string): Promise<boolean>;
    hasServer(serverName: string): Promise<boolean>;
    isServerStarted(serverName: string): Promise<boolean>;
    registerToolsForAllStartedServers(): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    signOut(serverName: string): Promise<void>;
    hasStoredOAuthCredentials(serverName: string): Promise<boolean>;
    addOrUpdateServer(description: MCPServerDescription): Promise<void>;
    getStartedServers(): Promise<string[]>;
    /** See {@link MCPServerManager.getActiveServers}; this delegates to it. */
    getActiveServers(): Promise<string[]>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    getTools(serverName: string): Promise<ListToolsResult | undefined>;
    getPromptTemplateId(serverName: string): string;
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

export const MCPServerManager = Symbol('MCPServerManager');
export interface MCPServerManager {
    callTool(serverName: string, toolName: string, arg_string: string): Promise<CallToolResult>;
    /**
     * Removes a server and waits for lifecycle cleanup such as OAuth authorization cancellation and credential removal.
     */
    removeServer(name: string): Promise<void>;
    /**
     * Adds or updates a server and waits until manager state is safe for dependent follow-up operations such as autostart.
     */
    addOrUpdateServer(description: MCPServerDescription): Promise<void>;
    getTools(serverName: string): Promise<ListToolsResult>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    /**
     * @param options.interactive `true` when the start was initiated by a direct user action;
     *        `false` (default) for autostart and other non-interactive paths. Non-interactive starts
     *        do not launch a browser for OAuth authorization.
     */
    startServer(serverName: string, options?: { interactive?: boolean }): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    signOut(serverName: string): Promise<void>;
    hasStoredOAuthCredentials(serverName: string): Promise<boolean>;
    getRunningServers(): Promise<string[]>;
    /**
     * Returns names of all servers whose status is not terminal-stopped. Includes transient pre-running
     * states and `Errored`. Use for operations that must interrupt servers regardless of lifecycle progress.
     */
    getActiveServers(): Promise<string[]>;
    setClient(client: MCPFrontendNotificationService): void;
    disconnectClient(client: MCPFrontendNotificationService): void;
    readResource(serverName: string, resourceId: string): Promise<ReadResourceResult>;
    getResources(serverName: string): Promise<ListResourcesResult>;
    setWorkspaceRoots(roots: string[] | undefined): void;
}

export interface ToolInformation {
    name: string;
    description?: string;
}

export enum MCPServerStatus {
    NotRunning = 'Not Running',
    NotConnected = 'Not Connected',
    Starting = 'Starting',
    Connecting = 'Connecting',
    Running = 'Running',
    Connected = 'Connected',
    AuthenticationRequired = 'Authentication Required',
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
     * If `true`, all tools provided by this server are marked as deferred in the
     * generated prompt fragment (`mcp_<name>_tools`). Deferred tools are not
     * loaded into the model's context upfront and may instead be discovered
     * on-demand via the model provider's built-in tool search mechanism
     * (Anthropic, OpenAI) when supported by the provider. Individual tools
     * may still be referenced explicitly without the deferred marker.
     */
    deferLoading?: boolean;

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
     */
    resolve?: (description: MCPServerDescription) => Promise<MCPServerDescription | undefined>;

    /**
     * If set, provenance metadata for a server installed from an AI registry.
     * Written by `@theia/ai-registry` on install / link / fix / update; not user-editable.
     */
    registryMetadata?: MCPRegistryMetadata;
}

/**
 * Provenance metadata for an MCP server linked to an AI registry approval. Grouped
 * under a single `registryMetadata` block in {@link BaseMCPServerDescription} and in
 * the `ai-features.mcp.mcpServers` preference so registry-link data stays visually
 * separated from the server configuration the user edits.
 */
export interface MCPRegistryMetadata {
    /** Identifies the AI registry entry this server was installed from. */
    serverId: string;

    /**
     * Registry-published version recorded at install / link / fix / update time.
     * Kept purely for display in the UI; the registry may publish a different version
     * later, but we don't want to lose the version the user actually installed.
     * Update detection uses {@link configHash} instead.
     */
    version?: string;

    /**
     * Content hash of the registry approval that produced this entry. Used to detect
     * when the registry has published a new approval for this server. Do not use
     * {@link version} for update checks - it is display-only.
     */
    configHash?: string;
}

/**
 * Subset of an MCP server's persisted configuration that an install flow may carry:
 * either set by a registry entry or hand-crafted in an install URL. Lives in `common`
 * so `@theia/ai-registry` (which resolves registry entries in `common`) can reference
 * the same canonical shape the browser-side install path writes.
 */
export interface MCPInstallEntryConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    serverUrl?: string;
    serverAuthToken?: string;
    serverAuthTokenHeader?: string;
    headers?: Record<string, string>;
}

export interface LocalMCPServerDescription extends BaseMCPServerDescription {
    /**
     * The command to start the MCP server.
     */
    command: string;
    /**
     * Arguments for the MCP server command.
     */
    args?: string[];
    /**
     * Environment variables for the MCP server process.
     */
    env?: { [key: string]: string };
}

export interface RemoteMCPServerDescription extends BaseMCPServerDescription {
    /**
     * URL of the remote MCP server endpoint.
     */
    serverUrl: string;
    /**
     * Optional static bearer token for remote MCP servers that do not use OAuth.
     */
    serverAuthToken?: string;
    /**
     * Optional header name for the static server authentication token.
     */
    serverAuthTokenHeader?: string;
    /**
     * Optional additional request headers for the remote MCP server.
     */
    headers?: Record<string, string>;
    /**
     * Optional OAuth configuration for remote MCP servers.
     */
    oauth?: MCPOAuthConfig;
}

export type MCPServerDescription = LocalMCPServerDescription | RemoteMCPServerDescription;

export function isLocalMCPServerDescription(description: MCPServerDescription): description is LocalMCPServerDescription {
    return 'command' in description;
}

export function isRemoteMCPServerDescription(description: MCPServerDescription): description is RemoteMCPServerDescription {
    return 'serverUrl' in description;
}

export const MCPServerManagerPath = '/services/mcpservermanager';
