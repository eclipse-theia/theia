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
    MCPInstallEntryConfig,
    MCPRegistryMetadata,
    MCPServerDescription,
    RemoteMCPServerDescription
} from '../common/mcp-server-manager';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import { MCPOAuthConfig } from '../common/mcp-oauth';
import type { DialogProps } from '@theia/core/lib/browser/dialogs';
import type { MCPServerEditDialog, MCPServerFormData } from './mcp-server-edit-dialog';

/**
 * Parameters consumed by {@link MCPServerEditDialogFactory}. `initialData` is omitted for
 * the "add" flow, where the factory seeds the form with defaults.
 */
export interface MCPServerEditDialogParameters {
    props: DialogProps;
    initialData?: MCPServerFormData;
    existingServerNames: string[];
    isEditing: boolean;
}

/**
 * Factory for the DOM-touching {@link MCPServerEditDialog}. Injected (rather than the
 * dialog module being imported directly) so the editor stays free of the Lumino widget
 * chain - keeping it loadable in Node-only unit tests - and so adopters can rebind the
 * dialog if needed.
 */
export const MCPServerEditDialogFactory = Symbol('MCPServerEditDialogFactory');
export type MCPServerEditDialogFactory = (parameters: MCPServerEditDialogParameters) => MCPServerEditDialog;

/**
 * Self-contained install payload: the local preference key, the config blob
 * to write, and optional registry-provenance metadata. When `serverId` is set the
 * fields are persisted as a single `registryMetadata` block on the stored entry.
 */
export interface MCPInstallEntry {
    /** Local preference key. */
    localName: string;
    /** Config blob to write under `mcpServers[localName]`. */
    config: MCPInstallEntryConfig;
    /** Registry server id - populates `registryMetadata.serverId` so updates stay tracked. */
    serverId?: string;
    /** Approved version published by the registry - populates `registryMetadata.version` for display. */
    version?: string;
    /** Hash of the registry approval - populates `registryMetadata.configHash` and drives update detection. */
    configHash?: string;
}

/** User-supplied parameters collected by the install dialog before persisting. */
export interface MCPInstallOverrides {
    autostart?: boolean;
    /** Filled into a remote server's `serverAuthToken` slot when supplied by the user. */
    serverAuthToken?: string;
    /** Filled into the entry's `oauth.clientId` slot when supplied by the user. */
    oauthClientId?: string;
    /** Filled into the entry's `oauth.clientSecret` slot when supplied by the user. */
    oauthClientSecret?: string;
}

/**
 * Owns the persistence + dialog flows for MCP servers. Lives in `@theia/ai-mcp`
 * alongside the data model so both the configuration widget (in ai-ide) and the
 * registry/URL-driven install flows (in ai-registry / ai-mcp) can share it.
 */
export const MCPServerEditor = Symbol('MCPServerEditor');
export interface MCPServerEditor {
    /** Opens the "Add MCP Server" dialog and persists the result. */
    openAddServer(): Promise<void>;
    /** Installs a self-contained entry, applying any user-supplied overrides. */
    installFromEntry(entry: MCPInstallEntry, overrides?: MCPInstallOverrides): Promise<void>;
    /**
     * Persists an edited server from its form representation, preserving extra stored fields (e.g.
     * `registryMetadata`) and clearing keys that don't belong to the chosen server type. Exposed so the
     * configuration page can edit a server in place (field by field) without opening the dialog.
     */
    save(formData: MCPServerFormData): Promise<void>;
    /** Converts a server description into the editable form representation, or `undefined` if unsupported. */
    toFormData(server: MCPServerDescription): MCPServerFormData | undefined;
}

/**
 * Default {@link MCPServerEditor} implementation. The DOM-touching `MCPServerEditDialog`
 * is created through an injected {@link MCPServerEditDialogFactory} rather than imported
 * directly, so this service stays loadable in Node-only unit tests.
 */
@injectable()
export class MCPServerEditorImpl implements MCPServerEditor {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    @inject(MCPServerEditDialogFactory)
    protected readonly editDialogFactory: MCPServerEditDialogFactory;

