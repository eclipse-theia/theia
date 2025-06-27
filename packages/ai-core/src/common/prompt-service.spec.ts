// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from 'inversify';
import { PromptService, PromptServiceImpl } from './prompt-service';
import { DefaultAIVariableService, AIVariableService } from './variable-service';
import { ToolInvocationRegistry } from './tool-invocation-registry';
import { ToolRequest } from './language-model';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { ILogger, Logger } from '@theia/core';
import * as sinon from 'sinon';

describe('PromptService', () => {
    let promptService: PromptService;

    beforeEach(() => {
        const container = new Container();
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();
        const logger = sinon.createStubInstance(Logger);

        const variableService = new DefaultAIVariableService({ getContributions: () => [] }, logger);
        const nameVariable = { id: 'test', name: 'name', description: 'Test name ' };
        variableService.registerResolver(nameVariable, {
            canResolve: () => 100,
            resolve: async () => ({ variable: nameVariable, value: 'Jane' })
        });
        container.bind<AIVariableService>(AIVariableService).toConstantValue(variableService);
        container.bind<ILogger>(ILogger).toConstantValue(new MockLogger);

        promptService = container.get<PromptService>(PromptService);
        promptService.addBuiltInPromptFragment({ id: '1', template: 'Hello, {{name}}!' });
        promptService.addBuiltInPromptFragment({ id: '2', template: 'Goodbye, {{name}}!' });
        promptService.addBuiltInPromptFragment({ id: '3', template: 'Ciao, {{invalid}}!' });
        promptService.addBuiltInPromptFragment({ id: '8', template: 'Hello, {{{name}}}' });
    });

    it('should successfully initialize and retrieve built-in prompt fragments', () => {
        const allPrompts = promptService.getActivePromptFragments();
        expect(allPrompts.find(prompt => prompt.id === '1')!.template).to.equal('Hello, {{name}}!');
        expect(allPrompts.find(prompt => prompt.id === '2')!.template).to.equal('Goodbye, {{name}}!');
        expect(allPrompts.find(prompt => prompt.id === '3')!.template).to.equal('Ciao, {{invalid}}!');
        expect(allPrompts.find(prompt => prompt.id === '8')!.template).to.equal('Hello, {{{name}}}');
    });

    it('should retrieve raw prompt fragment by id', () => {
        const rawPrompt = promptService.getRawPromptFragment('1');
        expect(rawPrompt?.template).to.equal('Hello, {{name}}!');
    });

    it('should format prompt fragment with provided arguments', async () => {
        const formattedPrompt = await promptService.getResolvedPromptFragment('1', { name: 'John' });
        expect(formattedPrompt?.text).to.equal('Hello, John!');
    });

    it('should store a new prompt fragment', () => {
        promptService.addBuiltInPromptFragment({ id: '3', template: 'Welcome, {{name}}!' });
        const newPrompt = promptService.getRawPromptFragment('3');
        expect(newPrompt?.template).to.equal('Welcome, {{name}}!');
    });

    it('should replace variable placeholders with provided arguments', async () => {
        const prompt = await promptService.getResolvedPromptFragment('1', { name: 'John' });
        expect(prompt?.text).to.equal('Hello, John!');
    });

    it('should use variable service to resolve placeholders when argument values are not provided', async () => {
        const prompt = await promptService.getResolvedPromptFragment('1');
        expect(prompt?.text).to.equal('Hello, Jane!');
    });

    it('should return the prompt fragment even if there are no valid replacements', async () => {
        const prompt = await promptService.getResolvedPromptFragment('3');
        expect(prompt?.text).to.equal('Ciao, {{invalid}}!');
    });

    it('should return undefined if the prompt fragment id is not found', async () => {
        const prompt = await promptService.getResolvedPromptFragment('4');
        expect(prompt).to.be.undefined;
    });

    it('should ignore whitespace in variables', async () => {
        promptService.addBuiltInPromptFragment({ id: '4', template: 'Hello, {{name }}!' });
        promptService.addBuiltInPromptFragment({ id: '5', template: 'Hello, {{ name}}!' });
        promptService.addBuiltInPromptFragment({ id: '6', template: 'Hello, {{ name }}!' });
        promptService.addBuiltInPromptFragment({ id: '7', template: 'Hello, {{       name           }}!' });
        for (let i = 4; i <= 7; i++) {
            const prompt = await promptService.getResolvedPromptFragment(`${i}`, { name: 'John' });
            expect(prompt?.text).to.equal('Hello, John!');
        }
    });

    it('should retrieve raw prompt fragment by id (three bracket)', () => {
        const rawPrompt = promptService.getRawPromptFragment('8');
        expect(rawPrompt?.template).to.equal('Hello, {{{name}}}');
    });

    it('should correctly replace variables (three brackets)', async () => {
        const formattedPrompt = await promptService.getResolvedPromptFragment('8');
        expect(formattedPrompt?.text).to.equal('Hello, Jane');
    });

    it('should ignore whitespace in variables (three bracket)', async () => {
        promptService.addBuiltInPromptFragment({ id: '9', template: 'Hello, {{{name }}}' });
        promptService.addBuiltInPromptFragment({ id: '10', template: 'Hello, {{{ name}}}' });
        promptService.addBuiltInPromptFragment({ id: '11', template: 'Hello, {{{ name }}}' });
        promptService.addBuiltInPromptFragment({ id: '12', template: 'Hello, {{{       name           }}}' });
        for (let i = 9; i <= 12; i++) {
            const prompt = await promptService.getResolvedPromptFragment(`${i}`, { name: 'John' });
            expect(prompt?.text).to.equal('Hello, John');
        }
    });

    it('should ignore invalid prompts with unmatched brackets', async () => {
        promptService.addBuiltInPromptFragment({ id: '9', template: 'Hello, {{name' });
        promptService.addBuiltInPromptFragment({ id: '10', template: 'Hello, {{{name' });
        promptService.addBuiltInPromptFragment({ id: '11', template: 'Hello, name}}}}' });
        const prompt1 = await promptService.getResolvedPromptFragment('9', { name: 'John' });
        expect(prompt1?.text).to.equal('Hello, {{name'); // Not matching due to missing closing brackets
        const prompt2 = await promptService.getResolvedPromptFragment('10', { name: 'John' });
        expect(prompt2?.text).to.equal('Hello, {{{name'); // Matches pattern due to valid three-start-two-end brackets
        const prompt3 = await promptService.getResolvedPromptFragment('11', { name: 'John' });
        expect(prompt3?.text).to.equal('Hello, name}}}}'); // Extra closing bracket, does not match cleanly
    });

    it('should handle a mixture of two and three brackets correctly', async () => {
        promptService.addBuiltInPromptFragment({ id: '12', template: 'Hi, {{name}}}' });            // (invalid)
        promptService.addBuiltInPromptFragment({ id: '13', template: 'Hello, {{{name}}' });         // (invalid)
        promptService.addBuiltInPromptFragment({ id: '14', template: 'Greetings, {{{name}}}}' });   // (invalid)
        promptService.addBuiltInPromptFragment({ id: '15', template: 'Bye, {{{{name}}}' });         // (invalid)
        promptService.addBuiltInPromptFragment({ id: '16', template: 'Ciao, {{{{name}}}}' });       // (invalid)
        promptService.addBuiltInPromptFragment({ id: '17', template: 'Hi, {{name}}! {{{name}}}' }); // Mixed valid patterns

        const prompt12 = await promptService.getResolvedPromptFragment('12', { name: 'John' });
        expect(prompt12?.text).to.equal('Hi, {{name}}}');

        const prompt13 = await promptService.getResolvedPromptFragment('13', { name: 'John' });
        expect(prompt13?.text).to.equal('Hello, {{{name}}');

        const prompt14 = await promptService.getResolvedPromptFragment('14', { name: 'John' });
        expect(prompt14?.text).to.equal('Greetings, {{{name}}}}');

        const prompt15 = await promptService.getResolvedPromptFragment('15', { name: 'John' });
        expect(prompt15?.text).to.equal('Bye, {{{{name}}}');

        const prompt16 = await promptService.getResolvedPromptFragment('16', { name: 'John' });
        expect(prompt16?.text).to.equal('Ciao, {{{{name}}}}');

        const prompt17 = await promptService.getResolvedPromptFragment('17', { name: 'John' });
        expect(prompt17?.text).to.equal('Hi, John! John');
    });

    it('should strip single-line comments at the start of the template', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-basic', template: '{{!-- Comment --}}Hello, {{name}}!' });
        const prompt = promptService.getPromptFragment('comment-basic');
        expect(prompt?.template).to.equal('Hello, {{name}}!');
    });

    it('should remove line break after first-line comment', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-line-break', template: '{{!-- Comment --}}\nHello, {{name}}!' });
        const prompt = promptService.getPromptFragment('comment-line-break');
        expect(prompt?.template).to.equal('Hello, {{name}}!');
    });

    it('should strip multiline comments at the start of the template', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-multiline', template: '{{!--\nMultiline comment\n--}}\nGoodbye, {{name}}!' });
        const prompt = promptService.getPromptFragment('comment-multiline');
        expect(prompt?.template).to.equal('Goodbye, {{name}}!');
    });

    it('should not strip comments not in the first line', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-second-line', template: 'Hello, {{name}}!\n{{!-- Comment --}}' });
        const prompt = promptService.getPromptFragment('comment-second-line');
        expect(prompt?.template).to.equal('Hello, {{name}}!\n{{!-- Comment --}}');
    });

    it('should treat unclosed comments as regular text', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-unclosed', template: '{{!-- Unclosed comment' });
        const prompt = promptService.getPromptFragment('comment-unclosed');
        expect(prompt?.template).to.equal('{{!-- Unclosed comment');
    });

    it('should treat standalone closing delimiters as regular text', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-standalone', template: '--}} Hello, {{name}}!' });
        const prompt = promptService.getPromptFragment('comment-standalone');
        expect(prompt?.template).to.equal('--}} Hello, {{name}}!');
    });

    it('should handle nested comments and stop at the first closing tag', () => {
        promptService.addBuiltInPromptFragment({ id: 'nested-comment', template: '{{!-- {{!-- Nested comment --}} --}}text' });
        const prompt = promptService.getPromptFragment('nested-comment');
        expect(prompt?.template).to.equal('--}}text');
    });

    it('should handle templates with only comments', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-only', template: '{{!-- Only comments --}}' });
        const prompt = promptService.getPromptFragment('comment-only');
        expect(prompt?.template).to.equal('');
    });

    it('should handle mixed delimiters on the same line', () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-mixed', template: '{{!-- Unclosed comment --}}' });
        const prompt = promptService.getPromptFragment('comment-mixed');
        expect(prompt?.template).to.equal('');
    });

    it('should resolve variables after stripping single-line comments', async () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-resolve', template: '{{!-- Comment --}}Hello, {{name}}!' });
        const prompt = await promptService.getResolvedPromptFragment('comment-resolve', { name: 'John' });
        expect(prompt?.text).to.equal('Hello, John!');
    });

    it('should resolve variables in multiline templates with comments', async () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-multiline-vars', template: '{{!--\nMultiline comment\n--}}\nHello, {{name}}!' });
        const prompt = await promptService.getResolvedPromptFragment('comment-multiline-vars', { name: 'John' });
        expect(prompt?.text).to.equal('Hello, John!');
    });

    it('should resolve variables with standalone closing delimiters', async () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-standalone-vars', template: '--}} Hello, {{name}}!' });
        const prompt = await promptService.getResolvedPromptFragment('comment-standalone-vars', { name: 'John' });
        expect(prompt?.text).to.equal('--}} Hello, John!');
    });

    it('should treat unclosed comments as text and resolve variables', async () => {
        promptService.addBuiltInPromptFragment({ id: 'comment-unclosed-vars', template: '{{!-- Unclosed comment\nHello, {{name}}!' });
        const prompt = await promptService.getResolvedPromptFragment('comment-unclosed-vars', { name: 'John' });
        expect(prompt?.text).to.equal('{{!-- Unclosed comment\nHello, John!');
    });

    it('should handle templates with mixed comments and variables', async () => {
        promptService.addBuiltInPromptFragment(
            { id: 'comment-mixed-vars', template: '{{!-- Comment --}}Hi, {{name}}! {{!-- Another comment --}}' });
        const prompt = await promptService.getResolvedPromptFragment('comment-mixed-vars', { name: 'John' });
        expect(prompt?.text).to.equal('Hi, John! {{!-- Another comment --}}');
    });

    it('should return all variant IDs of a given prompt', () => {
        promptService.addBuiltInPromptFragment({
            id: 'variant1',
            template: 'Variant 1',
        }, 'systemPrompt'
        );
        promptService.addBuiltInPromptFragment({
            id: 'variant2',
            template: 'Variant 2',
        }, 'systemPrompt'
        );
        promptService.addBuiltInPromptFragment({
            id: 'variant3',
            template: 'Variant 3',
        }, 'systemPrompt'
        );

        const variantIds = promptService.getVariantIds('systemPrompt');
        expect(variantIds).to.deep.equal(['variant1', 'variant2', 'variant3']);
    });

    it('should return an empty array if no variants exist for a given prompt', () => {
        promptService.addBuiltInPromptFragment({ id: 'main', template: 'Main template' });

        const variantIds = promptService.getVariantIds('main');
        expect(variantIds).to.deep.equal([]);
    });

    it('should return an empty array if the main prompt ID does not exist', () => {
        const variantIds = promptService.getVariantIds('nonExistent');
        expect(variantIds).to.deep.equal([]);
    });

    it('should not influence prompts without variants when other prompts have variants', () => {
        promptService.addBuiltInPromptFragment({ id: 'variant1', template: 'Variant 1' }, 'systemPromptWithVariants', true);
        promptService.addBuiltInPromptFragment({ id: 'promptFragmentWithoutVariants', template: 'template without variants' });

        promptService.addBuiltInPromptFragment({
            id: 'variant2',
            template: 'Variant 2',
        }, 'systemPromptWithVariants'
        );

        const systemPromptWithVariants = promptService.getVariantIds('systemPromptWithVariants');
        const promptFragmentWithoutVariants = promptService.getVariantIds('promptFragmentWithoutVariants');

        expect(systemPromptWithVariants).to.deep.equal(['variant1', 'variant2']);
        expect(promptFragmentWithoutVariants).to.deep.equal([]);
    });

    it('should resolve function references within resolved variable replacements', async () => {
        // Mock the tool invocation registry
        const toolInvocationRegistry = {
            getFunction: sinon.stub()
        };

        // Create a test tool request that will be returned by the registry
        const testFunction: ToolRequest = {
            id: 'testFunction',
            name: 'Test Function',
            description: 'A test function',
            parameters: {
                type: 'object',
                properties: {
                    param1: {
                        type: 'string',
                        description: 'Test parameter'
                    }
                }
            },
            providerName: 'test-provider',
            handler: sinon.stub()
        };
        toolInvocationRegistry.getFunction.withArgs('testFunction').returns(testFunction);

        // Create a container with our mocked registry
        const container = new Container();
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        container.bind<ToolInvocationRegistry>(ToolInvocationRegistry).toConstantValue(toolInvocationRegistry as any);

        // Set up a variable service that returns a fragment with a function reference
        const variableService = new DefaultAIVariableService({ getContributions: () => [] }, sinon.createStubInstance(Logger));
        const fragmentVariable = { id: 'test', name: 'fragment', description: 'Test fragment with function' };
        variableService.registerResolver(fragmentVariable, {
            canResolve: () => 100,
            resolve: async () => ({
                variable: fragmentVariable,
                value: 'This fragment contains a function reference: ~{testFunction}'
            })
        });
        container.bind<AIVariableService>(AIVariableService).toConstantValue(variableService);
        container.bind<ILogger>(ILogger).toConstantValue(new MockLogger);

        const testPromptService = container.get<PromptService>(PromptService);
        testPromptService.addBuiltInPromptFragment({ id: 'testPrompt', template: 'Template with fragment: {{fragment}}' });

        // Get the resolved prompt
        const resolvedPrompt = await testPromptService.getResolvedPromptFragment('testPrompt');

        // Verify that the function was resolved
        expect(resolvedPrompt).to.not.be.undefined;
        expect(resolvedPrompt?.text).to.include('This fragment contains a function reference:');
        expect(resolvedPrompt?.text).to.not.include('~{testFunction}');

        // Verify that the function description was added to functionDescriptions
        expect(resolvedPrompt?.functionDescriptions?.size).to.equal(1);
        expect(resolvedPrompt?.functionDescriptions?.get('testFunction')).to.deep.equal(testFunction);

        // Verify that the tool invocation registry was called
        expect(toolInvocationRegistry.getFunction.calledWith('testFunction')).to.be.true;
    });
});
