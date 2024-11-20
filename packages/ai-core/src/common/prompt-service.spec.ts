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

describe('PromptService', () => {
    let promptService: PromptService;

    beforeEach(() => {
        const container = new Container();
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();

        const variableService = new DefaultAIVariableService({ getContributions: () => [] });
        const nameVariable = { id: 'test', name: 'name', description: 'Test name ' };
        variableService.registerResolver(nameVariable, {
            canResolve: () => 100,
            resolve: async () => ({ variable: nameVariable, value: 'Jane' })
        });
        container.bind<AIVariableService>(AIVariableService).toConstantValue(variableService);

        promptService = container.get<PromptService>(PromptService);
        promptService.storePrompt('1', 'Hello, {{name}}!');
        promptService.storePrompt('2', 'Goodbye, {{name}}!');
        promptService.storePrompt('3', 'Ciao, {{invalid}}!');
        promptService.storePrompt('8', 'Hello, {{{name}}}');
    });

    it('should initialize prompts from PromptCollectionService', () => {
        const allPrompts = promptService.getAllPrompts();
        expect(allPrompts['1'].template).to.equal('Hello, {{name}}!');
        expect(allPrompts['2'].template).to.equal('Goodbye, {{name}}!');
        expect(allPrompts['3'].template).to.equal('Ciao, {{invalid}}!');
        expect(allPrompts['8'].template).to.equal('Hello, {{{name}}}');
    });

    it('should retrieve raw prompt by id', () => {
        const rawPrompt = promptService.getRawPrompt('1');
        expect(rawPrompt?.template).to.equal('Hello, {{name}}!');
    });

    it('should format prompt with provided arguments', async () => {
        const formattedPrompt = await promptService.getPrompt('1', { name: 'John' });
        expect(formattedPrompt?.text).to.equal('Hello, John!');
    });

    it('should store a new prompt', () => {
        promptService.storePrompt('3', 'Welcome, {{name}}!');
        const newPrompt = promptService.getRawPrompt('3');
        expect(newPrompt?.template).to.equal('Welcome, {{name}}!');
    });

    it('should replace placeholders with provided arguments', async () => {
        const prompt = await promptService.getPrompt('1', { name: 'John' });
        expect(prompt?.text).to.equal('Hello, John!');
    });

    it('should use variable service to resolve placeholders if argument value is not provided', async () => {
        const prompt = await promptService.getPrompt('1');
        expect(prompt?.text).to.equal('Hello, Jane!');
    });

    it('should return the prompt even if there are no replacements', async () => {
        const prompt = await promptService.getPrompt('3');
        expect(prompt?.text).to.equal('Ciao, {{invalid}}!');
    });

    it('should return undefined if the prompt id is not found', async () => {
        const prompt = await promptService.getPrompt('4');
        expect(prompt).to.be.undefined;
    });

    it('should ignore whitespace in variables', async () => {
        promptService.storePrompt('4', 'Hello, {{name }}!');
        promptService.storePrompt('5', 'Hello, {{ name}}!');
        promptService.storePrompt('6', 'Hello, {{ name }}!');
        promptService.storePrompt('7', 'Hello, {{       name           }}!');
        for (let i = 4; i <= 7; i++) {
            const prompt = await promptService.getPrompt(`${i}`, { name: 'John' });
            expect(prompt?.text).to.equal('Hello, John!');
        }
    });

    it('should retrieve raw prompt by id (three bracket)', () => {
        const rawPrompt = promptService.getRawPrompt('8');
        expect(rawPrompt?.template).to.equal('Hello, {{{name}}}');
    });

    it('should correctly replace variables (three brackets)', async () => {
        const formattedPrompt = await promptService.getPrompt('8');
        expect(formattedPrompt?.text).to.equal('Hello, Jane');
    });

    it('should ignore whitespace in variables (three bracket)', async () => {
        promptService.storePrompt('9', 'Hello, {{{name }}}');
        promptService.storePrompt('10', 'Hello, {{{ name}}}');
        promptService.storePrompt('11', 'Hello, {{{ name }}}');
        promptService.storePrompt('12', 'Hello, {{{       name           }}}');
        for (let i = 9; i <= 12; i++) {
            const prompt = await promptService.getPrompt(`${i}`, { name: 'John' });
            expect(prompt?.text).to.equal('Hello, John');
        }
    });

    it('should ignore invalid prompts with unmatched brackets', async () => {
        promptService.storePrompt('9', 'Hello, {{name');
        promptService.storePrompt('10', 'Hello, {{{name');
        promptService.storePrompt('11', 'Hello, name}}}}');
        const prompt1 = await promptService.getPrompt('9', { name: 'John' });
        expect(prompt1?.text).to.equal('Hello, {{name'); // Not matching due to missing closing brackets

        const prompt2 = await promptService.getPrompt('10', { name: 'John' });
        expect(prompt2?.text).to.equal('Hello, {{{name'); // Matches pattern due to valid three-start-two-end brackets

        const prompt3 = await promptService.getPrompt('11', { name: 'John' });
        expect(prompt3?.text).to.equal('Hello, name}}}}'); // Extra closing bracket, does not match cleanly
    });

    it('should handle a mixture of two and three brackets correctly', async () => {
        promptService.storePrompt('12', 'Hi, {{name}}}');            // (invalid)
        promptService.storePrompt('13', 'Hello, {{{name}}');         // (invalid)
        promptService.storePrompt('14', 'Greetings, {{{name}}}}');   // (invalid)
        promptService.storePrompt('15', 'Bye, {{{{name}}}');         // (invalid)
        promptService.storePrompt('16', 'Ciao, {{{{name}}}}');       // (invalid)
        promptService.storePrompt('17', 'Hi, {{name}}! {{{name}}}'); // Mixed valid patterns

        const prompt12 = await promptService.getPrompt('12', { name: 'John' });
        expect(prompt12?.text).to.equal('Hi, {{name}}}');

        const prompt13 = await promptService.getPrompt('13', { name: 'John' });
        expect(prompt13?.text).to.equal('Hello, {{{name}}');

        const prompt14 = await promptService.getPrompt('14', { name: 'John' });
        expect(prompt14?.text).to.equal('Greetings, {{{name}}}}');

        const prompt15 = await promptService.getPrompt('15', { name: 'John' });
        expect(prompt15?.text).to.equal('Bye, {{{{name}}}');

        const prompt16 = await promptService.getPrompt('16', { name: 'John' });
        expect(prompt16?.text).to.equal('Ciao, {{{{name}}}}');

        const prompt17 = await promptService.getPrompt('17', { name: 'John' });
        expect(prompt17?.text).to.equal('Hi, John! John');
    });
});
