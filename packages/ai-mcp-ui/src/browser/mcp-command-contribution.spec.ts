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
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Command, CommandHandler, CommandRegistry, ILogger, MessageService } from '@theia/core';
import { QuickInputService } from '@theia/core/lib/browser';
import { MCPFrontendService, MCPOAuthFrontendDelegate, MCPServerDescription, MCPServerStatus } from '@theia/ai-mcp';
import { GetMCPOAuthRedirectUrl, MCPCommandContribution, SignInMCPServer, SignOutMCPServer, StartMCPServer, StopMCPServer } from './mcp-command-contribution';

disableJSDOM();

describe('MCPCommandContribution', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    function createContribution(options: {
        descriptions: Record<string, Awaited<ReturnType<MCPFrontendService['getServerDescription']>>>;
        selected?: string;
        onSignOut?: (serverName: string) => void;
        onSignIn?: (serverName: string) => boolean;
        onStopServer?: (serverName: string) => void;
        onError?: (message: string) => void;
        onInfo?: (message: string) => void;
        onWarn?: (message: string) => void;
        /** Action returned by the faked `messageService.info`, e.g. 'Copy'. */
        infoResult?: string;
        effectiveRedirectUrl?: string;
        hasStoredOAuthCredentials?: (serverName: string) => boolean;
    }): { contribution: MCPCommandContribution, handlers: Map<string, CommandHandler> } {
        const contribution = new MCPCommandContribution();
        const handlers = new Map<string, CommandHandler>();
        (contribution as unknown as { commandHandlerFactory: (handler: CommandHandler) => CommandHandler }).commandHandlerFactory = handler => handler;
        (contribution as unknown as { quickInputService: Partial<QuickInputService> }).quickInputService = {
            showQuickPick: async items => items.find(item => 'label' in item && item.label === options.selected) as never
        };
        (contribution as unknown as { messageService: Partial<MessageService> }).messageService = {
            error: message => { options.onError?.(String(message)); return Promise.resolve(); },
            info: message => { options.onInfo?.(String(message)); return Promise.resolve(options.infoResult) as Promise<never>; },
            warn: message => { options.onWarn?.(String(message)); return Promise.resolve(); }
        };
        (contribution as unknown as { mcpFrontendService: Partial<MCPFrontendService> }).mcpFrontendService = {
            getServerNames: async () => Object.keys(options.descriptions),
            getServerDescription: async name => options.descriptions[name],
            hasStoredOAuthCredentials: async serverName => options.hasStoredOAuthCredentials?.(serverName) ?? false,
            signOut: async serverName => options.onSignOut?.(serverName),
            signIn: async serverName => options.onSignIn?.(serverName) ?? false,
            stopServer: async serverName => { options.onStopServer?.(serverName); }
        };
        (contribution as unknown as { logger: Partial<ILogger> }).logger = {
            error: async () => { },
            warn: async () => { }
        };
        (contribution as unknown as { oauthFrontendDelegate: Partial<MCPOAuthFrontendDelegate> }).oauthFrontendDelegate = {
            getEffectiveRedirectUrl: async () => {
                if (options.effectiveRedirectUrl === undefined) {
                    throw new Error('no redirect URL available in this test');
                }
                return options.effectiveRedirectUrl;
            }
        };
        contribution.registerCommands({
            registerCommand: (command: Command, handler: CommandHandler) => {
                handlers.set(command.id, handler);
                return { dispose: () => { } };
            }
        } as unknown as CommandRegistry);
        return { contribution, handlers };
    }

    it('offers sign out only for OAuth-enabled remote MCP servers', async () => {
        let signedOutServer: string | undefined;
        const { handlers } = createContribution({
            selected: 'oauth-remote',
            onSignOut: serverName => signedOutServer = serverName,
            hasStoredOAuthCredentials: serverName => serverName === 'oauth-remote',
            descriptions: {
                local: { name: 'local', command: 'node' },
                remote: { name: 'remote', serverUrl: 'https://mcp.example.com/mcp' },
                'oauth-remote': { name: 'oauth-remote', serverUrl: 'https://mcp.example.com/mcp', oauth: {} }
            }
        });

        await handlers.get(SignOutMCPServer.id)!.execute();

        expect(signedOutServer).to.equal('oauth-remote');
    });

    it('shows a specific message when no OAuth-enabled MCP servers are configured', async () => {
        let infoMessage: string | undefined;
        const { handlers } = createContribution({
            onInfo: message => infoMessage = message,
            descriptions: {
                local: { name: 'local', command: 'node' }
            }
        });

        await handlers.get(SignOutMCPServer.id)!.execute();

        expect(infoMessage).to.equal('No OAuth-enabled MCP servers configured.');
    });

    it('lists OAuth-enabled servers without filtering by current-scope credentials so stale-scope cleanup is reachable', async () => {
        // When `serverUrl` was edited externally or a transient keystore failure left tokens orphaned,
        // `hasStoredOAuthCredentials` for the NEW scope returns false while stale tokens remain at the OLD
        // scope. The command palette must still list the server so sign-out can sweep all scopes by prefix.
        let signedOutServer: string | undefined;
        const { handlers } = createContribution({
            selected: 'oauth-server-without-current-scope-creds',
            onSignOut: serverName => signedOutServer = serverName,
            hasStoredOAuthCredentials: () => false,
            descriptions: {
                'oauth-server-without-current-scope-creds': {
                    name: 'oauth-server-without-current-scope-creds',
                    serverUrl: 'https://mcp.example.com/new-mcp',
                    oauth: {}
                }
            }
        });

        await handlers.get(SignOutMCPServer.id)!.execute();

        expect(signedOutServer).to.equal('oauth-server-without-current-scope-creds');
    });

    it('signs in to the selected OAuth server and reports success', async () => {
        const signIns: string[] = [];
        let infoMessage: string | undefined;
        const { handlers } = createContribution({
            selected: 'oauth-remote',
            onSignIn: serverName => { signIns.push(serverName); return true; },
            onInfo: message => infoMessage = message,
            descriptions: {
                local: { name: 'local', command: 'node' },
                'oauth-remote': { name: 'oauth-remote', serverUrl: 'https://mcp.example.com/mcp', oauth: {} }
            }
        });

        await handlers.get(SignInMCPServer.id)!.execute();

        expect(signIns).to.deep.equal(['oauth-remote']);
        expect(infoMessage).to.contain('oauth-remote');
    });

    it('warns when the sign-in does not complete', async () => {
        let warning: string | undefined;
        const { handlers } = createContribution({
            selected: 'oauth-remote',
            onSignIn: () => false,
            onWarn: message => warning = message,
            descriptions: {
                'oauth-remote': { name: 'oauth-remote', serverUrl: 'https://mcp.example.com/mcp', oauth: {} }
            }
        });

        await handlers.get(SignInMCPServer.id)!.execute();

        expect(warning).to.contain('oauth-remote');
    });

    it('shows the no-OAuth-servers message for sign-in when none are configured', async () => {
        let infoMessage: string | undefined;
        const { handlers } = createContribution({
            onInfo: message => infoMessage = message,
            descriptions: {
                local: { name: 'local', command: 'node' }
            }
        });

        await handlers.get(SignInMCPServer.id)!.execute();

        expect(infoMessage).to.equal('No OAuth-enabled MCP servers configured.');
    });

    it('offers stop for a server awaiting OAuth authorization so an abandoned sign-in can be dismissed', async () => {
        const stopped: string[] = [];
        const { handlers } = createContribution({
            selected: 'stuck-oauth',
            onStopServer: serverName => stopped.push(serverName),
            descriptions: {
                running: { name: 'running', command: 'node', status: MCPServerStatus.Running },
                'stuck-oauth': {
                    name: 'stuck-oauth', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: {}, status: MCPServerStatus.AuthenticationRequired
                }
            }
        });

        await handlers.get(StopMCPServer.id)!.execute();

        expect(stopped).to.deep.equal(['stuck-oauth']);
    });

    it('shows the no-running-servers message when no server is stoppable', async () => {
        let errorMessage: string | undefined;
        const { handlers } = createContribution({
            onError: message => errorMessage = message,
            descriptions: {
                idle: { name: 'idle', serverUrl: 'https://mcp.example.com/mcp', status: MCPServerStatus.NotConnected }
            }
        });

        await handlers.get(StopMCPServer.id)!.execute();

        expect(errorMessage).to.equal('No MCP servers running.');
    });

    describe('GetMCPOAuthRedirectUrl', () => {
        it('shows the effective OAuth redirect URL', async () => {
            let infoMessage: string | undefined;
            const { handlers } = createContribution({
                descriptions: {},
                effectiveRedirectUrl: 'https://theia.example.com/mcp/oauth/callback',
                onInfo: message => infoMessage = message
            });

            await handlers.get(GetMCPOAuthRedirectUrl.id)!.execute();

            expect(infoMessage).to.contain('https://theia.example.com/mcp/oauth/callback');
        });

        it('copies the redirect URL when the Copy action is chosen', async () => {
            const written: string[] = [];
            const navigatorWithClipboard = navigator as Navigator & { clipboard?: { writeText(text: string): Promise<void> } };
            const originalClipboard = navigatorWithClipboard.clipboard;
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: async (text: string) => { written.push(text); } },
                configurable: true
            });
            try {
                const { handlers } = createContribution({
                    descriptions: {},
                    effectiveRedirectUrl: 'https://theia.example.com/mcp/oauth/callback',
                    infoResult: 'Copy'
                });

                await handlers.get(GetMCPOAuthRedirectUrl.id)!.execute();
            } finally {
                Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
            }

            expect(written).to.deep.equal(['https://theia.example.com/mcp/oauth/callback']);
        });

        it('surfaces an error toast when the redirect URL cannot be determined', async () => {
            let errorMessage: string | undefined;
            const originalConsoleError = console.error;
            console.error = () => { };
            try {
                const { handlers } = createContribution({
                    descriptions: {},
                    onError: message => errorMessage = message
                });

                await handlers.get(GetMCPOAuthRedirectUrl.id)!.execute();
            } finally {
                console.error = originalConsoleError;
            }

            expect(errorMessage).to.contain('redirect URL');
        });
    });

    describe('reportStartOutcome', () => {
        function callReportStartOutcome(
            description: MCPServerDescription | undefined,
            captures: { info?: string, error?: string }
        ): void {
            const { contribution } = createContribution({
                descriptions: {},
                onInfo: message => captures.info = message,
                onError: message => captures.error = message
            });
            (contribution as unknown as {
                reportStartOutcome: (serverName: string, serverDescription: MCPServerDescription | undefined) => void;
            }).reportStartOutcome('test-server', description);
        }

        it('shows the success info with registered tool names when the server reaches Running', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', command: 'node',
                status: MCPServerStatus.Running,
                tools: [{ name: 'tool-one' }, { name: 'tool-two' }]
            }, captures);
            expect(captures.error).to.be.undefined;
            expect(captures.info).to.contain('test-server');
            expect(captures.info).to.contain('tool-one,tool-two');
        });

        it('shows a cancellation info toast when the server returns to NotConnected after OAuth cancel', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                status: MCPServerStatus.NotConnected, error: undefined
            }, captures);
            expect(captures.error).to.be.undefined;
            expect(captures.info).to.contain('sign-in was cancelled');
        });

        it('surfaces the authorization-server diagnostic when the server is AuthenticationRequired with an error', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                status: MCPServerStatus.AuthenticationRequired,
                error: 'Authorization server reported: access_denied'
            }, captures);
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.equal('Authorization server reported: access_denied');
        });

        it('falls back to a re-auth prompt when AuthenticationRequired carries no diagnostic', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                status: MCPServerStatus.AuthenticationRequired
            }, captures);
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.contain('requires authentication');
        });

        it('keeps the generic failure toast for unexpected error states', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                status: MCPServerStatus.Errored, error: 'transport refused'
            }, captures);
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.contain('error occurred');
        });

        it('suppresses the generic failure toast when the server is still Starting/Connecting on return', () => {
            const captures: { info?: string, error?: string } = {};
            callReportStartOutcome({
                name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                status: MCPServerStatus.Connecting
            }, captures);
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.be.undefined;
        });
    });

    describe('StartMCPServer pre-flight handling', () => {
        interface Captures {
            info: string[];
            error: string[];
            lifecycle: string[];
            getServerDescriptionCalls: number;
        }

        function buildStartContribution(
            servers: Record<string, MCPServerDescription>,
            startServerInteractiveResult: boolean,
            captures: Captures
        ): { contribution: MCPCommandContribution, handlers: Map<string, CommandHandler> } {
            const contribution = new MCPCommandContribution();
            const handlers = new Map<string, CommandHandler>();
            (contribution as unknown as { commandHandlerFactory: (handler: CommandHandler) => CommandHandler }).commandHandlerFactory = handler => handler;
            (contribution as unknown as { quickInputService: Partial<QuickInputService> }).quickInputService = {
                showQuickPick: async items => items[0] as never
            };
            (contribution as unknown as { messageService: Partial<MessageService> }).messageService = {
                info: message => { captures.info.push(String(message)); return Promise.resolve(); },
                error: message => { captures.error.push(String(message)); return Promise.resolve(); }
            };
            (contribution as unknown as { mcpFrontendService: Partial<MCPFrontendService> }).mcpFrontendService = {
                getServerNames: async () => Object.keys(servers),
                getStartedServers: async () => [],
                getServerDescription: async name => { captures.getServerDescriptionCalls++; return servers[name]; },
                stopServer: async name => { captures.lifecycle.push(`stop:${name}`); },
                startServerInteractive: async name => { captures.lifecycle.push(`start:${name}`); return startServerInteractiveResult; }
            };
            contribution.registerCommands({
                registerCommand: (command: Command, handler: CommandHandler) => {
                    handlers.set(command.id, handler);
                    return { dispose: () => { } };
                }
            } as unknown as CommandRegistry);
            return { contribution, handlers };
        }

        it('skips reportStartOutcome when startServerInteractive returns false (pre-flight failed)', async () => {
            // Trust-blocked paths in `startServerInteractive` show their own toast and return false. The
            // command must not then probe status and emit a contradictory "sign-in cancelled" toast just
            // because status is still NotConnected.
            const captures: Captures = { info: [], error: [], lifecycle: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: {}, status: MCPServerStatus.NotConnected
                }
            }, false, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.info).to.deep.equal([]);
            expect(captures.error).to.deep.equal([]);
            // Only the pre-start stuck-state check ran; no outcome lookup after the pre-flight returned false.
            expect(captures.getServerDescriptionCalls).to.equal(1);
        });

        it('reports the outcome when startServerInteractive returns true (start attempted)', async () => {
            const captures: Captures = { info: [], error: [], lifecycle: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: {}, status: MCPServerStatus.Connected,
                    tools: [{ name: 'tool-one' }]
                }
            }, true, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.info).to.have.length(1);
            expect(captures.info[0]).to.contain('oauth-server');
            expect(captures.info[0]).to.contain('tool-one');
            // Two `getServerDescription` calls: the pre-start stuck-state check and the outcome lookup.
            expect(captures.getServerDescriptionCalls).to.equal(2);
            // The server was not stuck in AuthenticationRequired, so no stop ran before the start.
            expect(captures.lifecycle).to.deep.equal(['start:oauth-server']);
        });

        it('stops a server stuck in AuthenticationRequired before restarting it', async () => {
            // A start in `AuthenticationRequired` would join the pending OAuth flow and change nothing -
            // the user who closed the authorization browser window would be stuck in that state forever.
            const captures: Captures = { info: [], error: [], lifecycle: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: {}, status: MCPServerStatus.AuthenticationRequired
                }
            }, true, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.lifecycle).to.deep.equal(['stop:oauth-server', 'start:oauth-server']);
        });

        it('does not pre-fetch descriptions before the quick-pick (no popup preparation needed)', async () => {
            // OAuth gating happens in the backend via the `interactive` flag, so the command palette does
            // not need to inspect descriptions before the quick-pick. Only the selected server is looked up
            // (stuck-state check before the start, outcome reporting after it).
            const captures: Captures = { info: [], error: [], lifecycle: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'local-stdio-server': { name: 'local-stdio-server', command: 'node', status: MCPServerStatus.Running },
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: {}, status: MCPServerStatus.Connected, tools: []
                }
            }, true, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            // Only the selected server is inspected (stuck-state check + outcome lookup), never the full list.
            expect(captures.getServerDescriptionCalls).to.equal(2);
        });
    });
});
