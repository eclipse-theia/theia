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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerDescription, MCPServerManager } from '../common';
import { MCP_SERVERS_PREF } from '../common/mcp-preferences';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';
import { MCPFrontendService } from '../common/mcp-server-manager';
import { PreferenceService, PreferenceUtils } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import {
    WorkspaceTrustService,
    WorkspaceRestrictionContribution,
    WorkspaceRestriction
} from '@theia/workspace/lib/browser/workspace-trust-service';

interface BaseMCPServerPreferenceValue {
    autostart?: boolean;
}

interface LocalMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    command: string;
    args?: string[];
    env?: { [key: string]: string };
}

interface RemoteMCPServerPreferenceValue extends BaseMCPServerPreferenceValue {
    serverUrl: string;
    serverAuthToken?: string;
    serverAuthTokenHeader?: string;
    headers?: { [key: string]: string };
}

type MCPServersPreferenceValue = LocalMCPServerPreferenceValue | RemoteMCPServerPreferenceValue;

interface MCPServersPreference {
    [name: string]: MCPServersPreferenceValue
};

namespace MCPServersPreference {
    export function isValue(obj: unknown): obj is MCPServersPreferenceValue {
        return !!obj && typeof obj === 'object' &&
            ('command' in obj || 'serverUrl' in obj) &&
            (!('command' in obj) || typeof obj.command === 'string') &&
            (!('args' in obj) || Array.isArray(obj.args) && obj.args.every(arg => typeof arg === 'string')) &&
            (!('env' in obj) || !!obj.env && typeof obj.env === 'object' && Object.values(obj.env).every(value => typeof value === 'string')) &&
            (!('autostart' in obj) || typeof obj.autostart === 'boolean') &&
            (!('serverUrl' in obj) || typeof obj.serverUrl === 'string') &&
            (!('serverAuthToken' in obj) || typeof obj.serverAuthToken === 'string') &&
            (!('serverAuthTokenHeader' in obj) || typeof obj.serverAuthTokenHeader === 'string') &&
            (!('headers' in obj) || !!obj.headers && typeof obj.headers === 'object' && Object.values(obj.headers).every(value => typeof value === 'string'));
    }
}

function filterValidValues(servers: unknown): MCPServersPreference {
    const result: MCPServersPreference = {};
    if (!servers || typeof servers !== 'object') {
        return result;
    }
    for (const [name, value] of Object.entries(servers)) {
        if (typeof name === 'string' && MCPServersPreference.isValue(value)) {
            result[name] = value;
        }
    }
    return result;
}

@injectable()
export class McpFrontendApplicationContribution implements FrontendApplicationContribution, WorkspaceRestrictionContribution {

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(MCPServerManager)
    protected manager: MCPServerManager;

    @inject(MCPFrontendService)
    protected frontendMCPService: MCPFrontendService;

    @inject(WorkspaceTrustService)
    protected workspaceTrustService: WorkspaceTrustService;

    protected prevServers: Map<string, MCPServerDescription> = new Map();

    protected blockedUntrustedServers: Set<string> = new Set();

    onStart(): void {
        this.preferenceService.ready.then(async () => {
            const servers = filterValidValues(this.preferenceService.get(
                MCP_SERVERS_PREF,
                {}
            ));
            this.prevServers = this.convertToMap(servers);
            this.syncServers(this.prevServers);
            await this.autoStartServers(this.prevServers);

            this.preferenceService.onPreferenceChanged(event => {
                if (event.preferenceName === MCP_SERVERS_PREF) {
                    this.handleServerChanges(filterValidValues(this.preferenceService.get(MCP_SERVERS_PREF, {})));
                }
            });

            this.workspaceTrustService.onDidChangeWorkspaceTrust(async trusted => {
                try {
                    if (trusted) {
                        await this.startPreviouslyBlockedServers();
                    } else {
                        await this.stopWorkspaceScopedServers();
                    }
                } catch (error) {
                    console.error('Failed to handle workspace trust change for MCP servers', error);
                }
            });
        });
        this.frontendMCPService.registerToolsForAllStartedServers();
    }

    protected async startPreviouslyBlockedServers(): Promise<void> {
        if (this.blockedUntrustedServers.size === 0) {
            return;
        }
        const startedServers = await this.frontendMCPService.getStartedServers();
        for (const name of this.blockedUntrustedServers) {
            const serverDesc = this.prevServers.get(name);
            if (serverDesc && serverDesc.autostart && !startedServers.includes(name)) {
                await this.frontendMCPService.startServer(name);
            }
        }
        this.blockedUntrustedServers.clear();
        this.updateBlockedServersStatusBar();
    }