    async openAddServer(): Promise<void> {
        const existing = (await this.mcpFrontendService.getServerNames()) ?? [];
        const dialog = this.editDialogFactory({
            props: { title: nls.localizeByDefault('Add MCP Server'), maxWidth: 500 },
            existingServerNames: existing,
            isEditing: false
        });
        const result = await dialog.open();
        if (result) {
            await this.save(result);
        }
    }

    /**
     * Install an MCP server from a self-contained entry - used by registry install actions
     * and the `install-mcp` URL handler. Writes the config blob to `mcpServers[localName]`
     * along with registry-provenance metadata, applying any user-supplied overrides
     * collected by the install dialog.
     */
    async installFromEntry(entry: MCPInstallEntry, overrides?: MCPInstallOverrides): Promise<void> {
        const current = this.readServers();
        const stored: Record<string, unknown> = {
            ...entry.config,
            ...this.applyOverrides(entry.config, overrides)
        };
        const metadata = this.buildMetadata(entry);
        if (metadata) {
            stored.registryMetadata = metadata;
        }
        try {
            await this.preferenceService.set(
                MCP_SERVERS_PREF,
                { ...current, [entry.localName]: stored },
                PreferenceScope.User
            );
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error)));
        }
    }

    protected readServers(): Record<string, unknown> {
        return this.preferenceService.get<Record<string, unknown>>(MCP_SERVERS_PREF, {}) ?? {};
    }

    /**
     * Build a `registryMetadata` block from an install entry's flat provenance fields,
     * or return undefined when the entry carries no registry link (e.g. a hand-crafted
     * `install-mcp` URL without an id).
     */
    protected buildMetadata(entry: MCPInstallEntry): MCPRegistryMetadata | undefined {
        if (entry.serverId === undefined) {
            return undefined;
        }
        return {
            serverId: entry.serverId,
            ...(entry.version !== undefined && { version: entry.version }),
            ...(entry.configHash !== undefined && { configHash: entry.configHash })
        };
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
        // Replace the registry's OAuth client placeholders with the user-supplied credentials,
        // keeping the registry-fixed parts (scopes, authorization server, resource) intact.
        if (config.oauth && (overrides.oauthClientId !== undefined || overrides.oauthClientSecret !== undefined)) {
            merged.oauth = {
                ...config.oauth,
                ...(overrides.oauthClientId !== undefined && { clientId: overrides.oauthClientId }),
                ...(overrides.oauthClientSecret !== undefined && { clientSecret: overrides.oauthClientSecret })
            };
        }
        return merged;
    }

    /**
     * Persist the form to the user preference. Preserves any extra fields on an existing entry
     * (e.g. `registryMetadata`) since the dialog only edits user-facing fields.
     */
    async save(formData: MCPServerFormData): Promise<void> {
        const currentServers = this.preferenceService.get<Record<string, object>>(MCP_SERVERS_PREF, {}) ?? {};
        const serverName = formData.name.trim();
        const existing = (currentServers[serverName] ?? {}) as Record<string, unknown>;
        const serverConfig = formData.serverType === 'local'
            ? this.toLocalConfig(formData)
            : this.toRemoteConfig(formData);
        const merged: Record<string, unknown> = { ...existing, ...serverConfig };
        // Preserving extra fields must not retain keys of another server type (e.g. a leftover
        // `oauth` block after switching to "Remote"), which would make the stored entry invalid.
        for (const staleKey of STALE_KEYS_BY_SERVER_TYPE[formData.serverType]) {
            delete merged[staleKey];
        }
        try {
            await this.preferenceService.set(
                MCP_SERVERS_PREF,
                { ...currentServers, [serverName]: merged },
                PreferenceScope.User
            );
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/mcpConfiguration/saveServerError', 'Failed to save MCP server configuration: {0}', String(error)));
        }
    }

    toFormData(server: MCPServerDescription): MCPServerFormData | undefined {
        if (isLocalMCPServerDescription(server)) {
            return {
                name: server.name,
                serverType: 'local',
                command: server.command,
                args: server.args ?? [],
                env: server.env ? Object.entries(server.env).map(([k, v]) => `${k}=${v}`).join('\n') : '',
                serverUrl: '',
                serverAuthToken: '',
                serverAuthTokenHeader: '',
                headers: '',
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScopes: '',
                oauthAuthorizationServer: '',
                oauthResource: '',
                autostart: server.autostart ?? true,
                deferLoading: server.deferLoading ?? false
            };
        }
        if (isRemoteMCPServerDescription(server)) {
            return {
                name: server.name,
                serverType: server.oauth ? 'remote-oauth' : 'remote',
                command: '',
                args: [],
                env: '',
                serverUrl: server.serverUrl,
                serverAuthToken: server.serverAuthToken ?? '',
                serverAuthTokenHeader: server.serverAuthTokenHeader ?? '',
                headers: server.headers
                    ? Object.entries(server.headers).map(([k, v]) => `${k}=${v}`).join('\n')
                    : '',
                oauthClientId: server.oauth?.clientId ?? '',
                oauthClientSecret: server.oauth?.clientSecret ?? '',
                oauthScopes: server.oauth?.scopes?.join(' ') ?? '',
                oauthAuthorizationServer: server.oauth?.authorizationServer ?? '',
                oauthResource: server.oauth?.resource ?? '',
                autostart: server.autostart ?? true,
                deferLoading: server.deferLoading ?? false
            };
        }
        return undefined;
    }

    protected toLocalConfig(formData: MCPServerFormData): Partial<LocalMCPServerDescription> {
        const config: Partial<LocalMCPServerDescription> = {
            command: formData.command.trim(),
            autostart: formData.autostart,
            deferLoading: formData.deferLoading
        };
        // Kept verbatim (empty entries dropped), so an argument containing a space stays one argument.
        const args = formData.args.map(argument => argument.trim()).filter(argument => argument.length > 0);
        if (args.length > 0) {
            config.args = args;
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
            autostart: formData.autostart,
            deferLoading: formData.deferLoading
        };
        if (formData.serverType === 'remote') {
            if (formData.serverAuthToken.trim()) {
                config.serverAuthToken = formData.serverAuthToken.trim();
            }
            if (formData.serverAuthTokenHeader.trim()) {
                config.serverAuthTokenHeader = formData.serverAuthTokenHeader.trim();
            }
        }
        const headers = parseKeyValuePairs(formData.headers);
        if (headers) {
            config.headers = headers;
        }
        const oauth = toOAuthConfig(formData);
        if (oauth) {
            config.oauth = oauth;
        }
        return config;
    }
}

