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
import { AIRegistryConfiguration } from '../ai-registry-configuration';
import { RegistryMCPServer, ResolvedRegistryEntry } from './mcp-registry-types';

export const MCPRegistryEntryResolver = Symbol('MCPRegistryEntryResolver');
export interface MCPRegistryEntryResolver {
    /** Normalises a raw registry server entry into the single (slug, config, version) tuple the install path uses. */
    resolve(raw: RegistryMCPServer): ResolvedRegistryEntry | undefined;
}

@injectable()
export class MCPRegistryEntryResolverImpl implements MCPRegistryEntryResolver {

    @inject(AIRegistryConfiguration)
    protected readonly configuration: AIRegistryConfiguration;

    resolve(raw: RegistryMCPServer): ResolvedRegistryEntry | undefined {
        const approval = [...raw.approvals].sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!approval) {
            return undefined;
        }
        // Per-tool endpoints should already pre-filter install configs, but a registry
        // may still emit several. Pick the one tagged for our configured tool name
        // (or untagged, which we treat as "applies to all tools"); fall back to the
        // first config so a registry that hasn't tagged its entries still works.
        const toolName = this.configuration.getToolName();
        const installConfig = approval.installConfigs.find(c => !c.tool || c.tool === toolName || toolName === 'all')
            ?? approval.installConfigs[0];
        const servers = installConfig?.config?.servers ?? {};
        const serverKeys = Object.keys(servers);
        if (serverKeys.length === 0) {
            return undefined;
        }
        if (serverKeys.length > 1) {
            // Multi-server install configs aren't a Theia concept - we install one server
            // per registry entry. Warn so the registry maintainer is aware their payload
            // exposed more than we use, and pick the first slug deterministically.
            console.warn(`AI registry entry ${raw.serverId} has multiple servers in its install config; using ${serverKeys[0]}.`);
        }
        const localName = serverKeys[0];
        return {
            serverId: raw.serverId,
            name: raw.name,
            description: raw.description,
            localName,
            config: servers[localName],
            version: approval.version,
            ...(approval.configHash !== undefined && { configHash: approval.configHash }),
            mcpRegistryVerified: raw.mcpRegistryVerified
        };
    }
}
