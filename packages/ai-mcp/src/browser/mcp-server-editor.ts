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
import { MessageService, nls, PreferenceScope, PreferenceService } from '@theia/core';
import {
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
    LocalMCPServerDescription,
    MCPFrontendService,
    MCPServerDescription,
    RemoteMCPServerDescription
} from '../common/mcp-server-manager';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import type { MCPServerFormData } from './mcp-server-edit-dialog';

/**
 * Subset of an MCP server's persisted configuration that an install flow may carry:
 * either set by a registry entry or hand-crafted in an install URL. Identical in shape
 * to `RegistryMCPServerConfigEntry` from `@theia/ai-registry`; kept here so ai-mcp can
 * own the install path without depending on the registry package.
 */
export interface MCPInstallEntryConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    serverUrl?: string;
    serverAuthToken?: string;
    serverAuthTokenHeader?: string;
    headers?: Record<string, string>;
}

/**
 * Self-contained install payload: the slug to use in the preference, the config blob
 * to write, and optional registry-provenance metadata. `serverId` is used for the
 * `registryServerId` link-back when present; `version` becomes `registryVersion`
 * (display-only) and `configHash` becomes `registryConfigHash` (update detection).
 */
export interface MCPInstallEntry {
    /** Local preference key. */
    localSlug: string;
    /** Config blob to write under `mcpServers[localSlug]`. */
    config: MCPInstallEntryConfig;
    /** Registry server id — populates `registryServerId` so updates stay tracked. */
    serverId?: string;
    /** Approved version published by the registry — populates `registryVersion` for display. */
    version?: string;
    /** Hash of the registry approval — populates `registryConfigHash` and drives update detection. */
    configHash?: string;
}

/** User-supplied parameters collected by the install dialog before persisting. */
export interface MCPInstallOverrides {
    autostart?: boolean;
    /** Filled into a remote server's `serverAuthToken` slot when supplied by the user. */
    serverAuthToken?: string;
}

/**
 * Owns the persistence + dialog flows for MCP servers. Lives in `@theia/ai-mcp`
 * alongside the data model so both the configuration widget (in ai-ide) and the
 * registry/URL-driven install flows (in ai-registry / ai-mcp) can share it.
 *
 * The DOM-touching `MCPServerEditDialog` is imported lazily so test-time imports
 * of this service don't drag the Lumino widget chain into Node-only test runs.
 */
@injectable()
export class MCPServerEditor {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    async openAddServer(): Promise<void> {
        const existing = (await this.mcpFrontendService.getServerNames()) ?? [];
        const { MCPServerEditDialog, DEFAULT_MCP_SERVER_FORM_DATA } = await import('./mcp-server-edit-dialog');
        const dialog = new MCPServerEditDialog(
            { title: nls.localizeByDefault('Add MCP Server'), maxWidth: 500 },
            { ...DEFAULT_MCP_SERVER_FORM_DATA },
            existing,
            false
        );
        const result = await dialog.open();
        if (result) {
            await this.save(result);
        }
    }

    async openEditServer(server: MCPServerDescription, existingNames: string[]): Promise<void> {
        const formData = this.toFormData(server);
        if (!formData) {
            return;
        }
        const { MCPServerEditDialog } = await import('./mcp-server-edit-dialog');
        const dialog = new MCPServerEditDialog(
            { title: nls.localize('theia/ai/mcpConfiguration/editServerTitle', 'Edit MCP Server'), maxWidth: 500 },
            formData,
            existingNames.filter(n => n !== server.name),
            true
        );
        const result = await dialog.open();
        if (result) {
            await this.save(result);
        }
    }

