// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import 'reflect-metadata';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { MessageService, PreferenceService, ILogger } from '@theia/core';
import { McpFrontendApplicationContribution } from './mcp-frontend-application-contribution';
import { MCPFrontendService, MCPOAuthFrontendDelegate, MCPServerDescription, MCPServerManager, MCPServersPreference, MCPServerStatus } from '../common';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

disableJSDOM();

type TestableContribution = McpFrontendApplicationContribution & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleServerChanges(newServers: any): Promise<void>;
    prevServers: Map<string, MCPServerDescription>;
    blockedUntrustedServers: Set<string>;
};

interface MockFrontendMCPService {
    startServer: sinon.SinonStub;
    stopServer: sinon.SinonStub;
    hasServer: sinon.SinonStub;
    isServerStarted: sinon.SinonStub;
    registerToolsForAllStartedServers: sinon.SinonStub;
    addOrUpdateServer: sinon.SinonStub;
    getStartedServers: sinon.SinonStub;
    getServerNames: sinon.SinonStub;
    getServerDescription: sinon.SinonStub;
    getTools: sinon.SinonStub;
    getPromptTemplateId: sinon.SinonStub;
}

interface MockMCPServerManager {
    callTool: sinon.SinonStub;
    removeServer: sinon.SinonStub;
    addOrUpdateServer: sinon.SinonStub;
    getTools: sinon.SinonStub;
    getServerNames: sinon.SinonStub;
    getServerDescription: sinon.SinonStub;
    startServer: sinon.SinonStub;
    stopServer: sinon.SinonStub;
    getRunningServers: sinon.SinonStub;
    setClient: sinon.SinonStub;
    disconnectClient: sinon.SinonStub;
    readResource: sinon.SinonStub;
    getResources: sinon.SinonStub;
    setWorkspaceRoots: sinon.SinonStub;
}

