// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const MCPTheiaServer = Symbol('MCPTheiaServer');

/**
 * Main interface for the Theia MCP server (backend only)
 */
export interface MCPTheiaServer {
    /**
     * Start the MCP server with the given configuration
     */
    start(): Promise<void>;

    /**
     * Stop the MCP server
     */
    stop(): Promise<void>;

    /**
     * Get the underlying MCP server instance
     */
    getServer(): McpServer | undefined;

    /**
     * Get the server ID
     */
    getServerId(): string | undefined;

    /**
     * Check if the server is running
     */
    isRunning(): boolean;
}

export const MCPBackendContribution = Symbol('MCPBackendContribution');

/**
 * Contribution interface for extending the MCP server with backend-only contributions
 */
export interface MCPBackendContribution {
    /**
     * Configure MCP server (for backend contributions)
     * @param server The MCP server instance to configure
     */
    configure(server: McpServer): Promise<void> | void;
}

export const MCPBackendContributionProvider = Symbol('MCPBackendContributionProvider');
export interface MCPBackendContributionProvider extends ContributionProvider<MCPBackendContribution> { }
