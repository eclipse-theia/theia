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
import { PreferenceScope, PreferenceService } from '@theia/core';
import {
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
    MCPInstallEntryConfig,
    MCPRegistryMetadata,
    MCPServerDescription
} from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { MCPInstallOverrides, MCPServerEditor } from '@theia/ai-mcp/lib/browser/mcp-server-editor';
import { ClassificationResult, ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';

export { MCPInstallOverrides };

type StoredEntry = MCPInstallEntryConfig & {
    autostart?: boolean;
    registryMetadata?: MCPRegistryMetadata;
};

type StoredServers = Record<string, StoredEntry>;

export const MCPInstallService = Symbol('MCPInstallService');
export interface MCPInstallService {
    /** Installs a registry entry, applying any user-supplied overrides collected by the install dialog. */
    install(entry: ResolvedRegistryEntry, overrides?: MCPInstallOverrides): Promise<void>;
    /** Restores a drifted entry's registry-owned config fields while preserving user-owned ones. */
    fixConfig(entry: ResolvedRegistryEntry): Promise<void>;
    /** Applies a newer registry approval to an installed entry, preserving user-supplied additions. */
    update(entry: ResolvedRegistryEntry): Promise<void>;
    /** Links an existing local server to a registry entry by stamping its registry metadata. */
    link(entry: ResolvedRegistryEntry): Promise<void>;
    /** Drops the registry link from a local server while keeping its config intact. */
    unlink(name: string): Promise<void>;
    /** Removes an installed server entry by its local preference key. */
    uninstall(name: string): Promise<void>;
    /** Classifies a locally stored server against the registry (for the Installed view). */
    classifyLocalServer(local: MCPServerDescription, registryEntries: ResolvedRegistryEntry[]): ClassificationResult;
    /** Classifies a registry entry against the locally stored servers (for the Search view). */
    classifyRegistryEntry(entry: ResolvedRegistryEntry, locals: MCPServerDescription[], registryEntries: ResolvedRegistryEntry[]): ClassificationResult;
}

@injectable()
export class MCPInstallServiceImpl implements MCPInstallService {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MCPServerEditor)
    protected readonly editor: MCPServerEditor;

    /** Delegates to the generic editor so both registry installs and `install-mcp` URL handlers go through the same code path. */
    async install(entry: ResolvedRegistryEntry, overrides?: MCPInstallOverrides): Promise<void> {
        await this.editor.installFromEntry(entry, overrides);
    }

    async fixConfig(entry: ResolvedRegistryEntry): Promise<void> {
        // Overwrite the registry-owned config fields, but carry forward user-owned ones
        // (today: autostart). The registry has no opinion on `autostart`, so wiping it on
        // fix-config would silently discard a user preference. Once the registry grows a
        // formal notion of "user-configurable parameters", extend the forwarded set here.
        const existing = this.readServers()[entry.localName];
        const overrides: MCPInstallOverrides = {};
        if (existing?.autostart !== undefined) {
            overrides.autostart = existing.autostart;
        }
        await this.install(entry, overrides);
    }

    async update(entry: ResolvedRegistryEntry): Promise<void> {
        const current = this.readServers();
        const existing = current[entry.localName];
        if (!existing) {
            return;
        }
        // If the registry switched the entry's transport (e.g. local stdio -> remote URL),
        // drop the previous side's fields so settings.json doesn't end up carrying both.
        const sanitized: StoredEntry = { ...existing };
        if (entry.config.serverUrl !== undefined) {
            delete sanitized.command;
            delete sanitized.args;
            delete sanitized.env;
        } else if (entry.config.command !== undefined) {
            delete sanitized.serverUrl;
            delete sanitized.serverAuthToken;
            delete sanitized.serverAuthTokenHeader;
            delete sanitized.headers;
        }
        // Preserve user-added env keys; registry values win for keys the registry sets.
        // Asymmetry: keys the registry previously set and has since dropped are also
        // preserved here, because we cannot distinguish them from user-added keys without
        // tracking provenance. A registry approval that published e.g. `LOG_LEVEL` in v1
        // and removes it in v2 will leave the stale key in the local entry. This will be
        // addressed alongside the planned "user-configurable parameters" work, which
        // introduces an explicit registry-set vs. user-set distinction.
        const mergedEnv = (entry.config.env || sanitized.env)
            ? { ...sanitized.env, ...(entry.config.env ?? {}) }
            : undefined;
        // Preserve user-supplied additions across updates. Today we only carry the auth
        // token forward - registries should not ship secrets, so the new approval will
        // either omit `serverAuthToken` entirely or carry it as an empty slot, both of
        // which would otherwise wipe a token the user previously entered in the install
        // dialog. A broader policy for user-additions belongs with the planned parameter
        // configuration work.
        const userAdditions = sanitized.serverAuthToken !== undefined
            ? { serverAuthToken: sanitized.serverAuthToken }
            : {};
        const updated: StoredEntry = {
            ...sanitized,
            ...entry.config,
            ...userAdditions,
            ...(mergedEnv && { env: mergedEnv }),
            registryMetadata: this.metadata(entry)
        };
        await this.writeServers({ ...current, [entry.localName]: updated });
    }

    async link(entry: ResolvedRegistryEntry): Promise<void> {
        const current = this.readServers();
        const existing = current[entry.localName];
        if (!existing) {
            return;
        }
        await this.writeServers({
            ...current,
            [entry.localName]: { ...existing, registryMetadata: this.metadata(entry) }
        });
    }

    /**
     * Drop the registry link from a local server while keeping its config intact.
     * Used to convert a stale-linked entry (registry no longer lists the serverId)
     * into a plain user-added entry without losing the user's running server config.
     */
    async unlink(name: string): Promise<void> {
        const current = this.readServers();
        const existing = current[name];
        if (!existing || existing.registryMetadata === undefined) {
            return;
        }
        const next: StoredEntry = { ...existing };
        delete next.registryMetadata;
        await this.writeServers({ ...current, [name]: next });
    }

    async uninstall(name: string): Promise<void> {
        const current = this.readServers();
        if (!(name in current)) {
            return;
        }
        const next: StoredServers = { ...current };
        delete next[name];
        await this.writeServers(next);
    }

    protected readServers(): StoredServers {
        return this.preferenceService.get<StoredServers>(MCP_SERVERS_PREF, {}) ?? {};
    }

    protected async writeServers(next: StoredServers): Promise<void> {
        await this.preferenceService.set(MCP_SERVERS_PREF, next, PreferenceScope.User);
    }

    /** Registry-managed metadata block written onto every linked server entry. */
    protected metadata(entry: ResolvedRegistryEntry): MCPRegistryMetadata {
        return {
            serverId: entry.serverId,
            ...(entry.version !== undefined && { version: entry.version }),
            ...(entry.configHash !== undefined && { configHash: entry.configHash })
        };
    }

    classifyLocalServer(local: MCPServerDescription, registryEntries: ResolvedRegistryEntry[]): ClassificationResult {
        const linkedId = local.registryMetadata?.serverId;
        if (linkedId) {
            const byServerId = registryEntries.find(e => e.serverId === linkedId);
            if (!byServerId) {
                return { kind: 'installed-link-stale' };
            }
            return this.classifyLinked(byServerId, local);
        }
        const matchingEntry = registryEntries.find(e => e.localName === local.name);
        if (!matchingEntry) {
            return { kind: 'installed-user-added' };
        }
        // Unlinked + same key: always offer Link, regardless of config drift. Drift is only
        // considered actionable (fix-config) once the user has opted in by linking.
        return { kind: 'installed-manually' };
    }

    classifyRegistryEntry(
        entry: ResolvedRegistryEntry,
        locals: MCPServerDescription[],
        registryEntries: ResolvedRegistryEntry[]
    ): ClassificationResult {
        const local = locals.find(l => l.name === entry.localName);
        if (!local) {
            return { kind: 'not-installed' };
        }
        const linkedId = local.registryMetadata?.serverId;
        if (linkedId === entry.serverId) {
            return this.classifyLinked(entry, local);
        }
        // Local links to a registry id that doesn't exist in the registry - the link is
        // stale. Surface the same state Installed shows so the user sees the Unlink and
        // Uninstall affordances in both views instead of a misleading Link button.
        if (linkedId && !registryEntries.some(e => e.serverId === linkedId)) {
            return { kind: 'installed-link-stale' };
        }
        // Same key but not linked (no registryMetadata, or pointing to a different valid
        // id): offer Link before surfacing any drift - drift handling is a post-link concern.
        return { kind: 'installed-manually' };
    }

    /**
     * Classify a local server that is already linked to a registry entry. Either the
     * registry config matches (eligible for Update when the registry has published a new
     * approval - detected via `configHash`) or it has drifted away (`fix-config`).
     *
     * Update detection uses `registryMetadata.configHash` exclusively.
     * `registryMetadata.version` is kept on the local entry for display only; the
     * registry may publish a new version without changing the install config, in which
     * case we still want to offer Update.
     */
    protected classifyLinked(entry: ResolvedRegistryEntry, local: MCPServerDescription): ClassificationResult {
        if (!this.matchesByConfig(entry, local)) {
            return { kind: 'fix-config' };
        }
        const updateAvailable = this.isUpdateAvailable(entry, local);
        return { kind: 'installed-from-registry', updateAvailable };
    }

    /**
     * True when the registry's `configHash` differs from the locally stored
     * `registryMetadata.configHash`. Returns false when the registry has no `configHash`
     * to compare against (older payloads) - without a hash we cannot make a confident
     * "update available" decision and prefer not to nag the user.
     */
    protected isUpdateAvailable(entry: ResolvedRegistryEntry, local: MCPServerDescription): boolean {
        if (entry.configHash === undefined) {
            return false;
        }
        return local.registryMetadata?.configHash !== entry.configHash;
    }

    protected matchesByConfig(entry: ResolvedRegistryEntry, local: MCPServerDescription): boolean {
        if (entry.config.command !== undefined) {
            if (!isLocalMCPServerDescription(local)) {
                return false;
            }
            if (local.command !== entry.config.command) {
                return false;
            }
            const entryArgs = entry.config.args ?? [];
            const localArgs = local.args ?? [];
            if (entryArgs.length !== localArgs.length) {
                return false;
            }
            if (!entryArgs.every((value, index) => value === localArgs[index])) {
                return false;
            }
            return this.envMatches(entry.config.env, local.env);
        }
        if (entry.config.serverUrl !== undefined) {
            if (!isRemoteMCPServerDescription(local)) {
                return false;
            }
            return local.serverUrl === entry.config.serverUrl;
        }
        return false;
    }

    protected envMatches(registryEnv: Record<string, string> | undefined, localEnv: Record<string, string> | undefined): boolean {
        if (!registryEnv) {
            return true;
        }
        for (const key of Object.keys(registryEnv)) {
            if (localEnv?.[key] !== registryEnv[key]) {
                return false;
            }
        }
        return true;
    }
}
