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

import { UriComponents } from './uri-components';

/**
 * Protocol interfaces for MCP server definition providers.
 */

export interface McpStdioServerDefinitionDto {
    /**
     * The human-readable name of the server.
     */
    readonly label: string;

    /**
     * The working directory used to start the server.
     */
    cwd?: UriComponents;

    /**
     * The command used to start the server. Node.js-based servers may use
     * `process.execPath` to use the editor's version of Node.js to run the script.
     */
    command: string;

    /**
     * Additional command-line arguments passed to the server.
     */
    args?: string[];

    /**
     * Optional additional environment information for the server. Variables
     * in this environment will overwrite or remove (if null) the default
     * environment variables of the editor's extension host.
     */
    env?: Record<string, string | number | null>;

    /**
     * Optional version identification for the server. If this changes, the
     * editor will indicate that tools have changed and prompt to refresh them.
     */
    version?: string;

}

/**
 * McpHttpServerDefinition represents an MCP server available using the
 * Streamable HTTP transport.
 */
export interface McpHttpServerDefinitionDto {
    /**
     * The human-readable name of the server.
     */
    readonly label: string;

    /**
     * The URI of the server. The editor will make a POST request to this URI
     * to begin each session.
     */
    uri: UriComponents;

    /**
     * Optional additional heads included with each request to the server.
     */
    headers?: Record<string, string>;

    /**
     * Optional version identification for the server. If this changes, the
     * editor will indicate that tools have changed and prompt to refresh them.
     */
    version?: string;
}

/**
 * Definitions that describe different types of Model Context Protocol servers,
 * which can be returned from the {@link McpServerDefinitionProvider}.
 */
export type McpServerDefinitionDto = McpStdioServerDefinitionDto | McpHttpServerDefinitionDto;
export const isMcpHttpServerDefinitionDto = (definition: McpServerDefinitionDto): definition is McpHttpServerDefinitionDto => 'uri' in definition;
/**
 * Main side of the MCP server definition registry.
 */
export interface McpServerDefinitionRegistryMain {
    /**
     * Register an MCP server definition provider.
     */
    $registerMcpServerDefinitionProvider(handle: number, name: string): void;

    /**
     * Unregister an MCP server definition provider.
     */
    $unregisterMcpServerDefinitionProvider(handle: number): void;

    /**
     * Notify that server definitions have changed.
     */
    $onDidChangeMcpServerDefinitions(handle: number): void;

    /**
     * Get server definitions from a provider.
     */
    $getServerDefinitions(handle: number): Promise<McpServerDefinitionDto[]>;

    /**
     * Resolve a server definition.
     */
    $resolveServerDefinition(handle: number, server: McpServerDefinitionDto): Promise<McpServerDefinitionDto | undefined>;
}

/**
 * Extension side of the MCP server definition registry.
 */
export interface McpServerDefinitionRegistryExt {
    /**
     * Request server definitions from a provider.
     */
    $provideServerDefinitions(handle: number): Promise<McpServerDefinitionDto[]>;

    /**
     * Resolve a server definition from a provider.
     */
    $resolveServerDefinition(handle: number, server: McpServerDefinitionDto): Promise<McpServerDefinitionDto | undefined>;
}
