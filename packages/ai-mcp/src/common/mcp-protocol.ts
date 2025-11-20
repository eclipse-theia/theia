// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { MCPServerDescription } from './mcp-server-manager';

/**
 * MCPServerDescriptionRCP is a version of MCPServerDescription that can be sent over RCP.
 * It omits the 'resolve' function and instead includes an optional 'resolveId' to identify
 * the resolve function on the client side.
 */
export type MCPServerDescriptionRCP = Omit<MCPServerDescription, 'resolve'> & {
    resolveId?: string;
};

export const MCPServerManagerServer = Symbol('MCPServerManagerServer');
export const MCPServerManagerServerPath = '/services/mcpservermanagerserver';

/**
 * The MCPServerManagerServer handles the RCP specialties of adding server descriptions from the frontend
 */
export interface MCPServerManagerServer {
    addOrUpdateServer(description: MCPServerDescriptionRCP): Promise<void>;
    setClient(client: MCPServerManagerServerClient): void
}

export const MCPServerManagerServerClient = Symbol('MCPServerManagerServerClient');
export interface MCPServerManagerServerClient {
    /**
     * Adds a server description to the client. If the description contains a resolve function,
     * a unique resolveId is generated and only the name and resolve function are stored.
     * @param description The server description to add.
     * @returns The server description with a unique resolveId if a resolve function is provided
     * or the given description if no resolve function is provided.
     */
    addServerDescription(description: MCPServerDescription): MCPServerDescriptionRCP;
    /**
     * Retrieves the resolve function for a given server name.
     * @param name The name of the server to retrieve the resolve function for.
     * @returns The resolve function if found, or undefined if not found.
     */
    getResolveFunction(name: string): MCPServerDescription['resolve'];
    /**
     * Resolves the server description by calling the resolve function if it exists.
     * @param description The server description to resolve.
     * @returns The resolved server description.
     */
    resolveServerDescription(description: MCPServerDescriptionRCP): Promise<MCPServerDescription>;
    /**
     * Removes server descriptions that are no longer present in the MCPServerManager.
     *
     * @param serverNames The current list of server names from the MCPServerManager.
     */
    cleanServers(serverNames: string[]): void;
}

/**
 * Util function to convert a MCPServerDescriptionRCP to a MCPServerDescription by removing the resolveId.
 */
export const cleanServerDescription = (description: MCPServerDescriptionRCP): MCPServerDescription => {
    const { resolveId, ...descriptionProperties } = description;
    return { ...descriptionProperties } as MCPServerDescription;
};
