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
import { Container } from 'inversify';
import { PromptService, PromptServiceImpl, PromptCollectionService, PromptCollectionServiceImpl } from '../prompt-service';
import { stub } from 'sinon';
import { expect } from 'chai';

describe('PromptService', () => {
    let promptService: PromptService;

    beforeEach(() => {
        const container = new Container();
        container.bind<PromptService>(PromptService).to(PromptServiceImpl).inSingletonScope();

        const promptCollectionService = new PromptCollectionServiceImpl();

        // Mock the getAllPrompts method
        stub(promptCollectionService, 'getAllPrompts').returns([
            { id: '1', template: 'Hello, ${name}!' },
            { id: '2', template: 'Goodbye, ${name}!' }
        ]);

        container.bind<PromptCollectionService>(PromptCollectionService).toConstantValue(promptCollectionService);
        promptService = container.get<PromptService>(PromptService);
    });

    it('should initialize prompts from PromptCollectionService', () => {
        const allPrompts = promptService.getAllPrompts();
        expect(allPrompts['1'].template).to.equal('Hello, ${name}!');
        expect(allPrompts['2'].template).to.equal('Goodbye, ${name}!');
    });

    it('should retrieve raw prompt by id', () => {
        const rawPrompt = promptService.getRawPrompt('1');
        expect(rawPrompt?.template).to.equal('Hello, ${name}!');
    });

    it('should format prompt with provided arguments', () => {
        const formattedPrompt = promptService.getPrompt('1', { name: 'John' });
        expect(formattedPrompt).to.equal('Hello, John!');
    });

    it('should store a new prompt', () => {
        promptService.storePrompt('3', 'Welcome, ${name}!');
        const newPrompt = promptService.getRawPrompt('3');
        expect(newPrompt?.template).to.equal('Welcome, ${name}!');
    });
});