    protected async stopWorkspaceScopedServers(): Promise<void> {
        const workspaceScopedServers = this.getWorkspaceScopedServerNames();
        if (workspaceScopedServers.size === 0) {
            return;
        }
        const startedServers = await this.frontendMCPService.getStartedServers();
        for (const name of workspaceScopedServers) {
            if (startedServers.includes(name)) {
                await this.frontendMCPService.stopServer(name);
                this.blockedUntrustedServers.add(name);
            }
        }
        this.updateBlockedServersStatusBar();
    }

    protected updateBlockedServersStatusBar(): void {
        this.workspaceTrustService.refreshRestrictedModeIndicator();
    }

    getRestrictions(): WorkspaceRestriction[] {
        if (this.blockedUntrustedServers.size === 0) {
            return [];
        }
        return [{
            label: nls.localize('theia/ai-mcp/blockedServersLabel', 'MCP Servers (autostart blocked)'),
            details: Array.from(this.blockedUntrustedServers)
        }];
    }

    protected async autoStartServers(servers: Map<string, MCPServerDescription>): Promise<void> {
        const startedServers = await this.frontendMCPService.getStartedServers();

        const isTrusted = await this.workspaceTrustService.getWorkspaceTrust();
        const workspaceScopedServers = this.getWorkspaceScopedServerNames();

        for (const [name, serverDesc] of servers) {
            if (serverDesc && serverDesc.autostart) {
                if (!startedServers.includes(name)) {
                    if (!isTrusted && workspaceScopedServers.has(name)) {
                        this.blockedUntrustedServers.add(name);
                        continue;
                    }
                    await this.frontendMCPService.startServer(name);
                }
            }
        }

        this.updateBlockedServersStatusBar();
    }

    protected getWorkspaceScopedServerNames(): Set<string> {
        const workspaceScopedNames = new Set<string>();

        const inspection = this.preferenceService.inspect<JSONObject>(MCP_SERVERS_PREF);
        if (!inspection) {
            return workspaceScopedNames;
        }

        if (inspection.workspaceValue) {
            for (const name of Object.keys(inspection.workspaceValue)) {
                workspaceScopedNames.add(name);
            }
        }

        if (inspection.workspaceFolderValue) {
            for (const name of Object.keys(inspection.workspaceFolderValue)) {
                workspaceScopedNames.add(name);
            }
        }

        return workspaceScopedNames;
    }

    protected handleServerChanges(newServers: MCPServersPreference): void {
        const oldServers = this.prevServers;
        const updatedServers = this.convertToMap(newServers);

        for (const [name] of oldServers) {
            if (!updatedServers.has(name)) {
                this.manager.removeServer(name);
                this.blockedUntrustedServers.delete(name);
            }
        }

        for (const [name, description] of updatedServers) {
            const oldDescription = oldServers.get(name);
            let diff = false;
            try {
                // We know that that the descriptions are actual JSONObjects as we construct them ourselves
                if (!oldDescription || !PreferenceUtils.deepEqual(oldDescription as unknown as JSONObject, description as unknown as JSONObject)) {
                    diff = true;
                }
            } catch (e) {
                // In some cases the deepEqual function throws an error, so we fall back to assuming that there is a difference
                // This seems to happen in cases where the objects are structured differently, e.g. whole sub-objects are missing
                console.debug('Failed to compare MCP server descriptions, assuming a difference', e);
                diff = true;
            }
            if (diff) {
                this.manager.addOrUpdateServer(description);
            }
        }

        this.prevServers = updatedServers;
        this.autoStartServers(updatedServers).catch(error => {
            console.error('Failed to auto-start MCP servers after preference change', error);
        });
    }

    protected syncServers(servers: Map<string, MCPServerDescription>): void {

        for (const [, description] of servers) {
            this.manager.addOrUpdateServer(description);
        }

        for (const [name] of this.prevServers) {
            if (!servers.has(name)) {
                this.manager.removeServer(name);
            }
        }
    }

    protected convertToMap(servers: MCPServersPreference): Map<string, MCPServerDescription> {
        const map = new Map<string, MCPServerDescription>();
        Object.entries(servers).forEach(([name, description]) => {
            let filteredDescription: MCPServerDescription;

            if ('serverUrl' in description) {
                // Create RemoteMCPServerDescription by picking only remote-specific properties
                const { serverUrl, serverAuthToken, serverAuthTokenHeader, headers, autostart } = description;
                filteredDescription = {
                    name,
                    serverUrl,
                    ...(serverAuthToken && { serverAuthToken }),
                    ...(serverAuthTokenHeader && { serverAuthTokenHeader }),
                    ...(headers && { headers }),
                    autostart: autostart ?? true,
                };
            } else {
                // Create LocalMCPServerDescription by picking only local-specific properties
                const { command, args, env, autostart } = description;
                filteredDescription = {
                    name,
                    command,
                    ...(args && { args }),
                    ...(env && { env }),
                    autostart: autostart ?? true,
                };
            }

            map.set(name, filteredDescription);
        });
        return map;
    }
}
