// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { PreferenceScope, PreferenceService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { MCPInstallEntryConfig, MCPRegistryMetadata } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { ResolvedPluginServer } from '../../common/plugin/agent-plugin-manifest';
import { InstalledPluginInfo } from '../../common/plugin/plugin-registry-types';

/** One entry of the `ai-features.mcp.mcpServers` preference, as this registrar writes it. */
type StoredEntry = MCPInstallEntryConfig & {
    autostart?: boolean;
    registryMetadata?: MCPRegistryMetadata;
};

type StoredServers = Record<string, StoredEntry>;

export const PluginMcpRegistrar = Symbol('PluginMcpRegistrar');
/**
 * The seam between installed Agent Plugins and Theia's MCP configuration. Ownership rides on
 * `registryMetadata.pluginId` rather than a recorded list of keys, so renaming a key in the
 * preference does not orphan the entry.
 *
 * No merge policy on purpose: an update deletes the plugin's entries and writes them again from the
 * root. The MCP preference is about to become a file-based configuration and this is rewritten then.
 */
export interface PluginMcpRegistrar {
    /** Servers the plugin root rejected are surfaced on the card instead of registered. */
    register(info: InstalledPluginInfo): Promise<void>;
    unregister(pluginId: string): Promise<void>;
    /**
     * Rewrites the entries of every managed plugin from `infos` and drops those of plugins that are
     * no longer installed, leaving entries the user wrote alone. Writes nothing when the result is
     * unchanged, so it is safe to call on every filesystem event.
     */
    reconcile(infos: InstalledPluginInfo[]): Promise<void>;
}

@injectable()
export class PluginMcpRegistrarImpl implements PluginMcpRegistrar {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    async register(info: InstalledPluginInfo): Promise<void> {
        const pluginId = info.pluginId;
        if (pluginId === undefined) {
            // A directory without our provenance marker is the user's own; we never write for it.
            return;
        }
        // Delete-then-write, so an update never reconciles fields against the previous entries.
        const next = this.withoutPlugin(this.readServers(), pluginId);
        for (const server of info.servers) {
            next[this.pickKey(next, server.name, info.directoryName)] = this.toEntry(server, info, pluginId);
        }
        await this.writeServers(next);
    }

    async reconcile(infos: InstalledPluginInfo[]): Promise<void> {
        const current = this.readServers();
        const next: StoredServers = {};
        // Everything the user wrote themselves survives verbatim; every plugin-owned entry is
        // rebuilt below, so one whose plugin has since gone simply does not come back.
        for (const [key, entry] of Object.entries(current)) {
            if (entry?.registryMetadata?.pluginId === undefined) {
                next[key] = entry;
            }
        }
        // Sorted, so which plugin wins a name collision does not depend on `readdir` order.
        const managed = infos.filter(info => info.pluginId !== undefined)
            .sort((left, right) => left.pluginId!.localeCompare(right.pluginId!));
        for (const info of managed) {
            for (const server of info.servers) {
                next[this.pickKey(next, server.name, info.directoryName)] = this.toEntry(server, info, info.pluginId!);
            }
        }
        if (!this.sameServers(current, next)) {
            await this.writeServers(next);
        }
    }

    /** Order-insensitive: rewriting the preference restarts servers, so an equal result must not. */
    protected sameServers(left: StoredServers, right: StoredServers): boolean {
        const keys = Object.keys(left).sort();
        if (keys.length !== Object.keys(right).length) {
            return false;
        }
        return keys.every(key => key in right && JSON.stringify(left[key]) === JSON.stringify(right[key]));
    }

    async unregister(pluginId: string): Promise<void> {
        const current = this.readServers();
        const next = this.withoutPlugin(current, pluginId);
        if (Object.keys(next).length !== Object.keys(current).length) {
            await this.writeServers(next);
        }
    }

    /** The plugin's own key while it is free, so servers keep the name the plugin gave them. */
    protected pickKey(servers: StoredServers, name: string, qualifier: string): string {
        return name in servers ? `${qualifier}_${name}` : name;
    }

    protected toEntry(server: ResolvedPluginServer, info: InstalledPluginInfo, pluginId: string): StoredEntry {
        // `installedAt` is what makes an update or a Fix restart the server: the entry then differs
        // even when `mcp.json` did not change, and the manager reads it as part of the connection.
        const registryMetadata: MCPRegistryMetadata = {
            pluginId,
            ...(info.contentHash !== undefined && { configHash: info.contentHash }),
            ...(info.installedAt !== undefined && { installedAt: info.installedAt })
        };
        if (server.kind === 'stdio') {
            return {
                command: server.command,
                ...(server.args !== undefined && { args: server.args }),
                ...(server.env !== undefined && { env: server.env }),
                cwd: server.cwd,
                pluginRoot: info.root,
                pluginData: info.dataRoot,
                autostart: true,
                registryMetadata
            };
        }
        return {
            serverUrl: server.serverUrl,
            ...(server.headers !== undefined && { headers: server.headers }),
            autostart: true,
            registryMetadata
        };
    }

    protected withoutPlugin(servers: StoredServers, pluginId: string): StoredServers {
        const next: StoredServers = {};
        for (const [key, entry] of Object.entries(servers)) {
            if (entry?.registryMetadata?.pluginId !== pluginId) {
                next[key] = entry;
            }
        }
        return next;
    }

    protected readServers(): StoredServers {
        return this.preferenceService.get<StoredServers>(MCP_SERVERS_PREF, {}) ?? {};
    }

    protected async writeServers(next: StoredServers): Promise<void> {
        await this.preferenceService.set(MCP_SERVERS_PREF, next, PreferenceScope.User);
    }
}
