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

import type { Client } from '@modelcontextprotocol/sdk/client/index';
import { Event } from '@theia/core/lib/common/event';

export const MCPFrontendService = Symbol('MCPFrontendService');
export interface MCPFrontendService {
    startServer(serverName: string): Promise<void>;
    registerToolsForAllStartedServers(): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    addOrUpdateServer(description: MCPServerDescription): Promise<void>;
    getStartedServers(): Promise<string[]>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    getTools(serverName: string): Promise<ReturnType<MCPServer['getTools']> | undefined>;
    getPromptTemplateId(serverName: string): string;
}

export const MCPFrontendNotificationService = Symbol('MCPFrontendNotificationService');
export interface MCPFrontendNotificationService {
    readonly onDidUpdateMCPServers: Event<void>;
    didUpdateMCPServers(): void;
}

export interface MCPServer {
    callTool(toolName: string, arg_string: string): ReturnType<Client['callTool']>;
    getTools(): ReturnType<Client['listTools']>;
    description: MCPServerDescription;
}

export interface MCPServerManager {
    callTool(serverName: string, toolName: string, arg_string: string): ReturnType<MCPServer['callTool']>;
    removeServer(name: string): void;
    addOrUpdateServer(description: MCPServerDescription): void;
    getTools(serverName: string): ReturnType<MCPServer['getTools']>;
    getServerNames(): Promise<string[]>;
    getServerDescription(name: string): Promise<MCPServerDescription | undefined>;
    startServer(serverName: string): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    getRunningServers(): Promise<string[]>;
    setClient(client: MCPFrontendNotificationService): void;
    disconnectClient(client: MCPFrontendNotificationService): void;
}

export interface ToolInformation {
    name: string;
    description?: string;
}

export enum MCPServerStatus {
    NotRunning = 'Not Running',
    Starting = 'Starting',
    Running = 'Running',
    Errored = 'Errored'
}

export interface MCPServerDescription {
    /**
     * The unique name of the MCP server.
     */
    name: string;

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

export const MCPServerManager = Symbol('MCPServerManager');
export const MCPServerManagerPath = '/services/mcpservermanager';
