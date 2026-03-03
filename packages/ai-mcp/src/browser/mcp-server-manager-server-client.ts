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
import { MCPServerDescription } from '../common';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { cleanServerDescription, MCPServerDescriptionRCP, MCPServerManagerServerClient } from '../common/mcp-protocol';

type StoredServerInfo = Pick<MCPServerDescription, 'name' | 'resolve'>;

@injectable()
export class MCPServerManagerServerClientImpl implements MCPServerManagerServerClient {

    protected serverDescriptions: Map<string, StoredServerInfo> = new Map();

    addServerDescription(description: MCPServerDescription): MCPServerDescriptionRCP {
        if (description.resolve) {
            const serverDescription: MCPServerDescriptionRCP = {
                ...description,
                resolveId: generateUuid(),
            };

            // store only the name and resolve function
            if (serverDescription.resolveId) {
                this.serverDescriptions.set(serverDescription.resolveId, {
                    name: description.name,
                    resolve: description.resolve
                });
            }

            return serverDescription;
        }
        return description;
    }

    getResolveFunction(name: string): MCPServerDescription['resolve'] {
        for (const storedInfo of this.serverDescriptions.values()) {
            if (storedInfo.name === name) {
                return storedInfo.resolve;
            }
        }
        return undefined;
    }

    async resolveServerDescription(description: MCPServerDescriptionRCP): Promise<MCPServerDescription> {
        const cleanDescription = cleanServerDescription(description);
        if (description.resolveId) {
            const storedInfo = this.serverDescriptions.get(description.resolveId);
            if (storedInfo?.resolve) {
                const updated = await storedInfo.resolve(cleanDescription);
                if (updated) {
                    return updated;
                }
            }
        }
        return cleanDescription;
    }

    cleanServers(serverNames: string[]): void {
        const currentNamesSet = new Set(serverNames);
        // Remove descriptions for servers that no longer exist
        for (const [resolveId, storedInfo] of this.serverDescriptions.entries()) {
            if (storedInfo.name && !currentNamesSet.has(storedInfo.name)) {
                console.debug('Removing a frontend stored resolve function because the corresponding MCP server was removed', storedInfo);
                this.serverDescriptions.delete(resolveId);
            }
        }
    }
}
