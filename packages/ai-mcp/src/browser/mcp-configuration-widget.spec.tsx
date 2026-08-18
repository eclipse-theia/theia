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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Another spec in this package may have already set the configuration; mocha loads all
// specs into one process and `set` throws if called twice, so guard it.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { Emitter, Event, MessageService, PreferenceScope, PreferenceService } from '@theia/core';
import {
    LocalMCPServerDescription,
    MCPFrontendNotificationService,
    MCPFrontendService,
    MCPServerDescription,
    MCPServerStatus,
    RemoteMCPServerDescription
} from '../common/mcp-server-manager';
import { AIMCPConfigurationWidget } from './mcp-configuration-widget';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { MCPRegistryUiBridge } from './mcp-registry-ui-bridge';

disableJSDOM();

class TestAIMCPConfigurationWidget extends AIMCPConfigurationWidget {
    protected confirmSignOutResult = true;

    setConfirmSignOutResult(value: boolean): void {
        this.confirmSignOutResult = value;
    }

    setServers(servers: MCPServerDescription[]): void {
        this.servers = servers;
        this.oauthCredentialStates = Object.fromEntries(servers.map(server => [server.name, true]));
    }

    testRender(): React.ReactNode {
        return this.render();
    }

    testGetStatusColor(status: MCPServerStatus): { bg: string, fg: string } {
        return this.getStatusColor(status);
    }

    protected override async confirmSignOut(): Promise<boolean> {
        return this.confirmSignOutResult;
    }
}