    /**
     * Install an MCP server from a self-contained entry — used by registry install actions
     * and the `install-mcp` URL handler. Writes the config blob to `mcpServers[localSlug]`
     * along with registry-provenance metadata, applying any user-supplied overrides
     * collected by the install dialog.
     */
    async installFromEntry(entry: MCPInstallEntry, overrides?: MCPInstallOverrides): Promise<void> {
        const current = this.readServers();
        const stored: Record<string, unknown> = {
            ...entry.config,
            ...this.applyOverrides(entry.config, overrides)
        };
        if (entry.serverId !== undefined) {
            stored.registryServerId = entry.serverId;
        }
        if (entry.version !== undefined) {
            stored.registryVersion = entry.version;
        }
        if (entry.configHash !== undefined) {
            stored.registryConfigHash = entry.configHash;
        }
        try {
            await this.preferenceService.set(
                MCP_SERVERS_PREF,
                { ...current, [entry.localSlug]: stored },
                PreferenceScope.User
            );
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error)));
        }
    }

    protected readServers(): Record<string, unknown> {
        return this.preferenceService.get<Record<string, unknown>>(MCP_SERVERS_PREF, {}) ?? {};
    }

    /** Merge user overrides into the config blob (only fields the dialog collects). */
    protected applyOverrides(
        config: MCPInstallEntryConfig,
        overrides: MCPInstallOverrides | undefined
    ): Partial<MCPInstallEntryConfig & { autostart: boolean }> {
        if (!overrides) {
            return {};
        }
        const merged: Partial<MCPInstallEntryConfig & { autostart: boolean }> = {};
        if (overrides.autostart !== undefined) {
            merged.autostart = overrides.autostart;
        }
        // Sanity-check: only persist a token when the config actually has the slot.
        if (overrides.serverAuthToken !== undefined && 'serverAuthToken' in config) {
            merged.serverAuthToken = overrides.serverAuthToken;
        }
        return merged;
    }

    /**
     * Persist the form to the user preference. Preserves any extra fields on an existing entry
     * (e.g. `registryServerId`) since the dialog only edits user-facing fields.
     */
    async save(formData: MCPServerFormData): Promise<void> {
        const currentServers = this.preferenceService.get<Record<string, object>>(MCP_SERVERS_PREF, {}) ?? {};
        const serverName = formData.name.trim();
        const existing = (currentServers[serverName] ?? {}) as Record<string, unknown>;
        const serverConfig = formData.serverType === 'local'
            ? this.toLocalConfig(formData)
            : this.toRemoteConfig(formData);
        try {
            await this.preferenceService.set(
                MCP_SERVERS_PREF,
                { ...currentServers, [serverName]: { ...existing, ...serverConfig } },
                PreferenceScope.User
            );
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error)));
        }
    }

    protected toFormData(server: MCPServerDescription): MCPServerFormData | undefined {
        if (isLocalMCPServerDescription(server)) {
            return {
                name: server.name,
                serverType: 'local',
                command: server.command,
                args: server.args?.join(' ') ?? '',
                env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
                serverUrl: '',
                serverAuthToken: '',
                serverAuthTokenHeader: '',
                headers: '',
                autostart: server.autostart ?? true
            };
        }
        if (isRemoteMCPServerDescription(server)) {
            return {
                name: server.name,
                serverType: 'remote',
                command: '',
                args: '',
                env: '',
                serverUrl: server.serverUrl,
                serverAuthToken: server.serverAuthToken ?? '',
                serverAuthTokenHeader: server.serverAuthTokenHeader ?? '',
                headers: server.headers
                    ? Object.entries(server.headers).map(([k, v]) => `${k}=${v}`).join('\n')
                    : '',
                autostart: server.autostart ?? true
            };
        }
        return undefined;
    }

    protected toLocalConfig(formData: MCPServerFormData): Partial<LocalMCPServerDescription> {
        const config: Partial<LocalMCPServerDescription> = {
            command: formData.command.trim(),
            autostart: formData.autostart
        };
        if (formData.args.trim()) {
            config.args = formData.args.trim().split(/\s+/);
        }
        const env = parseKeyValuePairs(formData.env);
        if (env) {
            config.env = env;
        }
        return config;
    }

    protected toRemoteConfig(formData: MCPServerFormData): Partial<RemoteMCPServerDescription> {
        const config: Partial<RemoteMCPServerDescription> = {
            serverUrl: formData.serverUrl.trim(),
            autostart: formData.autostart
        };
        if (formData.serverAuthToken.trim()) {
            config.serverAuthToken = formData.serverAuthToken.trim();
        }
        if (formData.serverAuthTokenHeader.trim()) {
            config.serverAuthTokenHeader = formData.serverAuthTokenHeader.trim();
        }
        const headers = parseKeyValuePairs(formData.headers);
        if (headers) {
            config.headers = headers;
        }
        return config;
    }
}

function parseKeyValuePairs(input: string): Record<string, string> | undefined {
    if (!input.trim()) {
        return undefined;
    }
    const result: Record<string, string> = {};
    for (const line of input.split('\n').filter(l => l.trim())) {
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
            const key = line.substring(0, eqIndex).trim();
            const value = line.substring(eqIndex + 1).trim();
            if (key) {
                result[key] = value;
            }
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
