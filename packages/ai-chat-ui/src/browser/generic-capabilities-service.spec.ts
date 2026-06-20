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

import 'reflect-metadata';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { GenericCapabilitiesServiceImpl } from './generic-capabilities-service';
import { ToolRequest, PromptFragment, Skill } from '@theia/ai-core';

disableJSDOM();

describe('GenericCapabilitiesServiceImpl', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let service: GenericCapabilitiesServiceImpl;

    beforeEach(() => {
        // Instantiate directly to skip @postConstruct (which subscribes to service events)
        service = new GenericCapabilitiesServiceImpl();
    });

    describe('getAvailableFunctions', () => {
        it('returns empty array when toolInvocationRegistry is not available', () => {
            expect(service.getAvailableFunctions()).to.deep.equal([]);
        });

        it('returns non-MCP functions', () => {
            const mockTools: Partial<ToolRequest>[] = [
                { id: 'myTool', name: 'My Tool', description: 'A tool', providerName: 'local' },
                { id: 'anotherTool', name: 'Another Tool', description: 'Another', providerName: 'builtin' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = { getAllFunctions: () => mockTools };

            const result = service.getAvailableFunctions();

            expect(result).to.have.length(2);
            expect(result[0]).to.deep.equal({ id: 'myTool', name: 'My Tool', description: 'A tool' });
            expect(result[1]).to.deep.equal({ id: 'anotherTool', name: 'Another Tool', description: 'Another' });
        });

        it('filters out MCP-provided functions', () => {
            const mockTools: Partial<ToolRequest>[] = [
                { id: 'localTool', name: 'Local Tool', description: 'A local tool', providerName: 'local' },
                { id: 'mcp_server1_tool1', name: 'MCP Tool 1', description: 'An MCP tool', providerName: 'mcp_server1' },
                { id: 'mcp_server2_tool2', name: 'MCP Tool 2', description: 'Another MCP tool', providerName: 'mcp_server2' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = { getAllFunctions: () => mockTools };

            const result = service.getAvailableFunctions();

            expect(result).to.have.length(1);
            expect(result[0].id).to.equal('localTool');
        });

        it('includes functions without a providerName', () => {
            const mockTools: Partial<ToolRequest>[] = [
                { id: 'noProvider', name: 'No Provider', description: 'No provider set' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = { getAllFunctions: () => mockTools };

            const result = service.getAvailableFunctions();

            expect(result).to.have.length(1);
            expect(result[0].id).to.equal('noProvider');
        });

        it('uses id as name fallback when name is missing', () => {
            const mockTools: Partial<ToolRequest>[] = [
                { id: 'tool-id', name: '', description: 'desc' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = { getAllFunctions: () => mockTools };

            const result = service.getAvailableFunctions();

            expect(result[0].name).to.equal('tool-id');
        });
    });

    describe('getAvailablePromptFragments', () => {
        it('returns empty array when promptService is not available', () => {
            expect(service.getAvailablePromptFragments()).to.deep.equal([]);
        });

        it('returns non-capability prompt fragments', () => {
            const fragments: PromptFragment[] = [
                { id: 'my-fragment', template: 'Hello world' },
                { id: 'another-fragment', template: 'Some content' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).promptService = { getActivePromptFragments: () => fragments };

            const result = service.getAvailablePromptFragments();

            expect(result).to.have.length(2);
            expect(result[0].id).to.equal('my-fragment');
            expect(result[1].id).to.equal('another-fragment');
        });

        it('filters out generic-capabilities- prefixed fragments', () => {
            const fragments: PromptFragment[] = [
                { id: 'generic-capabilities-skills', template: 'auto-generated' },
                { id: 'generic-capabilities-functions', template: 'auto-generated' },
                { id: 'user-fragment', template: 'User content' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).promptService = { getActivePromptFragments: () => fragments };

            const result = service.getAvailablePromptFragments();

            expect(result).to.have.length(1);
            expect(result[0].id).to.equal('user-fragment');
        });

        it('truncates long template descriptions', () => {
            const longTemplate = 'A'.repeat(150);
            const fragments: PromptFragment[] = [
                { id: 'long-fragment', template: longTemplate }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).promptService = { getActivePromptFragments: () => fragments };

            const result = service.getAvailablePromptFragments();

            expect(result[0].description).to.have.length(103); // 100 chars + '...'
            expect(result[0].description!.endsWith('...')).to.be.true;
        });

        it('does not truncate short template descriptions', () => {
            const fragments: PromptFragment[] = [
                { id: 'short-fragment', template: 'Short content' }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).promptService = { getActivePromptFragments: () => fragments };

            const result = service.getAvailablePromptFragments();

            expect(result[0].description).to.equal('Short content');
        });
    });

    describe('getAvailableVariables', () => {
        it('returns empty array when variableService is not available', () => {
            expect(service.getAvailableVariables()).to.deep.equal([]);
        });

        it('returns non-capability variables', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).variableService = {
                getVariables: () => [
                    { id: 'v1', name: 'today', description: 'Current date' },
                    { id: 'v2', name: 'file', description: 'File content' }
                ]
            };

            const result = service.getAvailableVariables();

            expect(result).to.have.length(2);
            expect(result[0].name).to.equal('today');
            expect(result[1].name).to.equal('file');
        });

        it('filters out selected_ prefixed variables', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).variableService = {
                getVariables: () => [
                    { id: 'v1', name: 'selected_skills', description: 'Selected skills' },
                    { id: 'v2', name: 'selected_functions', description: 'Selected functions' },
                    { id: 'v3', name: 'today', description: 'Current date' }
                ]
            };

            const result = service.getAvailableVariables();

            expect(result).to.have.length(1);
            expect(result[0].name).to.equal('today');
        });
    });

    describe('getAvailableAgents', () => {
        it('returns empty array when chatAgentService is not available', () => {
            expect(service.getAvailableAgents()).to.deep.equal([]);
        });

        it('returns all agents when no excludeAgentId is provided', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).chatAgentService = {
                getAgents: () => [
                    { id: 'agent1', name: 'Agent 1', description: 'First agent' },
                    { id: 'agent2', name: 'Agent 2', description: 'Second agent' }
                ]
            };

            const result = service.getAvailableAgents();

            expect(result).to.have.length(2);
        });

        it('excludes agent with matching excludeAgentId', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).chatAgentService = {
                getAgents: () => [
                    { id: 'agent1', name: 'Agent 1', description: 'First agent' },
                    { id: 'agent2', name: 'Agent 2', description: 'Second agent' }
                ]
            };

            const result = service.getAvailableAgents('agent1');

            expect(result).to.have.length(1);
            expect(result[0].id).to.equal('agent2');
        });
    });

    describe('getAvailableSkills', () => {
        it('returns empty array when skillService is not available', () => {
            expect(service.getAvailableSkills()).to.deep.equal([]);
        });

        it('maps skills to capability items', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).skillService = {
                getSkills: () => [
                    { name: 'git-best-practices', description: 'Git tips', location: '/path' },
                    { name: 'code-review', description: 'Code review', location: '/path2' }
                ] as Skill[]
            };

            const result = service.getAvailableSkills();

            expect(result).to.have.length(2);
            expect(result[0]).to.deep.equal({ id: 'git-best-practices', name: 'git-best-practices', description: 'Git tips' });
            expect(result[1]).to.deep.equal({ id: 'code-review', name: 'code-review', description: 'Code review' });
        });
    });
});
