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

import type {Client} from '@modelcontextprotocol/sdk/client/index';

export interface MCPServer {
    callTool(toolName: string, arg_string: string): ReturnType<Client['callTool']>;
    getTools(): ReturnType<Client['listTools']>;

    listResources(): ReturnType<Client['listResources']>;

    readResource(resourceId: string): ReturnType<Client['readResource']>;
}

export interface MCPServerManager {
    callTool(serverName: string, toolName: string, arg_string: string): ReturnType<MCPServer['callTool']>;
    removeServer(name: string): void;
    addOrUpdateServer(description: MCPServerDescription): void;
    getTools(serverName: string): ReturnType<MCPServer['getTools']>
    getServerNames(): Promise<string[]>;
    startServer(serverName: string): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    getStartedServers(): Promise<string[]>;

    listResources(serverName: string): ReturnType<MCPServer['listResources']>;

    readResource(serverName: string, resourceId: string): ReturnType<MCPServer['readResource']>;
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
}

export const MCPServerManager = Symbol('MCPServerManager');
export const MCPServerManagerPath = '/services/mcpservermanager';