describe('McpFrontendApplicationContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let contribution: TestableContribution;
    let mockFrontendMCPService: MockFrontendMCPService;
    let mockManager: MockMCPServerManager;

    beforeEach(() => {
        const container = new Container();

        mockFrontendMCPService = {
            startServer: sinon.stub().resolves(),
            stopServer: sinon.stub().resolves(),
            hasServer: sinon.stub().resolves(false),
            isServerStarted: sinon.stub().resolves(false),
            registerToolsForAllStartedServers: sinon.stub().resolves(),
            addOrUpdateServer: sinon.stub().resolves(),
            getStartedServers: sinon.stub().resolves([]),
            getServerNames: sinon.stub().resolves([]),
            getServerDescription: sinon.stub().resolves(undefined),
            getTools: sinon.stub().resolves(undefined),
            getPromptTemplateId: sinon.stub().returns(''),
        };

        mockManager = {
            callTool: sinon.stub().resolves({ content: [] }),
            removeServer: sinon.stub().resolves(),
            addOrUpdateServer: sinon.stub().resolves(),
            getTools: sinon.stub().resolves({ tools: [] }),
            getServerNames: sinon.stub().resolves([]),
            getServerDescription: sinon.stub().resolves(undefined),
            startServer: sinon.stub().resolves(),
            stopServer: sinon.stub().resolves(),
            getRunningServers: sinon.stub().resolves([]),
            setClient: sinon.stub(),
            disconnectClient: sinon.stub(),
            readResource: sinon.stub().resolves({ contents: [] }),
            getResources: sinon.stub().resolves({ resources: [] }),
            setWorkspaceRoots: sinon.stub(),
        };

        const mockPreferenceService = {
            ready: Promise.resolve(),
            get: sinon.stub().returns({}),
            onPreferenceChanged: sinon.stub().returns({ dispose: () => { } }),
        };

        const mockWorkspaceTrustService = {
            getWorkspaceTrust: sinon.stub().resolves(true),
            onDidChangeWorkspaceTrust: sinon.stub().returns({ dispose: () => { } }),
            refreshRestrictedModeIndicator: sinon.stub(),
        };

        const mockWorkspaceService = {
            tryGetRoots: sinon.stub().returns([]),
            onWorkspaceChanged: sinon.stub().returns({ dispose: () => { } }),
        };

        const mockMessageService = {
            warn: sinon.stub().resolves(undefined),
            error: sinon.stub().resolves(undefined),
            info: sinon.stub().resolves(undefined),
        };

        container.bind(McpFrontendApplicationContribution).toSelf().inSingletonScope();
        container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
        container.bind(MCPServerManager).toConstantValue(mockManager as unknown as MCPServerManager);
        container.bind(MCPFrontendService).toConstantValue(mockFrontendMCPService as unknown as MCPFrontendService);
        container.bind(WorkspaceTrustService).toConstantValue(mockWorkspaceTrustService as unknown as WorkspaceTrustService);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService as unknown as WorkspaceService);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(MessageService).toConstantValue(mockMessageService as unknown as MessageService);
        container.bind(MCPOAuthFrontendDelegate).toConstantValue({
            getCallbackUrl: () => Promise.resolve('')
        } as unknown as MCPOAuthFrontendDelegate);

        contribution = container.get<McpFrontendApplicationContribution>(McpFrontendApplicationContribution) as TestableContribution;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('handleServerChanges', () => {

        it('removes a server via the manager when it is no longer configured', async () => {
            // The OAuth work made `MCPServerManager.removeServer` perform the full lifecycle teardown
            // (stop + credential cleanup), so the contribution no longer calls `stopServer` separately.
            contribution.prevServers = new Map([
                ['test-server', { name: 'test-server', command: 'node', args: ['server.js'], autostart: true }]
            ]);

            await contribution.handleServerChanges({});

            expect(mockManager.removeServer.calledOnce).to.be.true;
            expect(mockManager.removeServer.calledWith('test-server')).to.be.true;
        });

        it('removes each server that is no longer configured via the manager', async () => {
            contribution.prevServers = new Map([
                ['server-a', { name: 'server-a', command: 'node', args: ['a.js'], autostart: false }],
                ['server-b', { name: 'server-b', serverUrl: 'http://example.com', autostart: false }],
                ['server-c', { name: 'server-c', command: 'node', args: ['c.js'], autostart: false }]
            ]);

            // Only server-b remains
            await contribution.handleServerChanges({
                'server-b': { serverUrl: 'http://example.com' }
            });

            expect(mockManager.removeServer.calledWith('server-a')).to.be.true;
            expect(mockManager.removeServer.calledWith('server-c')).to.be.true;
            expect(mockManager.removeServer.calledWith('server-b')).to.be.false;
        });

        it('does not call stopServer or removeServer when no servers are removed', async () => {
            contribution.prevServers = new Map([
                ['existing-server', { name: 'existing-server', command: 'node', autostart: true }]
            ]);

            await contribution.handleServerChanges({
                'existing-server': { command: 'node' }
            });

            expect(mockFrontendMCPService.stopServer.called).to.be.false;
            expect(mockManager.removeServer.called).to.be.false;
        });

        it('calls addOrUpdateServer for new servers', async () => {
            contribution.prevServers = new Map();

            await contribution.handleServerChanges({
                'new-server': { command: 'node', args: ['server.js'] }
            });

            expect(mockManager.addOrUpdateServer.calledOnce).to.be.true;
            const addedServer = mockManager.addOrUpdateServer.firstCall.args[0];
            expect(addedServer.name).to.equal('new-server');
        });

        it('calls addOrUpdateServer for updated servers', async () => {
            contribution.prevServers = new Map([
                ['my-server', { name: 'my-server', command: 'node', args: ['old.js'], autostart: true }]
            ]);

            await contribution.handleServerChanges({
                'my-server': { command: 'node', args: ['new.js'] }
            });

            expect(mockFrontendMCPService.stopServer.called).to.be.false;
            expect(mockManager.removeServer.called).to.be.false;
            expect(mockManager.addOrUpdateServer.calledOnce).to.be.true;
        });

        it('clears blockedUntrustedServers entry when a server is removed', async () => {
            contribution.prevServers = new Map([
                ['blocked-server', { name: 'blocked-server', command: 'node', autostart: true }]
            ]);
            // Simulate the server having been blocked
            contribution.blockedUntrustedServers.add('blocked-server');

            await contribution.handleServerChanges({});

            expect(contribution.blockedUntrustedServers.has('blocked-server')).to.be.false;
        });

        it('updates prevServers after handling changes', async () => {
            contribution.prevServers = new Map([
                ['old-server', { name: 'old-server', command: 'node', autostart: true }]
            ]);

            await contribution.handleServerChanges({
                'new-server': { command: 'python', args: ['serve.py'] }
            });

            expect(contribution.prevServers.has('old-server')).to.be.false;
            expect(contribution.prevServers.has('new-server')).to.be.true;
        });
    });
});

