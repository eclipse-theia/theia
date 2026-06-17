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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { isRemoteMCPServerDescription, MCPOAuthFrontendDelegate, MCPServerDescription, MCPServerManager, MCPServerStatus } from '../common';
import { MCP_SERVERS_PREF, MCP_USE_WORKSPACE_AS_ROOT_PREF } from '../common/mcp-preferences';
import { MCPFrontendNotificationService, MCPFrontendService } from '../common/mcp-server-manager';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';
import { MessageService, PreferenceService, PreferenceUtils, Progress, ILogger } from '@theia/core';
import { nls } from '@theia/core/lib/common/nls';
import {
    WorkspaceTrustService,
    WorkspaceRestrictionContribution,
    WorkspaceRestriction
} from '@theia/workspace/lib/browser/workspace-trust-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { filterValidValues, MCPServersPreference } from '../common/mcp-server-preference-validator';

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

    @inject(ILogger) @named('ai-mcp:McpFrontendApplicationContribution')
    protected readonly logger: ILogger;

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(MCPOAuthFrontendDelegate)
    protected oauthFrontendDelegate: MCPOAuthFrontendDelegate;

    @inject(MCPFrontendNotificationService)
    protected mcpNotificationService: MCPFrontendNotificationService;

    protected prevServers: Map<string, MCPServerDescription> = new Map();

    protected blockedUntrustedServers: Set<string> = new Set();

    protected serverChangeQueue: Promise<void> = Promise.resolve();

    /** Pending OAuth sign-in prompts, keyed by server name. */
    protected readonly pendingSignInPrompts = new Map<string, Progress>();

    onStart(): void {
        // Preflight the backend→frontend RPC channel for OAuth callbacks so a wiring failure surfaces
        // at startup rather than at the first OAuth flow. Failures are logged but not propagated.
        this.oauthFrontendDelegate.getCallbackUrl().catch(error =>
            console.warn('MCP OAuth duplex-channel preflight failed; OAuth callbacks may not work until reconnect.', error));

        this.mcpNotificationService.onDidUpdateMCPServers(() => {
            this.dismissSettledSignInPrompts().catch(error => console.error('Failed to dismiss settled MCP OAuth sign-in prompts', error));
        });

        this.preferenceService.ready.then(async () => {
            const servers = filterValidValues(this.preferenceService.get(
                MCP_SERVERS_PREF,
                {}
            ));
            this.prevServers = this.convertToMap(servers);
            await this.syncServers(this.prevServers);

            // Set up workspace roots tracking
            await this.updateWorkspaceRoots(false);
            this.workspaceService.onWorkspaceChanged(async () => {
                await this.updateWorkspaceRoots(false);
            });

            await this.autoStartServers(this.prevServers);

            this.preferenceService.onPreferenceChanged(async event => {
                if (event.preferenceName === MCP_SERVERS_PREF) {
                    this.enqueueServerChanges(filterValidValues(this.preferenceService.get(MCP_SERVERS_PREF, {})));
                }
                if (event.preferenceName === MCP_USE_WORKSPACE_AS_ROOT_PREF) {
                    await this.updateWorkspaceRoots(true);
                }
            });

            this.workspaceTrustService.onDidChangeWorkspaceTrust(async trusted => {
                try {
                    if (trusted) {
                        await this.startPreviouslyBlockedServers();
                    } else {
                        await this.stopAllServers();
                    }
                } catch (error) {
                    this.logger.error('Failed to handle workspace trust change for MCP servers', error);
                }
            });
        });
    }

    protected async updateWorkspaceRoots(restart: boolean): Promise<void> {
        const startedServerNames = await this.frontendMCPService.getStartedServers();
        if (restart) {
            // stop all servers
            for (const name of startedServerNames) {
                await this.frontendMCPService.stopServer(name);
            }
        }

        // update the roots
        // either roots are supported or not
        const useWorkspaceAsRoot = this.preferenceService.get(MCP_USE_WORKSPACE_AS_ROOT_PREF, true);
        if (!useWorkspaceAsRoot) {
            this.manager.setWorkspaceRoots(undefined);
        } else {
            const roots = this.workspaceService.tryGetRoots().map(root => root.resource.toString());
            this.manager.setWorkspaceRoots(roots);
        }

        if (restart) {
            // restart servers
            for (const name of startedServerNames) {
                await this.frontendMCPService.startServer(name).catch(error => {
                    console.error(`Failed to restart MCP server ${name} after changing workspace root setting`, error);
                });
            }
        }
    }

    protected async startPreviouslyBlockedServers(): Promise<void> {
        if (this.blockedUntrustedServers.size === 0) {
            return;
        }
        const startedServers = await this.frontendMCPService.getStartedServers();
        for (const name of this.blockedUntrustedServers) {
            const serverDesc = this.prevServers.get(name);
            if (serverDesc && serverDesc.autostart && !startedServers.includes(name)) {
                await this.attemptSilentStartOrPromptForOAuth(name, serverDesc);
            }
        }
        this.blockedUntrustedServers.clear();
        this.updateBlockedServersStatusBar();
    }

    protected async stopAllServers(): Promise<void> {
        // Walk active servers (not just running ones) so a server in `Starting`, `Connecting`, or
        // `AuthenticationRequired` at the moment trust is lost is also interrupted.
        // Use `Promise.allSettled` so one hanging server's stop does not prevent the others from
        // being stopped during the untrusted-workspace transition.
        const activeServers = await this.frontendMCPService.getActiveServers();
        const results = await Promise.allSettled(activeServers.map(name => this.frontendMCPService.stopServer(name)));
        results.forEach((result, index) => {
            const name = activeServers[index];
            if (result.status === 'rejected') {
                console.error(`Failed to stop MCP server "${name}" on workspace-trust loss`, result.reason);
                // Skip blocked-set bookkeeping for servers we could not actually stop.
                return;
            }
            const serverDesc = this.prevServers.get(name);
            if (serverDesc?.autostart) {
                this.blockedUntrustedServers.add(name);
            }
        });
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
            label: nls.localize('theia/ai/mcp/blockedServersLabel', 'MCP Servers (autostart blocked)'),
            details: Array.from(this.blockedUntrustedServers)
        }];
    }

    protected async autoStartServers(servers: Map<string, MCPServerDescription>): Promise<void> {
        const startedServers = await this.frontendMCPService.getStartedServers();

        const isTrusted = await this.workspaceTrustService.getWorkspaceTrust();

        for (const [name, serverDesc] of servers) {
            if (serverDesc && serverDesc.autostart) {
                if (!startedServers.includes(name)) {
                    // Block MCP autostart in untrusted workspaces to prevent interaction with malicious content.
                    if (!isTrusted) {
                        this.blockedUntrustedServers.add(name);
                        continue;
                    }
                    await this.attemptSilentStartOrPromptForOAuth(name, serverDesc);
                }
            }
        }

        this.updateBlockedServersStatusBar();
    }

    /**
     * Autostart path for a single server. For non-OAuth servers, just calls `startServer`. For OAuth
     * servers, either skips the silent start when no usable credentials exist (and prompts the user)
     * or attempts the silent start; if the silent start lands in `AuthenticationRequired`, prompts
     * the user via a notification with a Sign In action.
     */
    protected async attemptSilentStartOrPromptForOAuth(name: string, serverDesc: MCPServerDescription): Promise<void> {
        const isOAuthServer = isRemoteMCPServerDescription(serverDesc) && !!serverDesc.oauth;
        if (isOAuthServer && !await this.frontendMCPService.hasStoredOAuthCredentials(name)) {
            // No usable stored credentials — skip the silent attempt and prompt directly.
            this.promptForOAuthSignIn(name);
            return;
        }
        await this.frontendMCPService.startServer(name);
        if (isOAuthServer) {
            const description = await this.frontendMCPService.getServerDescription(name);
            if (description?.status === MCPServerStatus.AuthenticationRequired) {
                this.promptForOAuthSignIn(name);
            }
        }
    }

    /**
     * Prompts the user to authorize the given MCP server via a non-modal notification with a 'Sign In'
     * action. Dismissed automatically once the start attempt concludes, see {@link dismissSettledSignInPrompts}.
     */
    protected promptForOAuthSignIn(serverName: string): void {
        this.pendingSignInPrompts.get(serverName)?.cancel();
        const signInAction = nls.localizeByDefault('Sign In');
        this.messageService.showProgress({
            text: nls.localize('theia/ai/mcp/oauth/notification/signInPrompt',
                'MCP server "{0}" requires authorization to start.', serverName),
            actions: [signInAction],
            options: { cancelable: true }
        }).then(progress => {
            this.pendingSignInPrompts.set(serverName, progress);
            return progress.result.then(action => {
                if (this.pendingSignInPrompts.get(serverName) === progress) {
                    this.pendingSignInPrompts.delete(serverName);
                }
                if (action !== signInAction) {
                    return undefined;
                }
                return this.frontendMCPService.startServerInteractive(serverName);
            });
        }).catch(error => {
            console.error(`Failed to drive OAuth sign-in prompt for MCP server "${serverName}"`, error);
        });
    }

    /** Dismisses sign-in prompts whose server was removed or whose start attempt has concluded. */
    protected async dismissSettledSignInPrompts(): Promise<void> {
        for (const [name, prompt] of Array.from(this.pendingSignInPrompts.entries())) {
            const description = await this.frontendMCPService.getServerDescription(name);
            const status = description?.status;
            if (!description || status === MCPServerStatus.Connected || status === MCPServerStatus.Running || status === MCPServerStatus.Errored) {
                this.pendingSignInPrompts.delete(name);
                prompt.cancel();
            }
        }
    }

    protected enqueueServerChanges(newServers: MCPServersPreference): void {
        this.serverChangeQueue = this.serverChangeQueue
            .then(() => this.handleServerChanges(newServers))
            .catch(error => {
                // Catch here (instead of propagating) so a single failed change does not poison the queue.
                console.error('Failed to handle MCP server preference changes', error);
                this.messageService.warn(nls.localize('theia/ai/mcp/warn/serverPreferenceChangeFailed',
                    'Failed to apply MCP server preference changes: {0}', error instanceof Error ? error.message : String(error)));
            });
    }

    protected async handleServerChanges(newServers: MCPServersPreference): Promise<void> {
        const oldServers = this.prevServers;
        const updatedServers = this.convertToMap(newServers);

        for (const [name] of oldServers) {
            if (!updatedServers.has(name)) {
                await this.manager.removeServer(name);
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
                this.logger.debug('Failed to compare MCP server descriptions, assuming a difference', e);
                diff = true;
            }
            if (diff) {
                await this.manager.addOrUpdateServer(description);
            }
        }

        this.prevServers = updatedServers;
        await this.autoStartServers(updatedServers);
    }

    protected async syncServers(servers: Map<string, MCPServerDescription>): Promise<void> {
        // Initial sync only: `prevServers` is assigned to the same map immediately before this call, so a
        // remove-pass would compare the map against itself and never iterate. Server removals on subsequent
        // preference changes are handled by `handleServerChanges`, which holds onto the previous map.
        for (const [, description] of servers) {
            await this.manager.addOrUpdateServer(description);
        }
    }

    protected convertToMap(servers: MCPServersPreference): Map<string, MCPServerDescription> {
        const map = new Map<string, MCPServerDescription>();
        Object.entries(servers).forEach(([name, description]) => {
            let filteredDescription: MCPServerDescription;

            const { registryMetadata } = description;

            if ('serverUrl' in description) {
                // Create RemoteMCPServerDescription by picking only remote-specific properties
                const { serverUrl, serverAuthToken, serverAuthTokenHeader, headers, oauth, autostart } = description;
                filteredDescription = {
                    name,
                    serverUrl,
                    ...(serverAuthToken && { serverAuthToken }),
                    ...(serverAuthTokenHeader && { serverAuthTokenHeader }),
                    ...(headers && { headers }),
                    ...(oauth && { oauth }),
                    autostart: autostart ?? true,
                    ...(registryMetadata && { registryMetadata }),
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
                    ...(registryMetadata && { registryMetadata }),
                };
            }

            map.set(name, filteredDescription);
        });
        return map;
    }
}
