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

import { MCPFrontendService, RemoteMCPServerDescription } from '@theia/ai-mcp';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, QuickInputService } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class ResolveMcpFrontendContribution
    implements FrontendApplicationContribution {

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(ILogger) @named('api-samples')
    protected readonly logger: ILogger;

    async onStart(): Promise<void> {
        const githubServer: RemoteMCPServerDescription = {
            name: 'github',
            serverUrl: 'https://api.githubcopilot.com/mcp/',
            resolve: async serverDescription => {
                this.logger.debug('Resolving GitHub MCP server description');

                // Prompt user for authentication token
                const authToken = await this.quickInputService.input({
                    prompt: 'Enter authentication token for GitHubMCP server',
                    password: true,
                    value: 'serverAuthToken' in serverDescription ? serverDescription.serverAuthToken || '' : ''
                });

                if (authToken) {
                    // Return updated server description with new token
                    return {
                        ...serverDescription,
                        serverAuthToken: authToken
                    } as RemoteMCPServerDescription;
                }

                // If no token provided, return original description
                return serverDescription;
            }
        };
        this.mcpFrontendService.addOrUpdateServer(githubServer);
    }
}
