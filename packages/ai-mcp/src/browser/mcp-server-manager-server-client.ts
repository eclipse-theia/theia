// *****************************************************************************
// Copyright (C) 2025 Dirk Fauth and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { MCPServerDescription, MCPServerManager, MCPServerManagerServerClient } from '../common';
import { generateUuid } from '@theia/core/lib/common/uuid';

@injectable()
export class MCPServerManagerServerClientImpl implements MCPServerManagerServerClient {

    protected serverDescriptions: Map<string, MCPServerDescription> = new Map();

    /**
     * Adds a server description to the client. If the description contains a resolve function,
     * a unique resolveId is generated and the original description is stored to be used
     * in resolveServerDescription.
     * @param description The server description to add.
     * @returns The server description with a unique resolveId if a resolve function is provided
     * or the given description if no resolve function is provided.
     */
    addServerDescription(description: MCPServerDescription): MCPServerDescription {
        if (description.resolve) {
            const serverDescription: MCPServerDescription = {
                ...description,
                resolveId: generateUuid(),
            };

            // store the original description to be used in resolveServerDescription
            if (serverDescription.resolveId) {
                this.serverDescriptions.set(serverDescription.resolveId, description);
            }

            return serverDescription;
        }
        return description;
    }

    /**
     * Retrieves the server description for a given server name if the server description contains a resolve function and is therefore stored in the client.
     * The server descriptions without a resolve function are not stored in the client and therefore cannot be retrieved.
     * They are also not synced with the descriptions in the server, so they should not be used in the user interface and solely for resolution purposes.
     * @param name The name of the server to retrieve the description for.
     * @returns The server description if found, or undefined if not found.
     */
    async getServerDescription(name: string): Promise<MCPServerDescription | undefined> {
        for (const description of this.serverDescriptions.values()) {
            if (description.name === name) {
                return description;
            }
        }
        return undefined;
    }

    /**
     * Resolves the server description by calling the resolve function if it exists.
     * @param description The server description to resolve.
     * @returns The resolved server description.
     */
    async resolveServerDescription(description: MCPServerDescription): Promise<MCPServerDescription> {
        if (description.resolveId) {
            const frontendDescription = this.serverDescriptions.get(description.resolveId);
            if (frontendDescription && frontendDescription.resolve) {
                const updated = await frontendDescription.resolve(description);
                if (updated) {
                    this.serverDescriptions.set(description.resolveId, updated);
                    return updated;
                }
            }
        }
        return description;
    }

    /**
     * Synchronizes the server descriptions with the given MCPServerManager.
     * Ensures that server descriptions that are removed from the server are also removed from the client.
     * @param mcpServerManager The MCPServerManager to sync the descriptions with.
     */
    async syncServerDescriptions(mcpServerManager: MCPServerManager): Promise<void> {
        try {
            if (mcpServerManager) {
                const currentServerNames = await mcpServerManager.getServerNames();
                const currentNamesSet = new Set(currentServerNames);

                // Remove descriptions for servers that no longer exist
                for (const [resolveId, description] of this.serverDescriptions.entries()) {
                    if (description.name && !currentNamesSet.has(description.name)) {
                        console.log('REMOVE THE DESCRIPTION FROM CLIENT', description);
                        this.serverDescriptions.delete(resolveId);
                    }
                }
            }
        } catch (error) {
            // Silently ignore errors to avoid breaking the notification flow
            console.warn('Failed to sync server descriptions:', error);
        }
    }
}
