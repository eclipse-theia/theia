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
import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerDescription, MCPServerManager } from '../common';
import { MCP_SERVERS_PREF } from './mcp-preferences'; // Preference constant for MCP servers

type MCPServerEntry = {
    [name: string]: {
        command: string;
        args: string[];
        env?: { [key: string]: string };
    };
};

@injectable()
export class McpFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(MCPServerManager)
    protected manager: MCPServerManager;

    protected prevServers: Map<string, MCPServerDescription> = new Map();

    onStart(): void {
        this.preferenceService.ready.then(() => {
            const servers = this.preferenceService.get<MCPServerEntry>(
                MCP_SERVERS_PREF,
                {}
            );
            this.syncServers(servers);
            this.prevServers = this.convertToMap(servers);

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MCP_SERVERS_PREF) {
                    this.handleServerChanges(event.newValue as MCPServerEntry);
                }
            });
        });
    }

    protected handleServerChanges(newServers: MCPServerEntry): void {
        const oldServers = this.prevServers;
        const updatedServers = this.convertToMap(newServers);

        for (const [name] of oldServers) {
            if (!updatedServers.has(name)) {
                this.manager.removeServer(name);
            }
        }

        for (const [name, description] of updatedServers) {
            const oldDescription = oldServers.get(name);
            if (!oldDescription || JSON.stringify(oldDescription) !== JSON.stringify(description)) {
                this.manager.addOrUpdateServer(description);
            }
        }

        this.prevServers = updatedServers;
    }

    protected syncServers(servers: MCPServerEntry): void {
        const updatedServers = this.convertToMap(servers);

        for (const [, description] of updatedServers) {
            this.manager.addOrUpdateServer(description);
        }

        for (const [name] of this.prevServers) {
            if (!updatedServers.has(name)) {
                this.manager.removeServer(name);
            }
        }

        this.prevServers = updatedServers;
    }

    protected convertToMap(servers: MCPServerEntry): Map<string, MCPServerDescription> {
        const map = new Map<string, MCPServerDescription>();
        Object.entries(servers).forEach(([name, description]) => {
            map.set(name, {
                name,
                ...description,
                env: description.env || undefined
            });
        });
        return map;
    }
}
