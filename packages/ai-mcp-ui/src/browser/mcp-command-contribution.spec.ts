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
import { Command, CommandHandler, CommandRegistry, MessageService } from '@theia/core';
import { QuickInputService } from '@theia/core/lib/browser';
import { MCPFrontendService, MCPServerDescription, MCPServerStatus } from '@theia/ai-mcp';
import { MCPCommandContribution, SignOutMCPServer, StartMCPServer } from './mcp-command-contribution';

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
        onError?: (message: string) => void;
        onInfo?: (message: string) => void;
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
            info: message => { options.onInfo?.(String(message)); return Promise.resolve(); }
        };
        (contribution as unknown as { mcpFrontendService: Partial<MCPFrontendService> }).mcpFrontendService = {
            getServerNames: async () => Object.keys(options.descriptions),
            getServerDescription: async name => options.descriptions[name],
            hasStoredOAuthCredentials: async serverName => options.hasStoredOAuthCredentials?.(serverName) ?? false,
            signOut: async serverName => options.onSignOut?.(serverName)
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
                'oauth-remote': { name: 'oauth-remote', serverUrl: 'https://mcp.example.com/mcp', oauth: { enabled: true } }
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
                    oauth: { enabled: true }
                }
            }
        });

        await handlers.get(SignOutMCPServer.id)!.execute();

        expect(signedOutServer).to.equal('oauth-server-without-current-scope-creds');
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
            const originalConsoleError = console.error;
            console.error = () => { };
            try {
                callReportStartOutcome({
                    name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                    status: MCPServerStatus.Errored, error: 'transport refused'
                }, captures);
            } finally {
                console.error = originalConsoleError;
            }
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.contain('error occurred');
        });

        it('suppresses the generic failure toast when the server is still Starting/Connecting on return', () => {
            const captures: { info?: string, error?: string } = {};
            const originalConsoleWarn = console.warn;
            console.warn = () => { };
            try {
                callReportStartOutcome({
                    name: 'test-server', serverUrl: 'https://mcp.example.com/mcp',
                    status: MCPServerStatus.Connecting
                }, captures);
            } finally {
                console.warn = originalConsoleWarn;
            }
            expect(captures.info).to.be.undefined;
            expect(captures.error).to.be.undefined;
        });
    });

    describe('StartMCPServer pre-flight handling', () => {
        interface Captures {
            info: string[];
            error: string[];
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
                startServerInteractive: async () => startServerInteractiveResult
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
            const captures: Captures = { info: [], error: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: { enabled: true }, status: MCPServerStatus.NotConnected
                }
            }, false, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.info).to.deep.equal([]);
            expect(captures.error).to.deep.equal([]);
            // No follow-up `getServerDescription` call after the pre-flight check returned false.
            expect(captures.getServerDescriptionCalls).to.equal(0);
        });

        it('reports the outcome when startServerInteractive returns true (start attempted)', async () => {
            const captures: Captures = { info: [], error: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: { enabled: true }, status: MCPServerStatus.Connected,
                    tools: [{ name: 'tool-one' }]
                }
            }, true, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.info).to.have.length(1);
            expect(captures.info[0]).to.contain('oauth-server');
            expect(captures.info[0]).to.contain('tool-one');
            // One `getServerDescription` call: outcome reporting after the start.
            expect(captures.getServerDescriptionCalls).to.equal(1);
        });

        it('does not pre-fetch descriptions before the quick-pick (no popup preparation needed)', async () => {
            // OAuth gating happens in the backend via the `interactive` flag, so the command palette does
            // not need to inspect descriptions before the quick-pick. Only the post-start outcome lookup
            // calls `getServerDescription`.
            const captures: Captures = { info: [], error: [], getServerDescriptionCalls: 0 };
            const { handlers } = buildStartContribution({
                'local-stdio-server': { name: 'local-stdio-server', command: 'node', status: MCPServerStatus.Running },
                'oauth-server': {
                    name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp',
                    oauth: { enabled: true }, status: MCPServerStatus.Connected, tools: []
                }
            }, true, captures);

            await handlers.get(StartMCPServer.id)!.execute();

            expect(captures.getServerDescriptionCalls).to.equal(1);
        });
    });
});
