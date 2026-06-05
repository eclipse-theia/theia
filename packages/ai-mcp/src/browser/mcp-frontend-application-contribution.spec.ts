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
import { Container } from 'inversify';
import { PreferenceService } from '@theia/core';
import { McpFrontendApplicationContribution } from './mcp-frontend-application-contribution';
import { MCPServerDescription, MCPServerManager } from '../common';
import { MCPFrontendService } from '../common/mcp-server-manager';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

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
            removeServer: sinon.stub(),
            addOrUpdateServer: sinon.stub(),
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

        container.bind(McpFrontendApplicationContribution).toSelf().inSingletonScope();
        container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
        container.bind(MCPServerManager).toConstantValue(mockManager as unknown as MCPServerManager);
        container.bind(MCPFrontendService).toConstantValue(mockFrontendMCPService as unknown as MCPFrontendService);
        container.bind(WorkspaceTrustService).toConstantValue(mockWorkspaceTrustService as unknown as WorkspaceTrustService);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService as unknown as WorkspaceService);

        contribution = container.get<McpFrontendApplicationContribution>(McpFrontendApplicationContribution) as TestableContribution;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('handleServerChanges', () => {

        it('calls stopServer before removeServer when a server is removed', async () => {
            const callOrder: string[] = [];
            mockFrontendMCPService.stopServer.callsFake(async () => { callOrder.push('stopServer'); });
            mockManager.removeServer.callsFake(() => { callOrder.push('removeServer'); });

            contribution.prevServers = new Map([
                ['test-server', { name: 'test-server', command: 'node', args: ['server.js'], autostart: true }]
            ]);

            await contribution.handleServerChanges({});

            expect(mockFrontendMCPService.stopServer.calledOnce).to.be.true;
            expect(mockFrontendMCPService.stopServer.calledWith('test-server')).to.be.true;
            expect(mockManager.removeServer.calledOnce).to.be.true;
            expect(mockManager.removeServer.calledWith('test-server')).to.be.true;
            expect(callOrder).to.deep.equal(['stopServer', 'removeServer']);
        });

        it('calls stopServer and removeServer for each removed server', async () => {
            contribution.prevServers = new Map([
                ['server-a', { name: 'server-a', command: 'node', args: ['a.js'], autostart: false }],
                ['server-b', { name: 'server-b', serverUrl: 'http://example.com', autostart: false }],
                ['server-c', { name: 'server-c', command: 'node', args: ['c.js'], autostart: false }]
            ]);

            // Only server-b remains
            await contribution.handleServerChanges({
                'server-b': { serverUrl: 'http://example.com' }
            });

            expect(mockFrontendMCPService.stopServer.calledWith('server-a')).to.be.true;
            expect(mockFrontendMCPService.stopServer.calledWith('server-c')).to.be.true;
            expect(mockFrontendMCPService.stopServer.calledWith('server-b')).to.be.false;

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
