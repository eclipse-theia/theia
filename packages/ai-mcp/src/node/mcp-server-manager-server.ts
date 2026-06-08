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

import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerDescription, MCPServerManager } from '../common';
import { cleanServerDescription, MCPServerDescriptionRCP, MCPServerManagerServer, MCPServerManagerServerClient } from '../common/mcp-protocol';

@injectable()
export class MCPServerManagerServerImpl implements MCPServerManagerServer {

    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    protected client: MCPServerManagerServerClient | undefined;

    setClient(client: MCPServerManagerServerClient): void {
        if (this.client && this.client !== client) {
            throw new Error('MCP server manager server is scoped to a single frontend connection.');
        }
        this.client = client;
    }

    disconnectClient(client: MCPServerManagerServerClient): void {
        if (this.client !== undefined && this.client !== client) {
            console.warn('MCP server manager server received disconnectClient for a non-current client; ignoring (one-client-per-container invariant violation).');
            return;
        }
        if (this.client === client) {
            this.client = undefined;
        }
    }

    async addOrUpdateServer(descriptionRCP: MCPServerDescriptionRCP): Promise<void> {
        const description = cleanServerDescription(descriptionRCP);
        if (descriptionRCP.resolveId) {
            description.resolve = async (desc: MCPServerDescription) => {
                if (this.client) {
                    // Discard `resolve` explicitly: it's a function and must not cross the RPC boundary.
                    const { resolve: _resolve, ...descWithoutResolve } = desc;
                    const descRCP: MCPServerDescriptionRCP = {
                        ...descWithoutResolve,
                        resolveId: descriptionRCP.resolveId
                    };
                    return this.client.resolveServerDescription(descRCP);
                }
                return desc;
            };
        }
        await this.mcpServerManager.addOrUpdateServer(description);
    }
}
