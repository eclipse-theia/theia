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
import { inject, injectable } from '@theia/core/shared/inversify';
import { isRemoteMCPServerDescription, MCPServerDescription, MCPServerManager, MCPFrontendNotificationService, RemoteMCPServerDescription } from '../common/mcp-server-manager';
import { MCPServer } from './mcp-server';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CallToolResult, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { MCPOAuthClientProviderFactory } from './mcp-oauth-client-provider-factory';
import { MCPOAuthCredentialStore } from './mcp-oauth-credential-store';
import { deriveCredentialScope, normalizeOAuthUrl } from './mcp-oauth-keystore';
import { PreferenceUtils } from '@theia/core';
import { JSONObject } from '@theia/core/shared/@lumino/coreutils';

@injectable()
export class MCPServerManagerImpl implements MCPServerManager {

    protected servers: Map<string, MCPServer> = new Map();
    protected client?: MCPFrontendNotificationService;
    protected serverListeners: Map<string, Disposable> = new Map();
    protected roots: string[] | undefined;

    @inject(MCPOAuthClientProviderFactory)
    protected readonly oauthClientProviderFactory: MCPOAuthClientProviderFactory;

    @inject(MCPOAuthCredentialStore)
    protected readonly credentialStore: MCPOAuthCredentialStore;