const STALE_KEYS_BY_SERVER_TYPE: Record<MCPServerFormData['serverType'], readonly string[]> = {
    'local': ['serverUrl', 'serverAuthToken', 'serverAuthTokenHeader', 'headers', 'oauth'],
    // The plugin fields go with `command`: they only mean anything for a local server, and leaving
    // them on an entry the user just turned into a remote one would keep a dead plugin root on it.
    'remote': ['command', 'args', 'env', 'cwd', 'pluginRoot', 'pluginData', 'oauth'],
    'remote-oauth': ['command', 'args', 'env', 'cwd', 'pluginRoot', 'pluginData', 'serverAuthToken', 'serverAuthTokenHeader']
};

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

function toOAuthConfig(formData: MCPServerFormData): MCPOAuthConfig | undefined {
    if (formData.serverType !== 'remote-oauth') {
        return undefined;
    }
    const scopes = formData.oauthScopes.trim() ? formData.oauthScopes.trim().split(/\s+/) : undefined;
    return {
        ...(formData.oauthClientId.trim() && { clientId: formData.oauthClientId.trim() }),
        ...(formData.oauthClientSecret.trim() && { clientSecret: formData.oauthClientSecret.trim() }),
        ...(scopes && { scopes }),
        ...(formData.oauthAuthorizationServer.trim() && { authorizationServer: formData.oauthAuthorizationServer.trim() }),
        ...(formData.oauthResource.trim() && { resource: formData.oauthResource.trim() })
    };
}
