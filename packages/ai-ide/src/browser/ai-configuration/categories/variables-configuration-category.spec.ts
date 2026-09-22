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

import { expect } from 'chai';
import { Agent, AgentService, AIVariable, AIVariableService } from '@theia/ai-core/lib/common';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { VariablesConfigurationCategory } from './variables-configuration-category';

disableJSDOM();

function variable(id: string, name: string, description = ''): AIVariable {
    return { id, name, description } as unknown as AIVariable;
}

function agent(id: string, name: string, options: { variables?: string[]; templates?: string[] } = {}): Agent {
    return {
        id,
        name,
        variables: options.variables ?? [],
        prompts: (options.templates ?? []).map((template, index) => ({ id: `${id}-${index}`, defaultVariant: { id: `${id}-${index}-v`, template } }))
    } as unknown as Agent;
}

function createCategory(variables: AIVariable[], agents: Agent[] = []): VariablesConfigurationCategory {
    const category = new VariablesConfigurationCategory();
    const variableService: Partial<AIVariableService> = { getVariables: () => variables };
    const agentService: Partial<AgentService> = { getAllAgents: () => agents };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).variableService = variableService;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).agentService = agentService;
    return category;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function agentsForVariable(category: VariablesConfigurationCategory, target: AIVariable): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCategory = category as any;
    return anyCategory.getAgentsForVariable(target, anyCategory.computeAgentUsage()).map((a: Agent) => a.id);
}

describe('VariablesConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the variables single-page metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.VARIABLES);
        expect(category.kind).to.equal('single-page');
        expect(category.renderer).to.equal(category);
    });

    it('indexes one search item per variable, sorted by name and highlighting the row', () => {
        const items = createCategory([variable('b', 'Beta'), variable('a', 'Alpha', 'the alpha')]).getSearchItems();
        expect(items.map(i => i.label)).to.deep.equal(['Alpha', 'Beta']);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.VARIABLES, highlight: { rowId: 'a' } });
        expect(items[0].keywords).to.contain('a').and.to.contain('the alpha');
    });

    it('associates an agent with a variable referenced in its prompt template', () => {
        const productName = variable('product-name-provider', 'productName');
        const category = createCategory([productName], [
            agent('coder', 'Coder', { templates: ['You are running in {{productName}} today.'] }),
            agent('other', 'Other', { templates: ['References {{today}} only.'] })
        ]);
        expect(agentsForVariable(category, productName)).to.deep.equal(['coder']);
    });

    it('associates an agent that declares the variable id in Agent.variables', () => {
        const file = variable('file-provider', 'file');
        const category = createCategory([file], [agent('coder', 'Coder', { variables: ['file-provider'] })]);
        expect(agentsForVariable(category, file)).to.deep.equal(['coder']);
    });

    it('ignores template references with an argument suffix beyond the variable name', () => {
        const file = variable('file-provider', 'file');
        const category = createCategory([file], [agent('coder', 'Coder', { templates: ['Content: {{file:/tmp/x.ts}}'] })]);
        expect(agentsForVariable(category, file)).to.deep.equal(['coder']);
    });

    describe('filter matching', () => {
        const category = createCategory([]);

        it('matches everything for an empty or whitespace-only query', () => {
            const file = variable('file-provider', 'file', 'The current file');
            expect(category.matchesVariable(file, '')).to.be.true;
            expect(category.matchesVariable(file, '   ')).to.be.true;
        });

        it('matches the variable name case-insensitively', () => {
            const file = variable('file-provider', 'file', 'The current file');
            expect(category.matchesVariable(file, 'FIL')).to.be.true;
        });

        it('matches the description case-insensitively', () => {
            const file = variable('file-provider', 'file', 'The Current File');
            expect(category.matchesVariable(file, 'current')).to.be.true;
        });

        it('does not match when neither name nor description contain the query', () => {
            const file = variable('file-provider', 'file', 'The current file');
            expect(category.matchesVariable(file, 'agent')).to.be.false;
        });
    });

    describe('description normalization', () => {
        it('collapses runs of whitespace and trims', () => {
            expect(VariablesConfigurationCategory.normalizeDescription('  The absolute path of the      currently opened file. '))
                .to.equal('The absolute path of the currently opened file.');
        });

        it('returns an empty string for an undefined description', () => {
            expect(VariablesConfigurationCategory.normalizeDescription(undefined)).to.equal('');
        });

        it('matches variables whose description contains collapsible whitespace', () => {
            const spaced = variable('file-provider', 'file', 'The absolute path of the      current file.');
            expect(createCategory([]).matchesVariable(spaced, 'path of the current')).to.be.true;
        });
    });

    describe('copy reference', () => {
        it('copies the prompt reference of the variable to the clipboard', () => {
            const written: string[] = [];
            const category = createCategory([]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).clipboardService = { writeText: (text: string) => written.push(text) };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).copyReference(variable('file-provider', 'file'));
            expect(written).to.deep.equal(['#file']);
        });
    });

});