    async stopServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        try {
            await server.stop();
            console.log(`MCP server "${serverName}" stopped.`);
        } finally {
            this.notifyClients();
        }
    }

    async signOut(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        try {
            if (server && !server.isStopped()) {
                try {
                    await server.stop();
                } catch (error) {
                    console.error(`Failed to stop MCP server "${serverName}" during sign-out`, error);
                }
            }
            await this.credentialStore.clear(serverName);
        } finally {
            this.notifyClients();
        }
    }

    async hasStoredOAuthCredentials(serverName: string): Promise<boolean> {
        const server = this.servers.get(serverName);
        const description = server?.getCachedDescription();
        if (!description || !isRemoteMCPServerDescription(description) || !description.oauth) {
            return false;
        }
        return this.credentialStore.hasTokens(serverName, description.serverUrl, description.oauth);
    }

    async getRunningServers(): Promise<string[]> {
        const runningServers: string[] = [];
        for (const [name, server] of this.servers.entries()) {
            if (server.isRunning()) {
                runningServers.push(name);
            }
        }
        return runningServers;
    }

    async getActiveServers(): Promise<string[]> {
        const activeServers: string[] = [];
        for (const [name, server] of this.servers.entries()) {
            if (!server.isStopped()) {
                activeServers.push(name);
            }
        }
        return activeServers;
    }

    callTool(serverName: string, toolName: string, arg_string: string): Promise<CallToolResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.callTool(toolName, arg_string);
    }

    async startServer(serverName: string, options: { interactive?: boolean } = {}): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        const description = await server.getDescription();
        if (description.resolve) {
            const resolved = await description.resolve(description);
            if (resolved && !this.haveSameConfiguration(description, resolved)) {
                await this.clearOAuthCredentialsIfConnectionScopeChanged(description, resolved);
                await this.clearOAuthCredentialsIfDisabled(description, resolved);
                server.update(resolved);
            }
        }
        await server.start({ interactive: !!options.interactive });
        this.notifyClients();
    }

    protected haveSameConfiguration(a: MCPServerDescription, b: MCPServerDescription): boolean {
        return PreferenceUtils.deepEqual(
            this.configurationOnly(a) as unknown as JSONObject,
            this.configurationOnly(b) as unknown as JSONObject
        );
    }

    protected configurationOnly(description: MCPServerDescription): Partial<MCPServerDescription> {
        const { status, error, tools, resolve, ...configuration } = description;
        return configuration;
    }

    async getServerNames(): Promise<string[]> {
        return Array.from(this.servers.keys());
    }

    async getServerDescription(name: string): Promise<MCPServerDescription | undefined> {
        const server = this.servers.get(name);
        return server ? await server.getDescription() : undefined;
    }

    public async getTools(serverName: string): ReturnType<MCPServer['getTools']> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return await server.getTools();
    }

    async addOrUpdateServer(description: MCPServerDescription): Promise<void> {
        const existingServer = this.servers.get(description.name);

        if (existingServer) {
            const oldDescription = existingServer.getCachedDescription();
            const restartServer = this.connectionChangeRequiresRestart(existingServer, oldDescription, description);
            if (restartServer) {
                await existingServer.stop();
            }
            await this.clearOAuthCredentialsIfConnectionScopeChanged(oldDescription, description);
            await this.clearOAuthCredentialsIfDisabled(oldDescription, description);
            existingServer.update(description, this.shouldResetStatusAfterUpdate(existingServer, restartServer));
        } else {
            const newServer = new MCPServer(description, this.oauthClientProviderFactory);
            newServer.setWorkspaceRoots(this.roots);
            this.servers.set(description.name, newServer);
            const listener = newServer.onDidUpdateStatus(() => {
                this.notifyClients();
            });
            this.serverListeners.set(description.name, listener);
        }
        this.notifyClients();
    }

    async removeServer(name: string): Promise<void> {
        const server = this.servers.get(name);
        if (server) {
            try {
                await server.stop();
            } catch (error) {
                console.error(`Failed to stop MCP server "${name}" during removal`, error);
            }
            await this.credentialStore.clear(name);
            this.servers.delete(name);
            const listener = this.serverListeners.get(name);
            if (listener) {
                listener.dispose();
                this.serverListeners.delete(name);
            }
        } else {
            console.warn(`MCP server "${name}" not found.`);
        }
        this.notifyClients();
    }

    protected shouldRestartServer(oldDescription: MCPServerDescription, newDescription: MCPServerDescription): boolean {
        return !PreferenceUtils.deepEqual(
            this.connectionDescription(oldDescription) as JSONObject,
            this.connectionDescription(newDescription) as JSONObject
        );
    }

    protected connectionChangeRequiresRestart(server: MCPServer, oldDescription: MCPServerDescription, newDescription: MCPServerDescription): boolean {
        // Any non-terminal state must be cancelled because an in-flight doStart would keep reading the
        // OLD serverUrl/headers/oauth on reconnect/SSE-fallback paths after update() swaps the description.
        return !server.isStopped() && this.shouldRestartServer(oldDescription, newDescription);
    }

    protected shouldResetStatusAfterUpdate(server: MCPServer, restartedByCaller: boolean): boolean {
        return restartedByCaller || (!server.isRunning() && !server.isInFlight());
    }

    protected connectionDescription(description: MCPServerDescription): object {
        if (isRemoteMCPServerDescription(description)) {
            const { serverUrl, serverAuthToken, serverAuthTokenHeader, headers, oauth } = description;
            return { type: 'remote', serverUrl, serverAuthToken, serverAuthTokenHeader, headers, oauth };
        }
        const { command, args, env } = description;
        return { type: 'local', command, args, env };
    }

    protected async clearOAuthCredentialsIfConnectionScopeChanged(oldDescription: MCPServerDescription, newDescription: MCPServerDescription): Promise<void> {
        if (isRemoteMCPServerDescription(oldDescription)
            && oldDescription.oauth
            && isRemoteMCPServerDescription(newDescription)
            && newDescription.oauth
            && this.connectionScopeChanged(oldDescription, newDescription)) {
            await this.credentialStore.clear(oldDescription.name);
        }
    }

    protected connectionScopeChanged(
        oldDescription: RemoteMCPServerDescription,
        newDescription: RemoteMCPServerDescription
    ): boolean {
        if (this.credentialScopeKey(oldDescription) !== this.credentialScopeKey(newDescription)) {
            return true;
        }
        if (this.normalizedAuthorizationServer(oldDescription.oauth?.authorizationServer)
            !== this.normalizedAuthorizationServer(newDescription.oauth?.authorizationServer)) {
            return true;
        }
        if (oldDescription.oauth?.clientId !== newDescription.oauth?.clientId) {
            return true;
        }
        if (this.normalizedScopes(oldDescription.oauth?.scopes) !== this.normalizedScopes(newDescription.oauth?.scopes)) {
            return true;
        }
        return false;
    }

    protected credentialScopeKey(description: RemoteMCPServerDescription): string {
        // Reuse the shared `deriveCredentialScope` so this check matches the factory/store keystore key exactly.
        return deriveCredentialScope(description.serverUrl, description.oauth ?? {});
    }

    protected normalizedAuthorizationServer(authorizationServer: string | undefined): string | undefined {
        // Normalize so a trailing-slash-only edit to the authorization server is not mistaken for a scope change.
        return authorizationServer === undefined ? undefined : normalizeOAuthUrl(authorizationServer);
    }

    protected normalizedScopes(scopes: string[] | undefined): string {
        return JSON.stringify([...(scopes ?? [])].sort());
    }

    protected async clearOAuthCredentialsIfDisabled(oldDescription: MCPServerDescription, newDescription: MCPServerDescription): Promise<void> {
        if (isRemoteMCPServerDescription(oldDescription)
            && oldDescription.oauth
            && (!isRemoteMCPServerDescription(newDescription) || !newDescription.oauth)) {
            await this.credentialStore.clear(oldDescription.name);
        }
    }

    setClient(client: MCPFrontendNotificationService): void {
        if (this.client && this.client !== client) {
            throw new Error('MCP server manager is scoped to a single frontend connection.');
        }
        this.client = client;
    }

    disconnectClient(client: MCPFrontendNotificationService): void {
        if (this.client !== undefined && this.client !== client) {
            console.warn('MCP server manager received disconnectClient for a non-current client; ignoring (one-client-per-container invariant violation).');
            return;
        }
        if (this.client === client) {
            this.client = undefined;
            this.stopServersAfterDisconnect().catch(error => console.error('Failed to stop MCP servers after frontend disconnect', error));
        }
    }

    protected async stopServersAfterDisconnect(): Promise<void> {
        const entries = Array.from(this.servers.entries());
        const results = await Promise.allSettled(entries.map(async ([, server]) => server.stop()));
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const [name] = entries[index];
                console.error(`Failed to stop MCP server "${name}" after frontend disconnect`, result.reason);
            }
        });
    }

    private notifyClients(): void {
        if (!this.client) {
            return;
        }
        try {
            this.client.didUpdateMCPServers();
        } catch (error) {
            console.error('Failed to notify MCP frontend client', error);
        }
    }

    readResource(serverName: string, resourceId: string): Promise<ReadResourceResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.readResource(resourceId);
    }

    getResources(serverName: string): Promise<ListResourcesResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.getResources();
    }

    setWorkspaceRoots(roots: string[] | undefined): void {
        this.roots = roots;
        this.servers.forEach(server => {
            server.setWorkspaceRoots(roots);
        });
    }
}
