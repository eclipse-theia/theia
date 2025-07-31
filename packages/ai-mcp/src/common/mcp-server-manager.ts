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

import { CallToolResult, ListResourcesResult, ListToolsResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';
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
}

export type MCPServerDescription = LocalMCPServerDescription | RemoteMCPServerDescription;

export function isLocalMCPServerDescription(description: MCPServerDescription): description is LocalMCPServerDescription {
    return (description as LocalMCPServerDescription).command !== undefined;
}
export function isRemoteMCPServerDescription(description: MCPServerDescription): description is RemoteMCPServerDescription {
    return (description as RemoteMCPServerDescription).serverUrl !== undefined;
}

export const MCPServerManager = Symbol('MCPServerManager');
export const MCPServerManagerPath = '/services/mcpservermanager';