describe('McpFrontendApplicationContribution workspace-trust handlers', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    function createContribution(options: {
        runningServers?: string[];
        activeServers?: string[];
        hasStoredOAuthCredentials?: (name: string) => boolean;
        // Post-start status keyed by name; defaults to undefined which the post-start check treats as
        // 'no description' and skips the OAuth-required notification.
        postStartStatus?: Record<string, MCPServerStatus | undefined>;
        prevServers?: MCPServerDescription[];
        blockedServers?: string[];
        onStop?: (name: string) => void;
        onStart?: (name: string) => void;
        // Captures invocations of `messageService.warn` so tests can assert the user was prompted for
        // OAuth sign-in on autostart failure.
        onWarn?: (message: string, ...actions: string[]) => string | undefined;
    }): TestMcpFrontendApplicationContribution {
        const contribution = new TestMcpFrontendApplicationContribution();
        const runningServers = [...(options.runningServers ?? [])];
        // Default active set = running set. Tests that exercise in-flight (Starting/Connecting/
        // AuthenticationRequired) behavior pass `activeServers` explicitly.
        const activeServers = [...(options.activeServers ?? options.runningServers ?? [])];
        const prev = new Map<string, MCPServerDescription>();
        for (const desc of options.prevServers ?? []) {
            prev.set(desc.name, desc);
        }
        (contribution as unknown as { frontendMCPService: Partial<MCPFrontendService> }).frontendMCPService = {
            getStartedServers: async () => [...runningServers],
            getActiveServers: async () => [...activeServers],
            stopServer: async (name: string) => {
                options.onStop?.(name);
                const runningIndex = runningServers.indexOf(name);
                if (runningIndex >= 0) {
                    runningServers.splice(runningIndex, 1);
                }
                const activeIndex = activeServers.indexOf(name);
                if (activeIndex >= 0) {
                    activeServers.splice(activeIndex, 1);
                }
            },
            startServer: async (name: string) => {
                options.onStart?.(name);
                runningServers.push(name);
                if (!activeServers.includes(name)) {
                    activeServers.push(name);
                }
            },
            startServerInteractive: async () => true,
            hasStoredOAuthCredentials: async name => options.hasStoredOAuthCredentials?.(name) ?? false,
            // Returns the prev description merged with the test-configured post-start status so the
            // contribution's AuthenticationRequired check can fire when configured.
            getServerDescription: async name => {
                const baseDescription = prev.get(name);
                if (!baseDescription) {
                    return undefined;
                }
                return { ...baseDescription, status: options.postStartStatus?.[name] };
            }
        };
        (contribution as unknown as { workspaceTrustService: Partial<WorkspaceTrustService> }).workspaceTrustService = {
            refreshRestrictedModeIndicator: () => { /* tracked via override */ }
        };
        (contribution as unknown as { messageService: MessageService }).messageService = {
            // The MessageService.warn overload accepts `(message, ...actions)` or `(message, options, ...actions)`.
            // The contribution uses the former; this mock matches that calling convention by treating all
            // varargs as action labels.
            warn: ((message: string, ...rest: unknown[]) =>
                Promise.resolve(options.onWarn?.(String(message), ...rest.filter((arg): arg is string => typeof arg === 'string'))))
        } as unknown as MessageService;
        contribution.setPrevServers(prev);
        contribution.setBlockedServers(options.blockedServers ?? []);
        return contribution;
    }

    describe('stopAllServers', () => {
        it('stops only currently running servers and tracks autostart servers as blocked', async () => {
            const stopped: string[] = [];
            const contribution = createContribution({
                runningServers: ['running-autostart', 'running-manual'],
                prevServers: [
                    { name: 'running-autostart', command: 'node', autostart: true },
                    { name: 'running-manual', command: 'node', autostart: false },
                    // A manually-started, non-running, non-autostart server stays stopped on re-trust by design.
                    { name: 'idle', command: 'node', autostart: false }
                ],
                onStop: name => stopped.push(name)
            });

            await contribution.testStopAllServers();

            expect(stopped).to.have.members(['running-autostart', 'running-manual']);
            // Only the running autostart server is queued for restart on re-trust.
            expect(contribution.getBlockedServers()).to.deep.equal(['running-autostart']);
            expect(contribution.refreshCalls).to.equal(1);
        });

        it('does nothing when no servers are running', async () => {
            const stopped: string[] = [];
            const contribution = createContribution({
                runningServers: [],
                prevServers: [
                    { name: 'idle-autostart', command: 'node', autostart: true }
                ],
                onStop: name => stopped.push(name)
            });

            await contribution.testStopAllServers();

            expect(stopped).to.deep.equal([]);
            expect(contribution.getBlockedServers()).to.deep.equal([]);
        });

        it('interrupts in-flight (Starting / Connecting / AuthenticationRequired) servers when trust is lost', async () => {
            // A server whose lifecycle is between Starting and Connected at the moment trust is lost must
            // be stopped: otherwise the SDK can finish authorization in the now-untrusted workspace and
            // transition the server into Connected, contradicting the upfront trust gate in
            // `startServerInteractive`. `MCPServerManagerImpl.stopServer` cancels OAuth state before
            // awaiting `server.stop()`, so this also rejects a pending `waitForCallback`.
            const stopped: string[] = [];
            const contribution = createContribution({
                runningServers: ['running-autostart'],
                activeServers: ['running-autostart', 'oauth-in-flight', 'local-starting'],
                prevServers: [
                    { name: 'running-autostart', command: 'node', autostart: true },
                    { name: 'oauth-in-flight', serverUrl: 'https://mcp.example.com/mcp', autostart: true, oauth: { enabled: true } },
                    { name: 'local-starting', command: 'node', autostart: false }
                ],
                onStop: name => stopped.push(name)
            });

            await contribution.testStopAllServers();

            // All three active servers are stopped, regardless of whether they had reached Running.
            expect(stopped).to.have.members(['running-autostart', 'oauth-in-flight', 'local-starting']);
            // Only autostart servers are queued for restart on re-trust; the in-flight OAuth server is included
            // because its description has autostart=true. local-starting is a manual start and stays stopped.
            expect(contribution.getBlockedServers()).to.have.members(['running-autostart', 'oauth-in-flight']);
        });
    });

    describe('enqueueServerChanges', () => {
        it('surfaces preference-change failures via the message service and keeps the queue healthy', async () => {
            // Without messageService.warn, a failed preference apply only writes to console.error and the
            // user has no UI signal that their edit did not land. The queue must also stay healthy so a
            // subsequent successful edit applies; pinning both invariants here.
            const originalConsoleError = console.error;
            console.error = () => { /* suppress expected diagnostic */ };
            try {
                const contribution = new TestMcpFrontendApplicationContribution();
                const warnings: string[] = [];
                (contribution as unknown as { messageService: Partial<MessageService> }).messageService = {
                    warn: async (message: string) => { warnings.push(message); return undefined; }
                };
                let addCallCount = 0;
                (contribution as unknown as { manager: Partial<MCPServerManager> }).manager = {
                    addOrUpdateServer: async () => {
                        addCallCount++;
                        if (addCallCount === 1) {
                            throw new Error('first apply fails');
                        }
                    },
                    removeServer: async () => { /* not used */ }
                };
                (contribution as unknown as { frontendMCPService: Partial<MCPFrontendService> }).frontendMCPService = {
                    getStartedServers: async () => []
                };
                (contribution as unknown as { workspaceTrustService: Partial<WorkspaceTrustService> }).workspaceTrustService = {
                    getWorkspaceTrust: async () => true,
                    refreshRestrictedModeIndicator: () => { /* tracked elsewhere */ }
                };

                await contribution.testEnqueueServerChanges({ asana: { command: 'node' } });

                expect(warnings).to.have.length(1);
                expect(warnings[0]).to.contain('first apply fails');

                // Queue still healthy: a second enqueue applies (addCallCount increments to 2 without throwing).
                await contribution.testEnqueueServerChanges({ asana: { command: 'node' } });
                expect(addCallCount).to.equal(2);
            } finally {
                console.error = originalConsoleError;
            }
        });
    });

    describe('startPreviouslyBlockedServers', () => {
        it('is a no-op when nothing is blocked', async () => {
            const started: string[] = [];
            const contribution = createContribution({ onStart: name => started.push(name) });

            await contribution.testStartPreviouslyBlockedServers();

            expect(started).to.deep.equal([]);
            // Status bar refresh is skipped on the early-return path because nothing changed.
            expect(contribution.refreshCalls).to.equal(0);
        });

        it('restarts blocked autostart servers and clears the blocked set', async () => {
            const started: string[] = [];
            const contribution = createContribution({
                prevServers: [
                    { name: 'autostart-server', command: 'node', autostart: true }
                ],
                blockedServers: ['autostart-server'],
                onStart: name => started.push(name)
            });

            await contribution.testStartPreviouslyBlockedServers();

            expect(started).to.deep.equal(['autostart-server']);
            expect(contribution.getBlockedServers()).to.deep.equal([]);
            expect(contribution.refreshCalls).to.equal(1);
        });

        it('does not restart blocked servers whose autostart was disabled in the meantime', async () => {
            const started: string[] = [];
            const contribution = createContribution({
                prevServers: [
                    { name: 'changed-autostart', command: 'node', autostart: false }
                ],
                blockedServers: ['changed-autostart'],
                onStart: name => started.push(name)
            });

            await contribution.testStartPreviouslyBlockedServers();

            expect(started).to.deep.equal([]);
            // The blocked set is still cleared so the indicator refreshes correctly.
            expect(contribution.getBlockedServers()).to.deep.equal([]);
        });

        it('skips the silent start AND prompts the user to sign in when an OAuth-enabled server has no stored credentials', async () => {
            // Without stored credentials the silent start would just hit `redirectToAuthorization` and be
            // rejected by the non-interactive provider. The contribution skips the round-trip and prompts
            // the user directly via `messageService.warn` with a Sign In action.
            const started: string[] = [];
            const warnings: Array<{ message: string, actions: string[] }> = [];
            const contribution = createContribution({
                prevServers: [
                    { name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp', autostart: true, oauth: { enabled: true } }
                ],
                blockedServers: ['oauth-server'],
                hasStoredOAuthCredentials: () => false,
                onStart: name => started.push(name),
                onWarn: (message: string, ...actions: string[]) => {
                    warnings.push({ message, actions });
                    return undefined;
                }
            });

            await contribution.testStartPreviouslyBlockedServers();

            expect(started).to.deep.equal([]);
            expect(contribution.getBlockedServers()).to.deep.equal([]);
            expect(warnings).to.have.length(1);
            expect(warnings[0].message).to.contain('oauth-server');
            expect(warnings[0].actions).to.have.length(1);
            expect(warnings[0].actions[0].toLowerCase()).to.contain('sign in');
        });

        it('attempts the silent start when an OAuth-enabled server has stored credentials', async () => {
            const started: string[] = [];
            const contribution = createContribution({
                prevServers: [
                    { name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp', autostart: true, oauth: { enabled: true } }
                ],
                blockedServers: ['oauth-server'],
                hasStoredOAuthCredentials: name => name === 'oauth-server',
                // Post-start status reaches Connected (refresh succeeded). No notification.
                postStartStatus: { 'oauth-server': MCPServerStatus.Connected },
                onStart: name => started.push(name)
            });

            await contribution.testStartPreviouslyBlockedServers();

            expect(started).to.deep.equal(['oauth-server']);
        });

        it('prompts the user to sign in when the silent start lands in AuthenticationRequired (refresh failed)', async () => {
            // Stored credentials existed but refresh failed; the silent attempt routes through the
            // non-interactive provider which rejects authorization, leaving the server in
            // AuthenticationRequired. The contribution detects this and prompts the user.
            const started: string[] = [];
            const warnings: Array<{ message: string }> = [];
            const contribution = createContribution({
                prevServers: [
                    { name: 'oauth-server', serverUrl: 'https://mcp.example.com/mcp', autostart: true, oauth: { enabled: true } }
                ],
                blockedServers: ['oauth-server'],
                hasStoredOAuthCredentials: name => name === 'oauth-server',
                postStartStatus: { 'oauth-server': MCPServerStatus.AuthenticationRequired },
                onStart: name => started.push(name),
                onWarn: (message: string) => { warnings.push({ message }); return undefined; }
            });

            await contribution.testStartPreviouslyBlockedServers();

            // Silent start was attempted (credentials present), then prompted because it failed.
            expect(started).to.deep.equal(['oauth-server']);
            expect(warnings).to.have.length(1);
            expect(warnings[0].message).to.contain('oauth-server');
        });
    });
});

class TestMcpFrontendApplicationContribution extends McpFrontendApplicationContribution {
    refreshCalls = 0;

    setPrevServers(servers: Map<string, MCPServerDescription>): void {
        this.prevServers = servers;
    }

    setBlockedServers(names: string[]): void {
        this.blockedUntrustedServers = new Set(names);
    }

    getBlockedServers(): string[] {
        return Array.from(this.blockedUntrustedServers);
    }

    testStopAllServers(): Promise<void> {
        return this.stopAllServers();
    }

    testStartPreviouslyBlockedServers(): Promise<void> {
        return this.startPreviouslyBlockedServers();
    }

    testEnqueueServerChanges(newServers: MCPServersPreference): Promise<void> {
        this.enqueueServerChanges(newServers);
        return this.serverChangeQueue;
    }

    protected override updateBlockedServersStatusBar(): void {
        this.refreshCalls++;
    }
}
