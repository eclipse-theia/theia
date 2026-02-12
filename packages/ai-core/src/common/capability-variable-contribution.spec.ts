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
import { Container } from 'inversify';
import { ILogger } from '@theia/core';
import { CapabilityVariableContribution, CAPABILITY_VARIABLE } from './capability-variable-contribution';
import { PromptService, PromptServiceImpl } from './prompt-service';
import { DefaultAIVariableService, AIVariableService } from './variable-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

disableJSDOM();

describe('CapabilityVariableContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());
    let contribution: CapabilityVariableContribution;
    let promptService: PromptService;
    let container: Container;

    beforeEach(() => {
        container = new Container();

        // Set up PromptService
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();
        const mockLogger = new MockLogger();
        const variableService = new DefaultAIVariableService({ getContributions: () => [] }, mockLogger);
        container.bind<AIVariableService>(AIVariableService).toConstantValue(variableService);
        container.bind<ILogger>(ILogger).toConstantValue(mockLogger);

        // Bind CapabilityVariableContribution with proper DI
        container.bind<CapabilityVariableContribution>(CapabilityVariableContribution).toSelf().inSingletonScope();

        // Get instances
        promptService = container.get<PromptService>(PromptService);
        contribution = container.get<CapabilityVariableContribution>(CapabilityVariableContribution);
    });

    describe('Capability Argument Parsing', () => {
        it('resolves to prompt fragment content when default is on', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'This is the capability content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default on' },
                {}
            );

            expect(result?.value).to.equal('This is the capability content');
        });

        it('resolves to empty string when default is off', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'This is the capability content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default off' },
                {}
            );

            expect(result?.value).to.equal('');
        });

        it('handles case-insensitive default on/off', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'Capability content'
            });

            const resultOn = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default ON' },
                {}
            );
            expect(resultOn?.value).to.equal('Capability content');

            const resultOff = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default OFF' },
                {}
            );
            expect(resultOff?.value).to.equal('');
        });

        it('returns empty string for non-existent fragment', async () => {
            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'non-existent-fragment default on' },
                {}
            );

            expect(result?.value).to.equal('');
        });

        it('returns empty string for invalid argument format', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'This is the capability content'
            });

            // Missing "default" keyword
            const result1 = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability on' },
                {}
            );
            expect(result1?.value).to.equal('');

            // Missing on/off value
            const result2 = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default' },
                {}
            );
            expect(result2?.value).to.equal('');

            // Invalid on/off value
            const result3 = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default yes' },
                {}
            );
            expect(result3?.value).to.equal('');
        });

        it('returns empty string for empty argument', async () => {
            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: '' },
                {}
            );

            expect(result?.value).to.equal('');
        });

        it('handles fragment IDs with hyphens', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'my-complex-capability-name',
                template: 'Complex capability content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'my-complex-capability-name default on' },
                {}
            );

            expect(result?.value).to.equal('Complex capability content');
        });

        it('handles whitespace in arguments', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'Capability content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: '  test-capability   default   on  ' },
                {}
            );

            expect(result?.value).to.equal('Capability content');
        });
    });

    describe('Variable Resolution', () => {
        it('returns correct variable in result', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'Content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default on' },
                {}
            );

            expect(result?.variable).to.deep.equal(CAPABILITY_VARIABLE);
        });

        it('returns empty allResolvedDependencies when disabled', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-capability',
                template: 'Content'
            });

            const result = await contribution.resolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test-capability default off' },
                {}
            );

            expect(result?.allResolvedDependencies).to.deep.equal([]);
        });
    });

    describe('canResolve', () => {
        it('returns 1 for capability variable', () => {
            const result = contribution.canResolve(
                { variable: CAPABILITY_VARIABLE, arg: 'test default on' },
                {}
            );

            expect(result).to.equal(1);
        });

        it('returns -1 for other variables', () => {
            const result = contribution.canResolve(
                { variable: { id: 'other', name: 'other', description: 'other' }, arg: 'test' },
                {}
            );

            expect(result).to.equal(-1);
        });
    });
});
