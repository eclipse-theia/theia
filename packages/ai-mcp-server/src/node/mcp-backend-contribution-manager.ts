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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { MCPBackendContribution } from './mcp-theia-server';

/**
 * Manages the registration of backend MCP contributions
 */
@injectable()
export class MCPBackendContributionManager {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ContributionProvider)
    @named(MCPBackendContribution)
    protected readonly contributions: ContributionProvider<MCPBackendContribution>;

    /**
     * Register all backend contributions with the MCP server
     */
    async registerBackendContributions(server: McpServer): Promise<void> {
        const contributions = this.contributions.getContributions();
        this.logger.info(`Found ${contributions.length} backend MCP contributions to register`);

        for (const contribution of contributions) {
            try {
                this.logger.info(`Configuring backend MCP contribution: ${contribution.constructor.name}`);
                await contribution.configure(server);
                this.logger.info(`Successfully registered backend MCP contribution: ${contribution.constructor.name}`);
            } catch (error) {
                this.logger.error(`Failed to register backend MCP contribution ${contribution.constructor.name}:`, error);
                throw error;
            }
        }

        this.logger.info(`Finished registering all ${contributions.length} backend MCP contributions`);
    }
}
