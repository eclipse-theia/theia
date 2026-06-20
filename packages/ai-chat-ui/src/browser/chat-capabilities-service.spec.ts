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
import { ChatCapabilitiesServiceImpl } from './chat-capabilities-service';

disableJSDOM();

describe('ChatCapabilitiesServiceImpl', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('extractUsedGenericCapabilities', () => {
        let service: ChatCapabilitiesServiceImpl;

        // Helper to access the protected method for testing
        type ExtractFn = (template: string) => import('@theia/ai-core').GenericCapabilitySelections;
        const extract = (template: string): import('@theia/ai-core').GenericCapabilitySelections =>
            (service as unknown as { extractUsedGenericCapabilities: ExtractFn }).extractUsedGenericCapabilities(template);

        beforeEach(() => {
            // Create a minimal instance to test the extraction logic
            service = new ChatCapabilitiesServiceImpl();
        });

        it('extracts functions from template', () => {
            const template = `
        You have access to these tools:
        ~{myFunction}
        ~{anotherFunction}
            `;

            const result = extract(template);

            expect(result.functions).to.deep.equal(['myFunction', 'anotherFunction']);
        });

        it('extracts MCP functions without distinguishing from regular functions', () => {
            const template = `
        You have access to MCP tools:
        ~{mcp_server1_tool1}
        ~{mcp_server2_tool2}
        ~{regularFunction}
            `;

            const result = extract(template);

            expect(result.functions).to.deep.equal(['mcp_server1_tool1', 'mcp_server2_tool2', 'regularFunction']);
        });

        it('extracts prompt fragment variable names', () => {
            const template = `
        Include these fragments:
        {{prompt:fragment1}}
        {{prompt:another-fragment}}
            `;

            const result = extract(template);

            expect(result.variables).to.include('prompt');
        });

        it('extracts skill variable names', () => {
            const template = `
        Load skills:
        {{skill:git-best-practices}}
        {{skill:code-review}}
            `;

            const result = extract(template);

            expect(result.variables).to.include('skill');
        });

        it('extracts regular variables from template', () => {
            const template = `
        Use these variables:
        {{today}}
        {{file:src/index.ts}}
        {{someVariable}}
            `;

            const result = extract(template);

            expect(result.variables).to.include('today');
            expect(result.variables).to.include('file');
            expect(result.variables).to.include('someVariable');
        });

        it('excludes capability variables', () => {
            const template = `
{{capability:some-capability default on}}
{{someVariable}}
            `;

            const result = extract(template);

            expect(result.variables).to.not.include('capability');
            expect(result.variables).to.include('someVariable');
        });

        it('excludes selected_* variables', () => {
            const template = `
{{selected_skills}}
{{selected_functions}}
{{someVariable}}
            `;

            const result = extract(template);

            expect(result.variables).to.not.include('selected_skills');
            expect(result.variables).to.not.include('selected_functions');
            expect(result.variables).to.include('someVariable');
        });

        it('excludes {{skills}} variable as a meta-variable', () => {
            const template = `
        {{skills}}
            `;

            const result = extract(template);

            // The {{skills}} variable lists all skills, so it's excluded
            expect(result.variables).to.not.include('skills');
        });

        it('handles mixed content correctly', () => {
            const template = `
        # System Prompt

        Use the following:
        ~{myFunction}
        ~{mcp_server1_tool}
        {{prompt:my-fragment}}
        {{skill:test-skill}}
        {{today}}
        {{capability:some-cap default on}}
            `;

            const result = extract(template);

            expect(result.functions).to.deep.equal(['myFunction', 'mcp_server1_tool']);
            expect(result.variables).to.include('prompt');
            expect(result.variables).to.include('skill');
            expect(result.variables).to.include('today');
            expect(result.variables).to.not.include('capability');
        });

        it('returns empty arrays for template with no capabilities', () => {
            const template = 'Just some plain text without any capabilities.';

            const result = extract(template);

            expect(result.functions).to.deep.equal([]);
            expect(result.variables).to.deep.equal([]);
        });
    });
});
