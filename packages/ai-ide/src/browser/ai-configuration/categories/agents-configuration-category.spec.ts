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
import { URI } from '@theia/core';
import { Agent, AgentService, CustomAgentsLocation } from '@theia/ai-core/lib/common';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AgentsConfigurationCategory } from './agents-configuration-category';

disableJSDOM();

/** Minimal agent fixture; only the fields exercised by the category are populated. */
function agent(id: string, name: string, description = ''): Agent {
    return { id, name, description } as unknown as Agent;
}

function createCategory(agents: Agent[], enabledIds: Set<string>): AgentsConfigurationCategory {
    const category = new AgentsConfigurationCategory();
    const agentService: Partial<AgentService> = {
        getAllAgents: () => agents,
        isEnabled: (agentId: string) => enabledIds.has(agentId)
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).agentService = agentService;
    return category;
}

describe('AgentsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the agents collection metadata', () => {
        const category = createCategory([], new Set());
        expect(category.id).to.equal(AiConfigurationCategoryId.AGENTS);
        expect(category.kind).to.equal('collection');
        expect(category.renderer).to.equal(category);
        expect(category.search).to.equal(category);
    });

    describe('getTreeChildren', () => {
        it('maps agents to tree items with an enabled/disabled status', () => {
            const category = createCategory([agent('a', 'Alpha', 'first'), agent('b', 'Beta')], new Set(['a']));
            const children = category.getTreeChildren();
            expect(children.map(c => c.id)).to.deep.equal(['a', 'b']);
            expect(children[0].label).to.equal('Alpha');
            expect(children[0].description).to.equal('first');
            expect(children[0].status?.kind).to.equal('on');
            expect(children[1].status?.kind).to.equal('off');
        });
    });

    describe('getSearchItems', () => {
        it('indexes the Default Chat Agent setting and one item per agent', () => {
            const category = createCategory([agent('a', 'Alpha', 'the alpha agent')], new Set());
            const items = category.getSearchItems();

            // Category-level settings target the category itself; agent items carry an itemId.
            const settings = items.filter(item => item.target.itemId === undefined);
            const agentItems = items.filter(item => item.target.itemId !== undefined);

            expect(agentItems).to.have.lengthOf(1);
            expect(settings.some(setting => (setting.keywords ?? '').includes('ai-features.chat.defaultChatAgent'))).to.equal(true);
            expect(settings.every(setting => setting.target.categoryId === AiConfigurationCategoryId.AGENTS)).to.equal(true);

            const agentItem = agentItems[0];
            expect(agentItem.label).to.equal('Alpha');
            expect(agentItem.target).to.deep.equal({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: 'a' });
            expect(agentItem.keywords).to.contain('a').and.to.contain('the alpha agent');
        });
    });

    describe('selectAgentScopeOptions', () => {
        const agentsDir = (scope: string): CustomAgentsLocation =>
            ({ uri: new URI(`file:///ws/${scope}`).resolve('agents'), exists: false, kind: 'agents-dir' });
        const existingAgentsDir = (scope: string): CustomAgentsLocation =>
            ({ uri: new URI(`file:///ws/${scope}`).resolve('agents'), exists: true, kind: 'agents-dir' });
        const legacyYaml = (scope: string): CustomAgentsLocation =>
            ({ uri: new URI(`file:///ws/${scope}`).resolve('customAgents.yml'), exists: false, kind: 'legacy-yaml' });

        const select = (locations: CustomAgentsLocation[]): string[] =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (new AgentsConfigurationCategory() as any).selectAgentScopeOptions(locations).map((o: { scopeDir: URI }) => o.scopeDir.path.toString());

        it('keeps only the default .agents scope when no scope has an agents folder', () => {
            const locations = [agentsDir('.agents'), legacyYaml('.agents'), agentsDir('.prompts'), legacyYaml('.prompts')];
            expect(select(locations)).to.deep.equal(['/ws/.agents']);
        });

        it('keeps a non-default scope that already contains an agents folder', () => {
            const locations = [agentsDir('.agents'), legacyYaml('.agents'), existingAgentsDir('.prompts'), legacyYaml('.prompts')];
            expect(select(locations)).to.deep.equal(['/ws/.agents', '/ws/.prompts']);
        });

        it('ignores legacy customAgents.yml entries', () => {
            const locations = [agentsDir('.agents'), legacyYaml('.agents')];
            expect(select(locations)).to.deep.equal(['/ws/.agents']);
        });
    });
});
