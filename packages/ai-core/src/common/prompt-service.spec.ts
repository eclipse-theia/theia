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
    });

    it('should initialize prompts from PromptCollectionService', () => {
        const allPrompts = promptService.getAllPrompts();
        expect(allPrompts['1'].template).to.equal('Hello, {{name}}!');
        expect(allPrompts['2'].template).to.equal('Goodbye, {{name}}!');
        expect(allPrompts['3'].template).to.equal('Ciao, {{invalid}}!');
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
});
