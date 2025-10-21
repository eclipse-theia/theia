// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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
import * as sinon from 'sinon';
import { Container } from 'inversify';
import { CommandService, ILogger, Logger } from '@theia/core';
import { PromptVariableContribution, PROMPT_VARIABLE } from './prompt-variable-contribution';
import { PromptService, PromptServiceImpl } from './prompt-service';
import { DefaultAIVariableService, AIVariableService } from './variable-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

disableJSDOM();

describe('PromptVariableContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());
    let contribution: PromptVariableContribution;
    let promptService: PromptService;
    let container: Container;

    beforeEach(() => {
        container = new Container();

        // Set up PromptService
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();
        const logger = sinon.createStubInstance(Logger);
        const variableService = new DefaultAIVariableService({ getContributions: () => [] }, logger);
        container.bind<AIVariableService>(AIVariableService).toConstantValue(variableService);
        container.bind<ILogger>(ILogger).toConstantValue(new MockLogger);

        // Set up CommandService stub (needed for PromptVariableContribution but not used in these tests)
        const commandService = sinon.createStubInstance(Logger); // Using Logger as a simple mock
        container.bind<CommandService>(CommandService).toConstantValue(commandService as unknown as CommandService);

        // Bind PromptVariableContribution with proper DI
        container.bind<PromptVariableContribution>(PromptVariableContribution).toSelf().inSingletonScope();

        // Get instances
        promptService = container.get<PromptService>(PromptService);
        contribution = container.get<PromptVariableContribution>(PromptVariableContribution);
    });

    describe('Command Argument Substitution', () => {
        it('substitutes $ARGUMENTS with full argument string', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Process: $ARGUMENTS',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|arg1 arg2 arg3' },
                {}
            );

            expect(result?.value).to.equal('Process: arg1 arg2 arg3');
        });

        it('substitutes $0 with command name', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Command $0 was called',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|args' },
                {}
            );

            expect(result?.value).to.equal('Command test-cmd was called');
        });

        it('substitutes $1, $2, ... with individual arguments', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'compare-cmd',
                template: 'Compare $1 with $2',
                isCommand: true,
                commandName: 'compare'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'compare-cmd|item1 item2' },
                {}
            );

            expect(result?.value).to.equal('Compare item1 with item2');
        });

        it('handles quoted arguments in $1, $2', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'First: $1, Second: $2',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|"arg with spaces" other' },
                {}
            );

            expect(result?.value).to.equal('First: arg with spaces, Second: other');
        });

        it('handles escaped quotes in arguments', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Arg: $1',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|"value with \\"quote\\""' },
                {}
            );

            expect(result?.value).to.equal('Arg: value with "quote"');
        });

        it('handles 10+ arguments correctly', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Args: $1 $10 $11',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|a b c d e f g h i j k' },
                {}
            );

            expect(result?.value).to.equal('Args: a j k');
        });

        it('handles command without arguments', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'hello-cmd',
                template: 'Hello, world!',
                isCommand: true,
                commandName: 'hello'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'hello-cmd' },
                {}
            );

            expect(result?.value).to.equal('Hello, world!');
        });

        it('handles non-command prompts without substitution', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'normal-prompt',
                template: 'This has $1 and $ARGUMENTS but is not a command'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'normal-prompt' },
                {}
            );

            // No substitution should occur for non-commands
            expect(result?.value).to.equal('This has $1 and $ARGUMENTS but is not a command');
        });

        it('handles missing argument placeholders gracefully', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Args: $1 $2 $3',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|only-one' },
                {}
            );

            // Missing arguments should remain as placeholders
            expect(result?.value).to.equal('Args: only-one $2 $3');
        });
    });

    describe('Command Resolution', () => {
        it('resolves command fragments correctly', async () => {
            promptService.addBuiltInPromptFragment({
                id: 'test-cmd',
                template: 'Do something with $ARGUMENTS',
                isCommand: true,
                commandName: 'test'
            });

            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'test-cmd|input' },
                {}
            );

            expect(result?.value).to.equal('Do something with input');
            expect(result?.variable).to.deep.equal(PROMPT_VARIABLE);
        });

        it('returns empty string for non-existent prompts', async () => {
            const result = await contribution.resolve(
                { variable: PROMPT_VARIABLE, arg: 'non-existent|args' },
                {}
            );

            expect(result?.value).to.equal('');
        });
    });
});
