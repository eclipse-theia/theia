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
import { injectable } from "@theia/core/shared/inversify";
import { MCPServerManager, MCPServerManagerClient } from "../common/mcp-server-manager";


@injectable()
export class MCPServerManagerImpl implements MCPServerManager {
    client: MCPServerManagerClient;
    public setClient(client: MCPServerManagerClient): void {
        this.client = client;
    }



    public startServer(): void {
        //Spawn a process npx -y @modelcontextprotocol/server-memory
        console.log('Starting server');
        const { exec } = require('child_process');
        exec('npx -y @modelcontextprotocol/server-memory', (error: { message: any; }, stdout: any, stderr: any) => {
            if (error) {
                this.client.log(`Error starting MCP Server: ${error.message}`);
                return;
            }
            if (stderr) {
                this.client.log(`MCP Server stderr: ${stderr}`);
                return;
            }
            this.client.log(`MCP Server started successfully: ${stdout}`);
        });
    }
}