describe('AIMCPConfigurationWidget MCP OAuth support', () => {
    let host: HTMLElement;
    let root: Root | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        root?.unmount();
        root = undefined;
        host.remove();
    });

    function createWidget(options: {
        servers?: MCPServerDescription[];
        preferenceValue?: Record<string, object>;
        onPreferenceSet?: (value: Record<string, object>) => void;
        onSignOut?: (serverName: string) => void;
        onSignIn?: (serverName: string) => boolean | Promise<boolean> | never;
        onStartServerInteractive?: (serverName: string) => boolean | Promise<boolean> | never;
        onStopServer?: (serverName: string) => void;
        onWarn?: (message: string) => void;
        onInfo?: (message: string) => void;
        installedPlugins?: InstalledAgentPluginInfo[];
        onRevealPlugin?: (pluginId: string) => void;
        onOpenRegistry?: (serverId?: string) => void;
    } = {}): TestAIMCPConfigurationWidget {
        const onDidUpdateMCPServersEmitter = new Emitter<void>();
        const widget = new TestAIMCPConfigurationWidget();
        widget.setServers(options.servers ?? []);
        (widget as unknown as { mcpFrontendService: Partial<MCPFrontendService> }).mcpFrontendService = {
            signOut: async serverName => options.onSignOut?.(serverName),
            signIn: async serverName => (await options.onSignIn?.(serverName)) ?? false,
            getPromptTemplateId: serverName => `mcp_${serverName}_tools`,
            hasStoredOAuthCredentials: async () => false,
            startServerInteractive: async serverName => (await options.onStartServerInteractive?.(serverName)) ?? true,
            stopServer: async serverName => { options.onStopServer?.(serverName); }
        };
        (widget as unknown as { messageService: Partial<MessageService> }).messageService = {
            warn: message => { options.onWarn?.(String(message)); return Promise.resolve(); },
            info: message => { options.onInfo?.(String(message)); return Promise.resolve(); },
            error: () => Promise.resolve()
        };
        (widget as unknown as { mcpFrontendNotificationService: MCPFrontendNotificationService }).mcpFrontendNotificationService = {
            onDidUpdateMCPServers: onDidUpdateMCPServersEmitter.event,
            didUpdateMCPServers: () => onDidUpdateMCPServersEmitter.fire()
        };
        (widget as unknown as { workspaceTrustService: Partial<WorkspaceTrustService> }).workspaceTrustService = {
            getWorkspaceTrust: async () => true,
            onDidChangeWorkspaceTrust: Event.None
        };
        (widget as unknown as { preferenceService: Partial<PreferenceService> }).preferenceService = {
            get: () => options.preferenceValue ?? {},
            set: async (preferenceName: string, value: unknown, scope?: PreferenceScope) => {
                options.onPreferenceSet?.(value as Record<string, object>);
            }
        };
        const installedPlugins = options.installedPlugins ?? [];
        (widget as unknown as { agentPluginBridge: AgentPluginUiBridge }).agentPluginBridge = {
            getPlugin: pluginId => installedPlugins.find(plugin => plugin.pluginId === pluginId),
            // Only the skills widget looks a plugin up by qualifier; a server carries the identifier.
            getPluginByQualifier: () => undefined,
            revealPlugin: pluginId => options.onRevealPlugin?.(pluginId),
            onDidChange: Event.None
        };
        if (options.onOpenRegistry) {
            (widget as unknown as { registryBridge: Partial<MCPRegistryUiBridge> }).registryBridge = {
                openRegistry: async serverId => { options.onOpenRegistry?.(serverId); }
            };
        }
        return widget;
    }

    function renderWidget(widget: TestAIMCPConfigurationWidget): void {
        root ??= createRoot(host);
        // root.render is async; flushSync keeps the tests' immediate assertions valid.
        flushSync(() => root!.render(widget.testRender() as React.ReactElement));
    }

    const oauthServer: RemoteMCPServerDescription = {
        name: 'oauth-server',
        serverUrl: 'https://mcp.example.com/mcp',
        status: MCPServerStatus.NotConnected,
        oauth: {
            clientId: 'client-id',
            scopes: ['mcp.read', 'mcp.write'],
            authorizationServer: 'https://auth.example.com',
            resource: 'https://mcp.example.com/mcp'
        }
    };

    it('renders OAuth summary', () => {
        const widget = createWidget({ servers: [oauthServer] });
        renderWidget(widget);

        const text = host.textContent ?? '';
        expect(text).to.contain('OAuth');
        expect(text).to.contain('OAuth Client ID=client-id');
        expect(text).to.contain('OAuth Scopes=mcp.read mcp.write');
        expect(text).to.not.contain('OAuth Client Secret');
    });

    it('masks a configured OAuth client secret in the summary', async () => {
        const widget = createWidget({
            servers: [{ ...oauthServer, oauth: { ...oauthServer.oauth, clientSecret: 'top-secret-value' } }]
        });
        renderWidget(widget);

        const text = host.textContent ?? '';
        expect(text).to.contain('OAuth Client Secret=******');
        expect(text).to.not.contain('top-secret-value');
    });

    it('shows sign out action for OAuth-enabled remote servers and calls signOut after confirmation', async () => {
        let signedOutServer: string | undefined;
        const widget = createWidget({ servers: [oauthServer], onSignOut: serverName => signedOutServer = serverName });
        renderWidget(widget);

        const signOutButton = host.querySelector('button[title="Sign Out"]') as HTMLButtonElement | undefined;
        expect(signOutButton).to.not.be.undefined;
        signOutButton!.click();
        await Promise.resolve();

        expect(signedOutServer).to.equal('oauth-server');
    });

    it('surfaces a warning toast when signOut rejects', async () => {
        let warning: string | undefined;
        const originalConsoleError = console.error;
        console.error = () => { };
        try {
            const widget = createWidget({
                servers: [oauthServer],
                onSignOut: () => { throw new Error('rpc broken'); },
                onWarn: message => warning = message
            });
            renderWidget(widget);

            const signOutButton = host.querySelector('button[title="Sign Out"]') as HTMLButtonElement | null;
            expect(signOutButton).to.not.be.null;
            signOutButton!.click();
            await Promise.resolve();
            await Promise.resolve();
        } finally {
            console.error = originalConsoleError;
        }

        expect(warning).to.contain('oauth-server');
    });

    it('does not sign out when confirmation is cancelled', async () => {
        let signedOutServer: string | undefined;
        const widget = createWidget({ servers: [oauthServer], onSignOut: serverName => signedOutServer = serverName });
        widget.setConfirmSignOutResult(false);
        renderWidget(widget);

        const signOutButton = host.querySelector('button[title="Sign Out"]') as HTMLButtonElement | undefined;
        signOutButton!.click();
        await Promise.resolve();

        expect(signedOutServer).to.be.undefined;
    });

    it('treats Authentication Required as warning-colored and startable', () => {
        const widget = createWidget({
            servers: [{ ...oauthServer, status: MCPServerStatus.AuthenticationRequired }]
        });
        renderWidget(widget);

        const colors = widget.testGetStatusColor(MCPServerStatus.AuthenticationRequired);
        expect(colors.bg).to.equal('var(--theia-warningBackground)');
        expect(colors.fg).to.equal('var(--theia-warningForeground)');
        expect(host.querySelector('button[title="Connect"]')).to.not.be.null;
    });

    describe('Connect / Start action', () => {
        const localServer: LocalMCPServerDescription = {
            name: 'local-server',
            command: 'node',
            status: MCPServerStatus.NotRunning
        };

        async function flushClickHandlers(): Promise<void> {
            // Two ticks: the React onClick handler awaits `startServerInteractive`, then any subsequent
            // `messageService.warn` in the catch path resolves on the next microtask.
            await Promise.resolve();
            await Promise.resolve();
        }

        it('routes a non-OAuth Start click through startServerInteractive with the server name', async () => {
            let startedServer: string | undefined;
            const widget = createWidget({
                servers: [localServer],
                onStartServerInteractive: name => { startedServer = name; return true; }
            });
            renderWidget(widget);

            const startButton = host.querySelector('button[title="Start Server"]') as HTMLButtonElement | null;
            expect(startButton).to.not.be.null;
            startButton!.click();
            await flushClickHandlers();

            expect(startedServer).to.equal('local-server');
        });

        it('routes an OAuth Connect click through startServerInteractive (backend gates the OAuth flow)', async () => {
            // The widget intentionally does not call `prepareAuthorization` or inspect the oauth config. The
            // OAuth provider's interactive gate is set inside `startServerInteractive` downstream, so the
            // same call uniformly handles OAuth and non-OAuth servers.
            let startedServer: string | undefined;
            const widget = createWidget({
                servers: [oauthServer],
                onStartServerInteractive: name => { startedServer = name; return true; }
            });
            renderWidget(widget);

            const connectButton = host.querySelector('button[title="Connect"]') as HTMLButtonElement | null;
            expect(connectButton).to.not.be.null;
            connectButton!.click();
            await flushClickHandlers();

            expect(startedServer).to.equal('oauth-server');
        });

        it('stops a server stuck in Authentication Required before restarting it', async () => {
            // A start in `AuthenticationRequired` would join the pending OAuth flow and do nothing -
            // the user who closed the browser window would be stuck. Stop-then-start restarts cleanly.
            const calls: string[] = [];
            const widget = createWidget({
                servers: [{ ...oauthServer, status: MCPServerStatus.AuthenticationRequired }],
                onStartServerInteractive: name => { calls.push(`start:${name}`); return true; },
                onStopServer: name => { calls.push(`stop:${name}`); }
            });
            renderWidget(widget);

            const connectButton = host.querySelector('button[title="Connect"]') as HTMLButtonElement | null;
            expect(connectButton).to.not.be.null;
            connectButton!.click();
            await flushClickHandlers();

            expect(calls).to.deep.equal(['stop:oauth-server', 'start:oauth-server']);
        });

        it('does not stop a not-connected server before starting it', async () => {
            const calls: string[] = [];
            const widget = createWidget({
                servers: [oauthServer],
                onStartServerInteractive: name => { calls.push(`start:${name}`); return true; },
                onStopServer: name => { calls.push(`stop:${name}`); }
            });
            renderWidget(widget);

            const connectButton = host.querySelector('button[title="Connect"]') as HTMLButtonElement | null;
            connectButton!.click();
            await flushClickHandlers();

            expect(calls).to.deep.equal(['start:oauth-server']);
        });

        it('offers Disconnect for a remote server in Authentication Required so an abandoned sign-in can be dismissed', async () => {
            let stoppedServer: string | undefined;
            const widget = createWidget({
                servers: [{ ...oauthServer, status: MCPServerStatus.AuthenticationRequired }],
                onStopServer: name => { stoppedServer = name; }
            });
            renderWidget(widget);

            const stopButton = host.querySelector('button[title="Disconnect"]') as HTMLButtonElement | null;
            expect(stopButton).to.not.be.null;
            stopButton!.click();
            await flushClickHandlers();

            expect(stoppedServer).to.equal('oauth-server');
        });

        it('surfaces a warning toast when startServerInteractive rejects', async () => {
            let warning: string | undefined;
            const originalConsoleError = console.error;
            console.error = () => { };
            try {
                const widget = createWidget({
                    servers: [localServer],
                    onStartServerInteractive: () => { throw new Error('rpc broken'); },
                    onWarn: message => warning = message
                });
                renderWidget(widget);

                const startButton = host.querySelector('button[title="Start Server"]') as HTMLButtonElement | null;
                startButton!.click();
                await flushClickHandlers();
            } finally {
                console.error = originalConsoleError;
            }

            expect(warning).to.contain('local-server');
        });
    });

    describe('Sign In action', () => {
        async function flushClickHandlers(): Promise<void> {
            await Promise.resolve();
            await Promise.resolve();
        }

        it('shows Sign In for a startable OAuth server and reports success', async () => {
            const calls: string[] = [];
            let info: string | undefined;
            const widget = createWidget({
                servers: [oauthServer],
                onSignIn: name => { calls.push(`signIn:${name}`); return true; },
                onInfo: message => info = message
            });
            renderWidget(widget);

            const signInButton = host.querySelector('button[title="Sign In"]') as HTMLButtonElement | null;
            expect(signInButton).to.not.be.null;
            signInButton!.click();
            await flushClickHandlers();

            expect(calls).to.deep.equal(['signIn:oauth-server']);
            expect(info).to.contain('oauth-server');
        });

        it('warns when the sign-in does not complete', async () => {
            let warning: string | undefined;
            const widget = createWidget({
                servers: [oauthServer],
                onSignIn: () => false,
                onWarn: message => warning = message
            });
            renderWidget(widget);

            const signInButton = host.querySelector('button[title="Sign In"]') as HTMLButtonElement | null;
            signInButton!.click();
            await flushClickHandlers();

            expect(warning).to.contain('oauth-server');
        });

        it('hides Sign In for a running OAuth server and for non-OAuth servers', () => {
            const widget = createWidget({
                servers: [
                    { ...oauthServer, status: MCPServerStatus.Connected },
                    { name: 'plain-remote', serverUrl: 'https://mcp.example.com/mcp', status: MCPServerStatus.NotConnected }
                ]
            });
            renderWidget(widget);

            expect(host.querySelector('button[title="Sign In"]')).to.be.null;
        });
    });

    describe('Agent Plugin paths', () => {

        const pluginRoot = '/home/user/.agents/plugins/io.github.acme_devtools';
        const pluginServer: LocalMCPServerDescription = {
            name: 'validator',
            command: './bin/validator',
            status: MCPServerStatus.NotRunning,
            cwd: pluginRoot,
            pluginRoot,
            pluginData: '/home/user/.agents/plugin-data/io.github.acme_devtools'
        };

        it('shows the working directory and the plugin roots, which the user cannot author', () => {
            const widget = createWidget({ servers: [pluginServer] });
            renderWidget(widget);

            const readOnly = Array.from(host.querySelectorAll('.mcp-property-readonly')).map(node => node.textContent);
            expect(readOnly).to.have.lengthOf(3);
            expect(readOnly[0]).to.contain(pluginRoot);
            expect(readOnly[1]).to.contain('PLUGIN_ROOT');
            expect(readOnly[2]).to.contain('/home/user/.agents/plugin-data/io.github.acme_devtools');
            expect(readOnly[2]).to.contain('PLUGIN_DATA');
        });

        it('shows no plugin path rows for a server the user configured by hand', () => {
            const widget = createWidget({ servers: [{ name: 'own', command: 'my-server', status: MCPServerStatus.NotRunning }] });
            renderWidget(widget);

            expect(host.querySelectorAll('.mcp-property-readonly')).to.have.lengthOf(0);
        });
    });

    describe('Agent Plugin provenance', () => {
        const devtools: InstalledAgentPluginInfo = { pluginId: 'io.github.acme/devtools', name: 'Acme Devtools' };

        const pluginServer: LocalMCPServerDescription = {
            name: 'validator',
            command: './bin/validator',
            status: MCPServerStatus.NotRunning,
            registryMetadata: { pluginId: devtools.pluginId }
        };

        function pluginLink(): HTMLButtonElement | null {
            return host.querySelector('button[title^="Open the Agent Plugin"]') as HTMLButtonElement | null;
        }

        it('labels a plugin-provided server with the name of the plugin that supplied it', () => {
            const widget = createWidget({ servers: [pluginServer], installedPlugins: [devtools] });
            renderWidget(widget);

            expect(host.textContent).to.contain('via Acme Devtools');
        });

        it('reveals the owning plugin rather than a registry server when the provenance link is clicked', () => {
            const revealed: string[] = [];
            const openedRegistryEntries: (string | undefined)[] = [];
            const widget = createWidget({
                servers: [pluginServer],
                installedPlugins: [devtools],
                onRevealPlugin: pluginId => revealed.push(pluginId),
                onOpenRegistry: serverId => openedRegistryEntries.push(serverId)
            });
            renderWidget(widget);

            pluginLink()!.click();

            expect(revealed).to.deep.equal([devtools.pluginId]);
            expect(openedRegistryEntries).to.be.empty;
        });

        it('renders nothing rather than a bare identifier when the owning plugin is not installed', () => {
            const widget = createWidget({ servers: [pluginServer], installedPlugins: [] });
            renderWidget(widget);

            expect(pluginLink()).to.be.null;
            expect(host.textContent).to.not.contain(devtools.pluginId);
        });

        it('shows the plugin label alongside the registry indicator when the entry carries both', () => {
            const widget = createWidget({
                servers: [{ ...pluginServer, registryMetadata: { serverId: 'io.github.acme/validator', pluginId: devtools.pluginId } }],
                installedPlugins: [devtools],
                onOpenRegistry: () => { }
            });
            renderWidget(widget);

            expect(host.textContent).to.contain('From registry');
            expect(host.textContent).to.contain('via Acme Devtools');
        });

        it('shows no provenance label for a server that was not contributed by a plugin', () => {
            const widget = createWidget({
                servers: [{ name: 'plain-local', command: 'npx', status: MCPServerStatus.NotRunning }],
                installedPlugins: [devtools]
            });
            renderWidget(widget);

            expect(pluginLink()).to.be.null;
        });
    });
});
