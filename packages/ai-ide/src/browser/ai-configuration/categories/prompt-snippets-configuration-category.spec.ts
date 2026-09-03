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
import { createRoot } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { Agent } from '@theia/ai-core';
import { GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID } from '@theia/ai-core/lib/common';
import { PromptFragment } from '@theia/ai-core/lib/common/prompt-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { PromptSnippetEntry, PromptSnippetsConfiguration, PromptSnippetsConfigurationCategory } from './prompt-snippets-configuration-category';

disableJSDOM();

describe('PromptSnippetsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    interface Setup {
        /** `id -> fragments`, as `getAllPromptFragments` returns them (customizations first, built-in last). */
        fragments?: Record<string, Partial<PromptFragment>[]>;
        /** `variantSetId -> variantIds`, as `getPromptVariantSets` returns them. */
        variantSets?: Record<string, string[]>;
        /** `agentId -> template of its single prompt`, used to resolve `{{capability:...}}` references. */
        agentTemplates?: Record<string, string>;
    }

    function loadEntries({ fragments = {}, variantSets = {}, agentTemplates = {} }: Setup): PromptSnippetEntry[] {
        const category = new PromptSnippetsConfigurationCategory();
        const withIds = new Map<string, PromptFragment[]>(
            Object.entries(fragments).map(([id, list]) => [id, list.map(fragment => ({ id, template: '', ...fragment }) as PromptFragment)])
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptService = {
            getAllPromptFragments: () => withIds,
            getPromptVariantSets: () => new Map(Object.entries(variantSets)),
            // The effective fragment is the first entry, mirroring the service's priority order.
            getRawPromptFragment: (id: string) => withIds.get(id)?.[0],
            getEffectiveVariantId: (id: string) => id
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).availableAgents = Object.keys(agentTemplates).map(agentId => ({
            id: agentId,
            prompts: [{ id: `${agentId}-prompt` }]
        }) as unknown as Agent);
        for (const [agentId, template] of Object.entries(agentTemplates)) {
            withIds.set(`${agentId}-prompt`, [{ id: `${agentId}-prompt`, template } as PromptFragment]);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (category as any).loadEntries();
    }

    it('declares the prompt snippets single-page metadata', () => {
        const category = new PromptSnippetsConfigurationCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.PROMPT_SNIPPETS);
        expect(category.kind).to.equal('single-page');
    });

    it('groups a fragment referenced as a capability under capabilities, and records the agents using it', () => {
        const entries = loadEntries({
            fragments: { github: [{ name: 'GitHub', description: 'talks to GitHub' }] },
            agentTemplates: { coder: 'do work {{capability:github default on}}', architect: 'plan {{capability:github}}' }
        });
        const github = entries.find(entry => entry.id === 'github');

        expect(github?.kind).to.equal('capability');
        expect(github?.agentIds).to.deep.equal(['coder', 'architect']);
    });

    it('groups the fixed generic capability ids as generic, even when an agent references one as a capability', () => {
        const entries = loadEntries({
            fragments: { [GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID]: [{}] },
            agentTemplates: { coder: `x {{capability:${GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID}}}` }
        });

        expect(entries.find(entry => entry.id === GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID)?.kind).to.equal('generic-capability');
    });

    it('treats declared frontmatter as a capability even when no agent references it yet', () => {
        const entries = loadEntries({ fragments: { 'shell-execution': [{ name: 'Shell Execution' }] } });

        expect(entries.find(entry => entry.id === 'shell-execution')?.kind).to.equal('capability');
    });

    it('groups a plain fragment without frontmatter as a snippet', () => {
        const entries = loadEntries({ fragments: { 'project-info': [{ customizationId: 'workspace', priority: 1 }] } });
        const snippet = entries.find(entry => entry.id === 'project-info');

        expect(snippet?.kind).to.equal('snippet');
        // Only a workspace file backs it, so resetting has nothing to fall back to: the row offers Remove.
        expect(snippet?.customized).to.equal(true);
        expect(snippet?.hasBuiltIn).to.equal(false);
    });

    it('reports a customized built-in as customized while keeping its built-in fallback', () => {
        const entries = loadEntries({ fragments: { github: [{ customizationId: 'user', priority: 1, name: 'GitHub' }, { name: 'GitHub' }] } });
        const github = entries.find(entry => entry.id === 'github');

        expect(github?.customized).to.equal(true);
        expect(github?.hasBuiltIn).to.equal(true);
    });

    it('excludes what other pages own: variant sets and their variants, slash commands, and generated MCP tool lists', () => {
        const entries = loadEntries({
            fragments: {
                'coder-system': [{}],
                'coder-system-edit': [{}],
                'remember-conversation-context': [{ isCommand: true, commandName: 'remember' }],
                // A customization that lost the `isCommand` frontmatter must still not resurface here.
                'skill-command-refactor': [{ customizationId: 'user', priority: 1 }, { isCommand: true, commandName: 'refactor' }],
                'mcp_github_tools': [{}],
                'project-info': [{}]
            },
            variantSets: { 'coder-system': ['coder-system-edit'] }
        });

        expect(entries.map(entry => entry.id)).to.deep.equal(['project-info']);
    });

    it('counts the agents using a fragment in its pills, after the customization state', () => {
        const category = new PromptSnippetsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).availableAgents = [{ id: 'coder', name: 'Coder' }, { id: 'architect', name: 'Architect' }] as unknown as Agent[];
        const build = (agentIds: string[], customized: boolean) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).buildRow(
                { id: 'github', kind: 'capability', agentIds, customized, hasBuiltIn: true } as PromptSnippetEntry,
                { scope: 'user', navigate: () => { }, update: () => { } },
                () => { }
            );

        expect(build(['coder'], false).pills).to.deep.equal(['1 agent']);
        expect(build(['coder', 'architect'], false).pills).to.deep.equal(['2 agents']);
        // The customization state leads, so it reads before the agent count and the actions.
        expect(build(['coder'], true).pills).to.deep.equal(['Customized', '1 agent']);
    });

    it('offers its actions in the row header, whether or not the row is expanded', () => {
        const category = new PromptSnippetsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).availableAgents = [];
        const build = (customized: boolean, hasBuiltIn: boolean) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).buildRow(
                { id: 'github', kind: 'capability', agentIds: [], customized, hasBuiltIn } as PromptSnippetEntry,
                { scope: 'user', navigate: () => { }, update: () => { } },
                () => { }
            );

        expect(build(false, true).actions).to.not.equal(undefined);
        expect(build(true, false).actions).to.not.equal(undefined);
    });

    it('indexes every entry for search under one row-id scheme, so a deep link only needs the fragment id', () => {
        const category = new PromptSnippetsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).entries = [
            { id: 'project-info', kind: 'snippet', agentIds: [], customized: false, hasBuiltIn: true },
            { id: 'github', kind: 'capability', name: 'GitHub', agentIds: ['coder'], customized: false, hasBuiltIn: true },
            { id: GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID, kind: 'generic-capability', agentIds: [], customized: false, hasBuiltIn: true }
        ] as PromptSnippetEntry[];
        const items = category.getSearchItems();

        expect(items.map(item => item.target.highlight?.rowId)).to.deep.equal([
            'fragment:project-info',
            'fragment:github',
            `fragment:${GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID}`
        ]);
        expect(items.map(item => item.label)).to.deep.equal(['project-info', 'GitHub', GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID]);
        expect(new Set(items.map(item => item.typeLabel)).size).to.equal(3);
        expect(items.every(item => item.target.categoryId === AiConfigurationCategoryId.PROMPT_SNIPPETS)).to.equal(true);
    });

    it('anchors each rendered row with the id the search item and the agent capability link navigate to', () => {
        const category = new PromptSnippetsConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).availableAgents = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).entries = [
            { id: 'project-info', kind: 'snippet', agentIds: [], customized: true, hasBuiltIn: false },
            { id: 'github', kind: 'capability', name: 'GitHub', agentIds: [], customized: false, hasBuiltIn: true }
        ] as PromptSnippetEntry[];
        // The page asks the service whether a page-level reset would do anything while rendering.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).promptService = { getAllPromptFragments: () => new Map<string, PromptFragment[]>() };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        try {
            flushSync(() => root.render(category.renderPage({ scope: 'user', navigate: () => { }, update: () => { } })));
            const anchored = Array.from(container.querySelectorAll('[data-ai-config-row-id]'))
                .map(element => element.getAttribute('data-ai-config-row-id'));

            // Without the anchor the scroll-and-flash silently does nothing when navigated to from an agent.
            expect(anchored).to.include(PromptSnippetsConfiguration.selectionFor('github').highlight!.rowId);
            expect(anchored).to.include(PromptSnippetsConfiguration.selectionFor('project-info').highlight!.rowId);
        } finally {
            flushSync(() => root.unmount());
            container.remove();
        }
    });

    it('offers the page-level reset whenever a customized fragment has a built-in to fall back to', () => {
        const category = new PromptSnippetsConfigurationCategory();
        const withFragments = (fragments: Record<string, Partial<PromptFragment>[]>) => {
            const map = new Map<string, PromptFragment[]>(
                Object.entries(fragments).map(([id, list]) => [id, list.map(f => ({ id, template: '', ...f }) as PromptFragment)])
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (category as any).promptService = { getAllPromptFragments: () => map };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (category as any).hasResettableCustomizations() as boolean;
        };

        // A customized built-in: resetting reverts it.
        expect(withFragments({ github: [{ customizationId: 'user', priority: 1 }, {}] })).to.equal(true);
        // Also true for a prompt variant the page itself does not list, since the reset covers those too.
        expect(withFragments({ 'coder-system-agent-mode': [{ customizationId: 'user', priority: 1 }, {}] })).to.equal(true);
        // A user-authored snippet has no built-in, so a reset would do nothing to it.
        expect(withFragments({ 'project-info': [{ customizationId: 'workspace', priority: 1 }] })).to.equal(false);
        expect(withFragments({ github: [{}] })).to.equal(false);
    });

    it('builds the same row id the agent capability deep link navigates to', () => {
        const selection = PromptSnippetsConfiguration.selectionFor('github');

        expect(selection.categoryId).to.equal(AiConfigurationCategoryId.PROMPT_SNIPPETS);
        expect(selection.highlight?.rowId).to.equal('fragment:github');
    });
});
