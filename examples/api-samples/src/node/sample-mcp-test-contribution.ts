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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCPBackendContribution } from '@theia/ai-mcp-server/lib/node/mcp-theia-server';
import { z } from 'zod';

@injectable()
export class MCPTestContribution implements MCPBackendContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    async configure(server: McpServer): Promise<void> {
        this.logger.info('MCPTestContribution.configure() called - MCP system is working!');

        server.registerTool('test-tool', {
            description: 'Theia MCP server test-tool',
            inputSchema: z.object({})
        }, async () => {
            this.logger.info('test-tool called');
            return {
                content: [{
                    type: 'text',
                    text: 'Test tool executed successfully!'
                }]
            };
        });

        this.logger.info('MCPTestContribution: test-tool registered successfully');
    }
}
