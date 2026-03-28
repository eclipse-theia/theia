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

import 'reflect-metadata';

import { expect } from 'chai';
import { GenericCapabilitiesServiceImpl } from './generic-capabilities-service';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { ToolRequest } from '@theia/ai-core/lib/common/language-model';

disableJSDOM();

describe('GenericCapabilitiesServiceImpl', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('getAvailableFunctions - Group Field Precedence', () => {
        let service: GenericCapabilitiesServiceImpl;
        let mockRegistry: ToolInvocationRegistry;

        beforeEach(() => {
            // Create mock registry
            mockRegistry = {
                getAllFunctions: () => []
            } as unknown as ToolInvocationRegistry;

            service = new GenericCapabilitiesServiceImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = mockRegistry;
        });

        it('should use group field when both group and providerName are present', () => {
            const testFunctions: ToolRequest[] = [
                {
                    id: 'test1',
                    name: 'testFunction1',
                    group: 'Launch Configurations',
                    providerName: 'SomeProvider',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }
            ];

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('Launch Configurations');
            expect(result[0].items).to.have.lengthOf(1);
            expect(result[0].items[0].group).to.equal('Launch Configurations');
        });

        it('should prioritize group over providerName for 100 random functions', () => {
            const iterations = 100;
            const testFunctions: ToolRequest[] = [];

            for (let i = 0; i < iterations; i++) {
                testFunctions.push({
                    id: `func${i}`,
                    name: `function${i}`,
                    group: `Group${i % 10}`,
                    providerName: `Provider${i % 5}`,
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                });
            }

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            // Verify all functions are grouped by their group field, not providerName
            for (const group of result) {
                for (const item of group.items) {
                    expect(item.group).to.equal(group.name);
                    expect(item.group).to.not.equal(undefined);
                }
            }
        });
    });

    describe('getAvailableFunctions - ProviderName Fallback', () => {
        let service: GenericCapabilitiesServiceImpl;
        let mockRegistry: ToolInvocationRegistry;

        beforeEach(() => {
            mockRegistry = {
                getAllFunctions: () => []
            } as unknown as ToolInvocationRegistry;

            service = new GenericCapabilitiesServiceImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = mockRegistry;
        });

        it('should use providerName when group is not present', () => {
            const testFunctions: ToolRequest[] = [
                {
                    id: 'test1',
                    name: 'testFunction1',
                    providerName: 'MyProvider',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }
            ];

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('MyProvider');
            expect(result[0].items).to.have.lengthOf(1);
        });

        it('should fallback to providerName for 100 random functions without group', () => {
            const iterations = 100;
            const testFunctions: ToolRequest[] = [];

            for (let i = 0; i < iterations; i++) {
                testFunctions.push({
                    id: `func${i}`,
                    name: `function${i}`,
                    providerName: `Provider${i % 10}`,
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                });
            }

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            // Verify all functions are grouped by providerName
            for (const group of result) {
                for (const _item of group.items) {
                    expect(group.name).to.match(/^Provider\d+$/);
                }
            }

            // Should have 10 groups (Provider0 through Provider9)
            expect(result).to.have.lengthOf(10);
        });
    });

    describe('getAvailableFunctions - Default Group Assignment', () => {
        let service: GenericCapabilitiesServiceImpl;
        let mockRegistry: ToolInvocationRegistry;

        beforeEach(() => {
            mockRegistry = {
                getAllFunctions: () => []
            } as unknown as ToolInvocationRegistry;

            service = new GenericCapabilitiesServiceImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = mockRegistry;
        });

        it('should assign to "Other" group when both group and providerName are missing', () => {
            const testFunctions: ToolRequest[] = [
                {
                    id: 'test1',
                    name: 'testFunction1',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }
            ];

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('Other');
            expect(result[0].items).to.have.lengthOf(1);
        });

        it('should assign 100 random functions without group/providerName to "Other"', () => {
            const iterations = 100;
            const testFunctions: ToolRequest[] = [];

            for (let i = 0; i < iterations; i++) {
                testFunctions.push({
                    id: `func${i}`,
                    name: `function${i}`,
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                });
            }

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            // All functions should be in a single "Other" group
            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('Other');
            expect(result[0].items).to.have.lengthOf(iterations);
        });
    });

    describe('getAvailableFunctions - Group Aggregation', () => {
        let service: GenericCapabilitiesServiceImpl;
        let mockRegistry: ToolInvocationRegistry;

        beforeEach(() => {
            mockRegistry = {
                getAllFunctions: () => []
            } as unknown as ToolInvocationRegistry;

            service = new GenericCapabilitiesServiceImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = mockRegistry;
        });

        it('should aggregate functions with same resolved group name', () => {
            const testFunctions: ToolRequest[] = [
                {
                    id: 'test1',
                    name: 'testFunction1',
                    group: 'Launch Configurations',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                },
                {
                    id: 'test2',
                    name: 'testFunction2',
                    group: 'Launch Configurations',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                },
                {
                    id: 'test3',
                    name: 'testFunction3',
                    group: 'Tasks',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }
            ];

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            expect(result).to.have.lengthOf(2);

            const launchGroup = result.find(g => g.name === 'Launch Configurations');
            const tasksGroup = result.find(g => g.name === 'Tasks');

            expect(launchGroup).to.not.be.undefined;
            expect(tasksGroup).to.not.be.undefined;
            expect(launchGroup!.items).to.have.lengthOf(2);
            expect(tasksGroup!.items).to.have.lengthOf(1);
        });

        it('should aggregate 100 random functions into correct groups without duplicates', () => {
            const iterations = 100;
            const testFunctions: ToolRequest[] = [];
            const groupCounts = new Map<string, number>();

            for (let i = 0; i < iterations; i++) {
                const groupName = `Group${i % 5}`;
                groupCounts.set(groupName, (groupCounts.get(groupName) || 0) + 1);

                testFunctions.push({
                    id: `func${i}`,
                    name: `function${i}`,
                    group: groupName,
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                });
            }

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            // Should have 5 groups (Group0 through Group4)
            expect(result).to.have.lengthOf(5);

            // Verify each group has the correct count
            for (const group of result) {
                const expectedCount = groupCounts.get(group.name);
                expect(group.items).to.have.lengthOf(expectedCount!);

                // Verify no duplicates within group
                const ids = group.items.map(item => item.id);
                const uniqueIds = new Set(ids);
                expect(uniqueIds.size).to.equal(ids.length);
            }
        });
    });

    describe('getAvailableFunctions - MCP Function Exclusion', () => {
        let service: GenericCapabilitiesServiceImpl;
        let mockRegistry: ToolInvocationRegistry;

        beforeEach(() => {
            mockRegistry = {
                getAllFunctions: () => []
            } as unknown as ToolInvocationRegistry;

            service = new GenericCapabilitiesServiceImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).toolInvocationRegistry = mockRegistry;
        });

        it('should exclude functions with providerName starting with "mcp_"', () => {
            const testFunctions: ToolRequest[] = [
                {
                    id: 'test1',
                    name: 'testFunction1',
                    providerName: 'mcp_server1',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                },
                {
                    id: 'test2',
                    name: 'testFunction2',
                    providerName: 'RegularProvider',
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                }
            ];

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            expect(result).to.have.lengthOf(1);
            expect(result[0].name).to.equal('RegularProvider');
            expect(result[0].items).to.have.lengthOf(1);
            expect(result[0].items[0].id).to.equal('test2');
        });

        it('should exclude 100 random MCP functions from results', () => {
            const iterations = 100;
            const testFunctions: ToolRequest[] = [];

            for (let i = 0; i < iterations; i++) {
                const isMcp = i % 2 === 0;
                testFunctions.push({
                    id: `func${i}`,
                    name: `function${i}`,
                    providerName: isMcp ? `mcp_server${i}` : `Provider${i}`,
                    parameters: { type: 'object', properties: {} },
                    handler: async () => 'result'
                });
            }

            mockRegistry.getAllFunctions = () => testFunctions;

            const result = service.getAvailableFunctions();

            // Count total items across all groups
            const totalItems = result.reduce((sum, group) => sum + group.items.length, 0);

            // Should have exactly 50 items (half were MCP and excluded)
            expect(totalItems).to.equal(50);

            // Verify no MCP functions in results
            for (const group of result) {
                expect(group.name).to.not.match(/^mcp_/);
                for (const item of group.items) {
                    expect(item.id).to.not.match(/^func[02468]0*$/); // Even numbers were MCP
                }
            }
        });
    });
});
