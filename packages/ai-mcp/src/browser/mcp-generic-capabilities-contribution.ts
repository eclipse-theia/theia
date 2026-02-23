// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { Event } from '@theia/core';
import {
    CapabilityType,
    GenericCapabilitiesContribution,
    GenericCapabilityGroup,
    GenericCapabilityItem
} from '@theia/ai-core';
import { MCPFrontendService, MCPFrontendNotificationService } from '../common/mcp-server-manager';

/**
 * Contributes MCP tool functions as generic capabilities for selection in the chat UI.
 */
@injectable()
export class MCPGenericCapabilitiesContribution implements GenericCapabilitiesContribution {

    readonly capabilityType: CapabilityType = 'mcpFunctions';

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPFrontendNotificationService)
    protected readonly mcpNotificationService: MCPFrontendNotificationService;

    get onDidChange(): Event<void> {
        return this.mcpNotificationService.onDidUpdateMCPServers;
    }

    async getAvailableCapabilities(): Promise<GenericCapabilityGroup[]> {
        const groups: GenericCapabilityGroup[] = [];
        const startedServers = await this.mcpFrontendService.getStartedServers();

        for (const serverName of startedServers) {
            const tools = await this.mcpFrontendService.getTools(serverName);
            if (tools?.tools && tools.tools.length > 0) {
                const items: GenericCapabilityItem[] = tools.tools.map(tool => ({
                    id: `mcp_${serverName}_${tool.name}`,
                    name: tool.name,
                    group: serverName,
                    description: tool.description
                }));
                groups.push({
                    name: serverName,
                    items
                });
            }
        }

        return groups;
    }
}
