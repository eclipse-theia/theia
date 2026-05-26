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
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from 'inversify';
import {
    GenericCapabilitiesVariableContribution,
    SELECTED_SKILLS_VARIABLE,
    SELECTED_FUNCTIONS_VARIABLE,
    SELECTED_MCP_FUNCTIONS_VARIABLE,
    SELECTED_VARIABLES_VARIABLE
} from './generic-capabilities-variable-contribution';
import { CapabilityAwareContext } from '../common/capability-utils';
import { ToolInvocationRegistry } from '../common/tool-invocation-registry';
import { ToolRequest } from '../common/language-model';

disableJSDOM();

describe('GenericCapabilitiesVariableContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());
    let contribution: GenericCapabilitiesVariableContribution;
    let container: Container;

    function createMockToolInvocationRegistry(registeredToolIds: string[]): ToolInvocationRegistry {
        const tools = new Map<string, ToolRequest>();
        for (const id of registeredToolIds) {
            tools.set(id, { id, providerName: 'test', parameters: {}, handler: async () => '' } as unknown as ToolRequest);
        }
        return {
            getFunction: (toolId: string) => tools.get(toolId),
            getFunctions: (...toolIds: string[]) => toolIds.map(id => tools.get(id)).filter((t): t is ToolRequest => t !== undefined),
            registerTool: () => { },
            unregisterTool: () => { },
            unregisterAllTools: () => { },
            getAllFunctions: () => Array.from(tools.values()),
            onDidChange: () => ({ dispose: () => { } }),
        } as unknown as ToolInvocationRegistry;
    }

    beforeEach(() => {
        container = new Container();
        container.bind<GenericCapabilitiesVariableContribution>(GenericCapabilitiesVariableContribution).toSelf().inSingletonScope();
        contribution = container.get<GenericCapabilitiesVariableContribution>(GenericCapabilitiesVariableContribution);
    });

    describe('canResolve', () => {
        it('returns 1 for selected_skills variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns 1 for selected_functions variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_FUNCTIONS_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns 1 for selected_variables variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_VARIABLES_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns -1 for unknown variables', () => {
            const result = contribution.canResolve(
                { variable: { id: 'unknown', name: 'unknown', description: 'unknown' } },
                {}
            );
            expect(result).to.equal(-1);
        });
    });

    describe('resolve', () => {
        describe('resolveSelectedFunctions filtering', () => {
            it('returns empty string when toolInvocationRegistry is not available', async () => {
                const context: CapabilityAwareContext = {
                    genericCapabilitySelections: {
                        functions: ['tool1', 'tool2']
                    }
                };

                const result = await contribution.resolve(
                    { variable: SELECTED_FUNCTIONS_VARIABLE },
                    context
                );

                expect(result?.value).to.equal('');
            });

            it('filters out stale tool IDs that are not in the registry', async () => {
                const mockRegistry = createMockToolInvocationRegistry(['tool1', 'tool3']);
                (contribution as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = mockRegistry;

                const context: CapabilityAwareContext = {
                    genericCapabilitySelections: {
                        functions: ['tool1', 'tool2_stale', 'tool3']
                    }
                };

                const result = await contribution.resolve(
                    { variable: SELECTED_FUNCTIONS_VARIABLE },
                    context
                );

                expect(result?.value).to.equal('~{tool1}\n~{tool3}');
            });

            it('returns empty string when all tool IDs are stale', async () => {
                const mockRegistry = createMockToolInvocationRegistry([]);
                (contribution as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = mockRegistry;

                const context: CapabilityAwareContext = {
                    genericCapabilitySelections: {
                        functions: ['stale1', 'stale2']
                    }
                };

                const result = await contribution.resolve(
                    { variable: SELECTED_FUNCTIONS_VARIABLE },
                    context
                );

                expect(result?.value).to.equal('');
            });

            it('returns all tool references when all IDs are valid', async () => {
                const mockRegistry = createMockToolInvocationRegistry(['tool1', 'tool2']);
                (contribution as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = mockRegistry;

                const context: CapabilityAwareContext = {
                    genericCapabilitySelections: {
                        functions: ['tool1', 'tool2']
                    }
                };

                const result = await contribution.resolve(
                    { variable: SELECTED_FUNCTIONS_VARIABLE },
                    context
                );

                expect(result?.value).to.equal('~{tool1}\n~{tool2}');
            });

            it('filters stale MCP function IDs the same way', async () => {
                const mockRegistry = createMockToolInvocationRegistry(['mcp_fetch_fetch']);
                (contribution as unknown as { toolInvocationRegistry: ToolInvocationRegistry }).toolInvocationRegistry = mockRegistry;

                const context: CapabilityAwareContext = {
                    genericCapabilitySelections: {
                        mcpFunctions: ['mcp_fetch_fetch', 'mcp_removed_server_tool']
                    }
                };

                const result = await contribution.resolve(
                    { variable: SELECTED_MCP_FUNCTIONS_VARIABLE },
                    context
                );

                expect(result?.value).to.equal('~{mcp_fetch_fetch}');
            });
        });

        it('returns empty string when no selections exist', async () => {
            const context: CapabilityAwareContext = {};

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.value).to.equal('');
        });

        it('returns empty string when selections array is empty', async () => {
            const context: CapabilityAwareContext = {
                genericCapabilitySelections: {
                    skills: []
                }
            };

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.value).to.equal('');
        });

        it('returns empty string for skills when skillService is not available', async () => {
            const context: CapabilityAwareContext = {
                genericCapabilitySelections: {
                    skills: ['skill1', 'skill2']
                }
            };

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            // Without skillService, it returns empty
            expect(result?.value).to.equal('');
        });

        it('returns correct variable in result', async () => {
            const context: CapabilityAwareContext = {};

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.variable).to.deep.equal(SELECTED_SKILLS_VARIABLE);
        });
    });
});
