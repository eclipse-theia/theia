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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { AIRegistryConfiguration } from '../ai-registry-configuration';
import { RegistryApproval, RegistryInstallConfig, RegistryMCPServer, ResolvedRegistryEntry } from './mcp-registry-types';
import { ILogger } from '@theia/core';

export const MCPRegistryEntryResolver = Symbol('MCPRegistryEntryResolver');
export interface MCPRegistryEntryResolver {
    /** Normalises a raw registry server entry into the single (slug, config, version) tuple the install path uses. */
    resolve(raw: RegistryMCPServer): ResolvedRegistryEntry | undefined;
}

@injectable()
export class MCPRegistryEntryResolverImpl implements MCPRegistryEntryResolver {

    @inject(AIRegistryConfiguration)
    protected readonly configuration: AIRegistryConfiguration;

    @inject(ILogger) @named('ai-registry:MCPRegistryEntryResolverImpl')
    protected readonly logger: ILogger;

    resolve(raw: RegistryMCPServer): ResolvedRegistryEntry | undefined {
        // Only approvals that actually carry a usable install config are candidates: picking by
        // date first would drop the entry whenever the winning approval has an empty
        // `installConfigs` while another - often a trust-derived one, which copies its date - has one.
        const candidates = raw.approvals
            .map(candidateApproval => ({ approval: candidateApproval, installConfig: this.selectInstallConfig(candidateApproval) }))
            .filter((entry): entry is { approval: RegistryApproval, installConfig: RegistryInstallConfig } => entry.installConfig !== undefined);
        const candidate = this.sortCandidates(candidates)[0];
        if (!candidate) {
            return undefined;
        }
        const { approval, installConfig } = candidate;
        const servers = installConfig.config?.servers ?? {};
        const serverKeys = Object.keys(servers);
        if (serverKeys.length === 0) {
            return undefined;
        }
        if (serverKeys.length > 1) {
            // Multi-server install configs aren't a Theia concept - we install one server
            // per registry entry. Warn so the registry maintainer is aware their payload
            // exposed more than we use, and pick the first slug deterministically.
            this.logger.warn(`AI registry entry ${raw.serverId} has multiple servers in its install config; using ${serverKeys[0]}.`);
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

    /**
     * The install config of `approval` to use, or `undefined` when it has none with any server.
     * Prefers the config tagged for our configured tool name (untagged applies to all tools),
     * falling back to any other usable one so an untagged registry still works.
     */
    protected selectInstallConfig(approval: RegistryApproval): RegistryInstallConfig | undefined {
        const toolName = this.configuration.getToolName();
        const usable = approval.installConfigs.filter(c => Object.keys(c.config?.servers ?? {}).length > 0);
        return usable.find(c => !c.tool || c.tool === toolName || toolName === 'all') ?? usable[0];
    }

    /** Most recent first, `organizationId` ascending on ties, so the pick is a total order. */
    protected sortCandidates<T extends { approval: RegistryApproval }>(candidates: T[]): T[] {
        return [...candidates].sort((a, b) =>
            b.approval.date.localeCompare(a.approval.date) || a.approval.organizationId.localeCompare(b.approval.organizationId));
    }
}
