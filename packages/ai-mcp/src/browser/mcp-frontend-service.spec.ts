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
import { MessageService } from '@theia/core';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { PromptService, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { MCPServerDescription, MCPServerManager, MCPServerStatus } from '../common/mcp-server-manager';
import type { MCPFrontendServiceImpl } from './mcp-frontend-service';
const MCPFrontendServiceImplConstructor: new () => MCPFrontendServiceImpl = require('./mcp-frontend-service').MCPFrontendServiceImpl;

disableJSDOM();

class TestToolInvocationRegistry implements Partial<ToolInvocationRegistry> {
    readonly registered: ToolRequest[] = [];
    readonly unregisteredProviders: string[] = [];

    registerTool(tool: ToolRequest): void {
        this.registered.push(tool);
    }

    unregisterAllTools(providerName: string): void {
        this.unregisteredProviders.push(providerName);
    }
}

class TestPromptService implements Partial<PromptService> {
    readonly added: string[] = [];
    readonly removed: string[] = [];

    addBuiltInPromptFragment(fragment: { id: string }): void {
        this.added.push(fragment.id);
    }

    removePromptFragment(id: string): void {
        this.removed.push(id);
    }
}

describe('MCPFrontendServiceImpl', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    let service: MCPFrontendServiceImpl;
    let toolRegistry: TestToolInvocationRegistry;
    let promptService: TestPromptService;

    beforeEach(() => {
        service = new MCPFrontendServiceImplConstructor();
        toolRegistry = new TestToolInvocationRegistry();
        promptService = new TestPromptService();
        (service as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = toolRegistry as unknown as ToolInvocationRegistry;
        (service as unknown as { promptService: PromptService }).promptService = promptService as unknown as PromptService;
        (service as unknown as { mcpServerManager: Partial<MCPServerManager> }).mcpServerManager = {
            startServer: async () => { },
            getServerDescription: async () => ({ name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: {} }),
            hasStoredOAuthCredentials: async () => false,
            getTools: async () => ({
                tools: [{
                    name: 'create_project_confirm',
                    description: 'Create project',
                    inputSchema: { type: 'object', properties: {} }
                }]
            })
        };
    });

    it('starts the server and registers tools', async () => {
        await service.startServer('asana');

        expect(toolRegistry.registered.map(tool => tool.id)).to.deep.equal(['mcp_asana_create_project_confirm']);
    });

    it('unregisters existing server tools before registering current tools', async () => {
        await service.registerTools('asana');
        await service.registerTools('asana');

        expect(toolRegistry.unregisteredProviders).to.deep.equal(['mcp_asana', 'mcp_asana']);
        expect(promptService.removed).to.deep.equal(['mcp_asana_tools', 'mcp_asana_tools']);
        expect(toolRegistry.registered.map(tool => tool.id)).to.deep.equal([
            'mcp_asana_create_project_confirm',
            'mcp_asana_create_project_confirm'
        ]);
    });

    describe('startServerInteractive', () => {
        // Pinning test for the widget Connect button → service → manager chain: the previous design
        // routed an explicit `preparedAuthorizationWindow=true` argument through `startServerInteractive`
        // and silently no-op'd for OAuth servers when the argument defaulted to false (the widget could
        // forget to thread it). The current design replaces that argument with the manager option
        // `{ interactive: true }` that the service ALWAYS passes — there is no way for a caller of
        // `startServerInteractive(name)` to accidentally invoke the non-interactive path. This test pins
        // that invariant so a future refactor can't reintroduce the silent-no-op regression.
        function buildServiceWithCapturingManager(
            captures: { startServerCalls: Array<{ name: string, options?: { interactive?: boolean } }> },
            options: { workspaceTrusted?: boolean, errorMessages?: string[] } = {}
        ): MCPFrontendServiceImpl {
            const target = new MCPFrontendServiceImplConstructor();
            (target as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = toolRegistry as unknown as ToolInvocationRegistry;
            (target as unknown as { promptService: PromptService }).promptService = promptService as unknown as PromptService;
            (target as unknown as { mcpServerManager: Partial<MCPServerManager> }).mcpServerManager = {
                startServer: async (name: string, opts?: { interactive?: boolean }) => {
                    captures.startServerCalls.push({ name, options: opts });
                },
                getServerDescription: async () => ({
                    name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: {}
                }),
                getTools: async () => ({ tools: [] })
            };
            (target as unknown as { workspaceTrustService: Partial<WorkspaceTrustService> }).workspaceTrustService = {
                getWorkspaceTrust: async () => options.workspaceTrusted ?? true
            };
            (target as unknown as { messageService: MessageService }).messageService = {
                error: ((message: string) => { options.errorMessages?.push(String(message)); return Promise.resolve(); })
            } as unknown as MessageService;
            return target;
        }

        it('passes { interactive: true } to the manager for an OAuth-enabled server in a trusted workspace', async () => {
            // The widget's Connect button and the command-palette Start command both call
            // `startServerInteractive(name)` with no second argument. The service MUST always pass
            // `interactive: true` to the manager so the OAuth provider permits `redirectToAuthorization`
            // to launch the browser. The previous design relied on a `preparedAuthorizationWindow` boolean
            // argument from the caller; if the widget forgot to thread it (or it defaulted to false), the
            // service silently no-op'd for OAuth servers — a real bug fixed by anchoring the flag in the
            // service instead.
            const captures = { startServerCalls: [] as Array<{ name: string, options?: { interactive?: boolean } }> };
            const target = buildServiceWithCapturingManager(captures);

            const result = await target.startServerInteractive('asana');

            expect(result).to.be.true;
            expect(captures.startServerCalls).to.deep.equal([{ name: 'asana', options: { interactive: true } }]);
        });

        it('returns false and surfaces an error toast when OAuth is required but workspace is untrusted', async () => {
            // The single early-return in `startServerInteractive` is the trust check; verify it produces
            // a user-visible diagnostic so the widget Connect click does not silently no-op.
            const captures = { startServerCalls: [] as Array<{ name: string, options?: { interactive?: boolean } }> };
            const errorMessages: string[] = [];
            const target = buildServiceWithCapturingManager(captures, { workspaceTrusted: false, errorMessages });

            const result = await target.startServerInteractive('asana');

            expect(result).to.be.false;
            expect(captures.startServerCalls).to.deep.equal([]);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0]).to.contain('trusted workspace');
        });
    });

    describe('signIn', () => {
        const OAUTH_DESCRIPTION: MCPServerDescription = { name: 'asana', serverUrl: 'https://mcp.example.com/mcp', oauth: {} };

        function buildSignInService(options: {
            description?: MCPServerDescription,
            afterStartStatus?: MCPServerStatus,
            workspaceTrusted?: boolean,
            errorMessages?: string[]
        }): { target: MCPFrontendServiceImpl, calls: string[] } {
            const calls: string[] = [];
            const target = new MCPFrontendServiceImplConstructor();
            (target as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = toolRegistry as unknown as ToolInvocationRegistry;
            (target as unknown as { promptService: PromptService }).promptService = promptService as unknown as PromptService;
            let started = false;
            (target as unknown as { mcpServerManager: Partial<MCPServerManager> }).mcpServerManager = {
                stopServer: async (name: string) => { calls.push(`stop:${name}`); },
                startServer: async (name: string, opts?: { interactive?: boolean }) => {
                    started = true;
                    calls.push(`start:${name}:${String(!!opts?.interactive)}`);
                },
                getServerDescription: async () => started && options.description
                    ? { ...options.description, status: options.afterStartStatus }
                    : options.description
            };
            (target as unknown as { workspaceTrustService: Partial<WorkspaceTrustService> }).workspaceTrustService = {
                getWorkspaceTrust: async () => options.workspaceTrusted ?? true
            };
            (target as unknown as { messageService: MessageService }).messageService = {
                error: ((message: string) => { options.errorMessages?.push(String(message)); return Promise.resolve(); })
            } as unknown as MessageService;
            return { target, calls };
        }

        it('returns false without touching the server when the server is not OAuth-enabled', async () => {
            const { target, calls } = buildSignInService({
                description: { name: 'asana', serverUrl: 'https://mcp.example.com/mcp' }
            });

            expect(await target.signIn('asana')).to.be.false;
            expect(calls).to.deep.equal([]);
        });

        it('returns false and surfaces an error toast when the workspace is untrusted', async () => {
            const errorMessages: string[] = [];
            const { target, calls } = buildSignInService({
                description: OAUTH_DESCRIPTION, workspaceTrusted: false, errorMessages
            });

            expect(await target.signIn('asana')).to.be.false;
            expect(calls).to.deep.equal([]);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0]).to.contain('trusted workspace');
        });

        it('stops, starts interactively, and stops again when the sign-in connects', async () => {
            // The leading stop cancels a stale in-flight authorization; the trailing stop leaves the
            // server offline (sign-in only stores tokens, it must not leave the server running).
            const { target, calls } = buildSignInService({
                description: OAUTH_DESCRIPTION, afterStartStatus: MCPServerStatus.Connected
            });

            expect(await target.signIn('asana')).to.be.true;
            expect(calls).to.deep.equal(['stop:asana', 'start:asana:true', 'stop:asana']);
        });

        it('returns false without a trailing stop when the sign-in does not connect', async () => {
            const { target, calls } = buildSignInService({
                description: OAUTH_DESCRIPTION, afterStartStatus: MCPServerStatus.AuthenticationRequired
            });

            expect(await target.signIn('asana')).to.be.false;
            expect(calls).to.deep.equal(['stop:asana', 'start:asana:true']);
        });
    });
});
