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

import { Agent, AgentService } from '@theia/ai-core';
import { CAPABILITY_TYPE_PROMPT_MAP, parseCapabilitiesFromTemplate } from '@theia/ai-core/lib/common';
import { isCustomizedPromptFragment, PromptFragment, PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { Emitter, Event, nls } from '@theia/core';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationSelection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import {
    CollapsibleGroup,
    CollapsibleList,
    CollapsibleRow,
    CollapsibleRowAction
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/collapsible-list';
import { PromptCustomizationDialogs } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/prompt-customization-dialogs';
import { AiConfigurationCallout } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AgentChips } from './agent-chips';

/**
 * Fragments generated per running MCP server, named after `McpFrontendService.getPromptTemplateId`.
 * Excluded from this page: they are rebuilt from the live tool list whenever a server starts, so a
 * customization would silently diverge from the tools the server actually offers. The generated tool
 * list is visible on the MCP Servers page instead.
 */
const MCP_TOOL_LIST_FRAGMENT_PATTERN = /^mcp_.+_tools$/;

/** Which group a fragment belongs to, in the order the page renders them. */
export type PromptSnippetKind = 'snippet' | 'capability' | 'generic-capability';

/** One prompt fragment as this page shows it, resolved from the prompt service on load. */
export interface PromptSnippetEntry {
    readonly id: string;
    readonly kind: PromptSnippetKind;
    /** Frontmatter `name`, when the fragment declares one. */
    readonly name?: string;
    /** Frontmatter `description`, when the fragment declares one. */
    readonly description?: string;
    /** A customization currently overrides (or, without a built-in, provides) the text. */
    readonly customized: boolean;
    /** `false` for a fragment that exists only as a user/workspace file, where reset has nothing to fall back to. */
    readonly hasBuiltIn: boolean;
    /** Agents whose selected prompt references this fragment as a capability; empty for plain snippets. */
    readonly agentIds: string[];
}

export namespace PromptSnippetsConfiguration {
    /**
     * Prefix of the `data-ai-config-row-id` of every row on this page, regardless of its group, so that
     * a deep link only needs the fragment id (an agent's capability list, for instance, does not know
     * whether a fragment ends up under Capabilities or Generic Capabilities).
     */
    export const ROW_ID_PREFIX = 'fragment:';

    /** Navigation target that scrolls to and flashes `fragmentId`'s row on this page. */
    export function selectionFor(fragmentId: string): AiConfigurationSelection {
        return {
            categoryId: AiConfigurationCategoryId.PROMPT_SNIPPETS,
            highlight: { rowId: ROW_ID_PREFIX + fragmentId }
        };
    }
}

/**
 * The "Prompt Snippets" category: every prompt fragment that has no other home in this view, as a
 * filterable list of expandable rows in three groups — user-authored snippets, agent capabilities and
 * generic capabilities. Prompt variant sets live in the agent detail, skills and slash commands on the
 * Skills page, so those are filtered out here; what remains would otherwise be uneditable, which is
 * what this page fixes.
 *
 * Capability fragments are global: editing one affects every agent that references it, which is why
 * each row lists the agents using it rather than pretending the text belongs to one of them.
 */
@injectable()
export class PromptSnippetsConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.PROMPT_SNIPPETS;
    readonly label = nls.localize('theia/ai/ide/promptSnippetsConfiguration/label', 'Prompt Snippets');
    readonly description = nls.localize('theia/ai/ide/promptSnippetsConfiguration/description',
        'Reusable prompt text: your own snippets plus the capability snippets agents pull in. Editing a snippet affects every agent that uses it.');
    readonly iconClass = codicon('file-code');
    readonly order = AiConfigurationCategoryOrder.PROMPT_SNIPPETS;
    readonly kind = 'single-page' as const;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected entries: PromptSnippetEntry[] = [];
    protected availableAgents: Agent[] = [];

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.reload();
        this.toDispose.pushAll([
            this.promptService.onPromptsChange(() => {
                this.reload();
                this.onDidChangeEmitter.fire();
            }),
            this.agentService.onDidChangeAgents(() => {
                this.reload();
                this.onDidChangeEmitter.fire();
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected reload(): void {
        this.availableAgents = this.agentService.getAllAgents();
        this.entries = this.loadEntries();
    }

    /**
     * Classifies every registered fragment, dropping those another part of the view already owns.
     * Grouped by {@link PromptSnippetKind} and sorted by display name within each group.
     */
    protected loadEntries(): PromptSnippetEntry[] {
        const capabilityAgents = this.collectCapabilityReferences();
        const genericCapabilityIds = new Set(CAPABILITY_TYPE_PROMPT_MAP.map(({ promptId }) => promptId));
        const ownedElsewhere = this.collectFragmentIdsOwnedElsewhere();
        const entries: PromptSnippetEntry[] = [];
        for (const [id, fragments] of this.promptService.getAllPromptFragments()) {
            if (ownedElsewhere.has(id) || MCP_TOOL_LIST_FRAGMENT_PATTERN.test(id)) {
                continue;
            }
            const effective = this.promptService.getRawPromptFragment(id) ?? fragments[0];
            // Slash commands (including the synthetic ones backing a skill) belong to the Skills page. Checking
            // every fragment, not just the effective one, keeps a command hidden here even if a customization
            // drops the `isCommand` frontmatter.
            if (!effective || fragments.some(fragment => fragment.isCommand)) {
                continue;
            }
            const agentIds = capabilityAgents.get(id) ?? [];
            entries.push({
                id,
                kind: this.classify(id, effective, genericCapabilityIds, agentIds.length > 0),
                name: effective.name,
                description: effective.description,
                customized: fragments.some(fragment => isCustomizedPromptFragment(fragment)),
                hasBuiltIn: fragments.some(fragment => !isCustomizedPromptFragment(fragment)),
                agentIds
            });
        }
        return entries.sort((left, right) => this.displayName(left).localeCompare(this.displayName(right)));
    }

    /**
     * A fragment is a *generic* capability when it is one of the fixed set the chat dropdowns inject
     * (`CAPABILITY_TYPE_PROMPT_MAP` is that single source of truth), and a *capability* when an agent
     * references it as `{{capability:id}}`. Declared frontmatter is accepted as a fallback so that a
     * capability shipped by an extension still groups correctly before any agent template pulls it in.
     */
    protected classify(id: string, fragment: PromptFragment, genericCapabilityIds: Set<string>, referencedByAgent: boolean): PromptSnippetKind {
        if (genericCapabilityIds.has(id)) {
            return 'generic-capability';
        }
        if (referencedByAgent || fragment.name !== undefined || fragment.description !== undefined) {
            return 'capability';
        }
        return 'snippet';
    }

    /**
     * Maps capability fragment id -> ids of the agents referencing it. Mirrors the agent detail page,
     * which parses `{{capability:...}}` out of each agent's selected prompt, so both agree on what
     * counts as a capability. Uses the globally effective variant to stay synchronous; the agent detail
     * additionally honours that agent's own variant selection.
     */
    protected collectCapabilityReferences(): Map<string, string[]> {
        const references = new Map<string, string[]>();
        for (const agent of this.availableAgents) {
            for (const prompt of agent.prompts) {
                const variantId = this.promptService.getEffectiveVariantId(prompt.id) ?? prompt.id;
                const template = this.promptService.getRawPromptFragment(variantId)?.template;
                if (!template) {
                    continue;
                }
                for (const capability of parseCapabilitiesFromTemplate(template)) {
                    const agents = references.get(capability.fragmentId) ?? [];
                    if (!agents.includes(agent.id)) {
                        agents.push(agent.id);
                    }
                    references.set(capability.fragmentId, agents);
                }
            }
        }
        return references;
    }

    /**
     * Fragment ids another part of the view is responsible for: the prompt variant sets and their
     * variants, which the agent detail owns as the single source of truth.
     */
    protected collectFragmentIdsOwnedElsewhere(): Set<string> {
        const owned = new Set<string>();
        for (const [variantSetId, variantIds] of this.promptService.getPromptVariantSets()) {
            owned.add(variantSetId);
            variantIds.forEach(variantId => owned.add(variantId));
        }
        return owned;
    }

    protected displayName(entry: PromptSnippetEntry): string {
        return entry.name ?? entry.id;
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        const onOpenAgent = (agentId: string): void => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId });
        const groups: CollapsibleGroup[] = [
            {
                id: 'snippets',
                title: nls.localizeByDefault('Snippets'),
                description: nls.localize('theia/ai/ide/promptSnippetsConfiguration/snippetsGroupDescription',
                    'Prompt text you maintain yourself, referenced from other prompts with {{prompt:id}}.'),
                rows: this.buildRows('snippet', ctx, onOpenAgent)
            },
            {
                id: 'capabilities',
                title: nls.localizeByDefault('Capabilities'),
                description: nls.localize('theia/ai/ide/promptSnippetsConfiguration/capabilitiesGroupDescription',
                    'Instructions an agent adds to its prompt when enabled. They are shared, so an edit affects every agent using them.'),
                rows: this.buildRows('capability', ctx, onOpenAgent)
            },
            {
                id: 'generic-capabilities',
                title: nls.localize('theia/ai/ide/promptSnippetsConfiguration/genericCapabilitiesGroup', 'Generic Capabilities'),
                description: nls.localize('theia/ai/ide/promptSnippetsConfiguration/genericCapabilitiesGroupDescription',
                    'Basic instructions to integrate the selected capabilities into the agent\'s prompt.  They are shared, so an edit affects every agent using them.'),
                rows: this.buildRows('generic-capability', ctx, onOpenAgent)
            }
        ];
        return <>
            {this.renderResetAllCallout(ctx)}
            <CollapsibleList
                groups={groups}
                filterPlaceholder={nls.localize('theia/ai/ide/promptSnippetsConfiguration/filterPlaceholder', 'Filter prompt snippets by name, id or description')}
                emptyMessage={nls.localize('theia/ai/ide/promptSnippetsConfiguration/empty', 'No prompt snippets are available.')}
                filterEmptyMessage={query => nls.localize('theia/ai/ide/promptSnippetsConfiguration/noMatches', 'No prompt snippets match "{0}".', query)}
            />
        </>;
    }

    /**
     * Page-level reset, as the prompt fragments page it replaces had. Shown only while something is
     * customized, and explicit that it reverts *every* customization — including the agents' prompt
     * variants, which live on their own pages.
     */
    protected renderResetAllCallout(ctx: AiConfigurationRenderContext): React.ReactNode {
        if (!this.hasResettableCustomizations()) {
            return undefined;
        }
        return <AiConfigurationCallout
            message={nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetAllMessage',
                'Some prompt fragments are customized. Resetting reverts every one of them to its built-in version, '
                + 'including the agents\' prompt templates. Snippets that have no built-in version are kept.')}
            action={<button className='theia-button secondary' onClick={() => this.resetAllCustomizations(ctx)}>
                {nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetAll', 'Reset All Customizations')}
            </button>}
        />;
    }

    /**
     * Whether anything would actually be reset. Deliberately not limited to this page's entries: the action
     * reverts every customized fragment that has a built-in, which includes the agents' prompt templates
     * (listed on their own pages), so gating on the rows here would hide it exactly when it is needed.
     */
    protected hasResettableCustomizations(): boolean {
        for (const fragments of this.promptService.getAllPromptFragments().values()) {
            if (fragments.some(fragment => isCustomizedPromptFragment(fragment)) && fragments.some(fragment => !isCustomizedPromptFragment(fragment))) {
                return true;
            }
        }
        return false;
    }

    protected async resetAllCustomizations(ctx: AiConfigurationRenderContext): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetAllDialogTitle', 'Reset All Customizations'),
            msg: nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetAllDialogMsg',
                'Are you sure you want to reset every customized prompt fragment to its built-in version? '
                + 'This includes the agents\' prompt templates, not only the snippets listed here. '
                + 'Snippets that have no built-in version are kept.'),
            ok: nls.localizeByDefault('Reset'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await this.promptService.resetAllToBuiltIn();
            ctx.update();
        }
    }

    protected buildRows(kind: PromptSnippetKind, ctx: AiConfigurationRenderContext, onOpenAgent: (agentId: string) => void): CollapsibleRow[] {
        return this.entries.filter(entry => entry.kind === kind).map(entry => this.buildRow(entry, ctx, onOpenAgent));
    }

    protected buildRow(entry: PromptSnippetEntry, ctx: AiConfigurationRenderContext, onOpenAgent: (agentId: string) => void): CollapsibleRow {
        const agents = this.availableAgents.filter(agent => entry.agentIds.includes(agent.id));
        const pills: string[] = [];
        if (entry.customized) {
            pills.push(nls.localize('theia/ai/ide/promptSnippetsConfiguration/customized', 'Customized'));
        }
        if (agents.length > 0) {
            pills.push(agents.length === 1 ? nls.localizeByDefault('1 agent') : nls.localizeByDefault('{0} agents', agents.length));
        }
        return {
            id: PromptSnippetsConfiguration.ROW_ID_PREFIX + entry.id,
            title: this.displayName(entry),
            description: entry.description,
            pills,
            filterText: `${entry.id} ${entry.name ?? ''} ${entry.description ?? ''}`.toLocaleLowerCase(),
            actions: <>
                <CollapsibleRowAction
                    iconClass={codicon('edit')}
                    label={nls.localize('theia/ai/ide/promptSnippetsConfiguration/editSnippet', 'Edit snippet')}
                    onActivate={() => this.editEntry(entry)}
                />
                {/* A customization of a built-in can be reverted; a snippet that only exists as a file has
                    nothing to revert to, so it offers deletion instead. */}
                {entry.customized && entry.hasBuiltIn && <CollapsibleRowAction
                    iconClass={codicon('discard')}
                    label={nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetSnippet', 'Reset snippet to built-in')}
                    onActivate={() => this.resetEntry(entry, ctx)}
                />}
                {entry.customized && !entry.hasBuiltIn && <CollapsibleRowAction
                    iconClass={codicon('trash')}
                    label={nls.localize('theia/ai/ide/promptSnippetsConfiguration/removeSnippet', 'Remove snippet')}
                    onActivate={() => this.removeEntry(entry, ctx)}
                />}
            </>,
            body: <>
                <div className='ai-variable-id-row'>
                    <span className='ai-variable-id-label'>{nls.localizeByDefault('ID')}</span>
                    <code className='ai-variable-id-value'>{entry.id}</code>
                </div>
                {agents.length > 0 && <div className='ai-variable-section'>
                    <div className='ai-variable-section-label'>
                        {nls.localize('theia/ai/ide/promptSnippetsConfiguration/usedByAgents', 'Used by Agents')}
                    </div>
                    <AgentChips agents={agents} onOpenAgent={onOpenAgent} />
                </div>}
            </>
        };
    }

    /** Opens the effective text: the customization if there is one, otherwise a fresh copy of the built-in. */
    protected editEntry(entry: PromptSnippetEntry): void {
        const fragment = this.promptService.getRawPromptFragment(entry.id);
        if (fragment && isCustomizedPromptFragment(fragment)) {
            this.promptService.editCustomization(fragment.id, fragment.customizationId);
        } else {
            this.promptService.editBuiltInCustomization(entry.id);
        }
    }

    /** Drops all customizations so the built-in text applies again. */
    protected async resetEntry(entry: PromptSnippetEntry, ctx: AiConfigurationRenderContext): Promise<void> {
        await PromptCustomizationDialogs.confirmAndReset(
            this.promptService,
            entry.id,
            nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetDialogTitle', 'Reset Snippet to Built-in'),
            nls.localize('theia/ai/ide/promptSnippetsConfiguration/resetDialogMsg',
                'Are you sure you want to reset the snippet "{0}" to its built-in version? This will remove all customizations.', entry.id)
        );
        ctx.update();
    }

    /** Deletes a snippet that has no built-in behind it, naming the file, since it is gone afterwards. */
    protected async removeEntry(entry: PromptSnippetEntry, ctx: AiConfigurationRenderContext): Promise<void> {
        await PromptCustomizationDialogs.confirmAndRemove(this.promptService, entry.id, {
            title: nls.localize('theia/ai/ide/promptSnippetsConfiguration/removeDialogTitle', 'Remove Snippet'),
            message: ({ type, description }) => description
                ? nls.localize('theia/ai/ide/promptSnippetsConfiguration/removeWithDescDialogMsg',
                    'Are you sure you want to remove the {0} customization for snippet "{1}" ({2})? It has no built-in version, so it will be gone entirely.',
                    type ?? '', entry.id, description)
                : nls.localize('theia/ai/ide/promptSnippetsConfiguration/removeDialogMsg',
                    'Are you sure you want to remove the {0} customization for snippet "{1}"? It has no built-in version, so it will be gone entirely.',
                    type ?? '', entry.id)
        });
        ctx.update();
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const typeLabels: Record<PromptSnippetKind, string> = {
            'snippet': nls.localizeByDefault('Snippet'),
            'capability': nls.localize('theia/ai/ide/promptSnippetsConfiguration/capabilityTypeLabel', 'Capability'),
            'generic-capability': nls.localize('theia/ai/ide/promptSnippetsConfiguration/genericCapabilityTypeLabel', 'Generic capability')
        };
        return this.entries.map(entry => ({
            label: this.displayName(entry),
            typeLabel: typeLabels[entry.kind],
            categoryId: this.id,
            target: PromptSnippetsConfiguration.selectionFor(entry.id),
            keywords: `${entry.id} ${entry.description ?? ''}`
        }));
    }
}
