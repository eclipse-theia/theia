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

    protected client: MCPServerManagerServerClient;

    setClient(client: MCPServerManagerServerClient): void {
        this.client = client;
    }

    async addOrUpdateServer(descriptionRCP: MCPServerDescriptionRCP): Promise<void> {
        const description = cleanServerDescription(descriptionRCP);
        if (descriptionRCP.resolveId) {
            description.resolve = async (desc: MCPServerDescription) => {
                if (this.client) {
                    const descRCP: MCPServerDescriptionRCP = {
                        ...desc,
                        resolveId: descriptionRCP.resolveId
                    };
                    return this.client.resolveServerDescription(descRCP);
                }
                return desc; // Fallback if no client is set
            };
        };
        this.mcpServerManager.addOrUpdateServer(description);
    }
}
