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
export interface MCPServerManager {
    callTool(serverName: string, toolName: any, arg_string: string): unknown;
    removeServer(name: string): unknown;
    addOrUpdateServer(description: MCPServerDescription): unknown;
    getTools(serverName: string): Promise<any>;
    getServerNames(): Promise<String[]>;
    startServer(serverName: string): Promise<void>;
    stopServer(serverName: string): Promise<void>;
    getStartedServers(): Promise<String[]>;
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
    args: string[];
    /**
     * Optional environment variables to set when starting the server.
     */
    env?: { [key: string]: string };
}

export const MCPServerManager = Symbol('MCPServerManager');

export const MCPServerManagerPath = '/services/mcpservermanager';
