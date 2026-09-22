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

import { Agent, AgentService, AIVariable, AIVariableService, matchVariablesRegEx, PromptText } from '@theia/ai-core/lib/common';
import { Emitter, Event, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import { AgentChip } from './agent-chips';
import {
    CollapsibleGroup,
    CollapsibleList,
    CollapsibleRow,
    CollapsibleRowAction
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/collapsible-list';

/**
 * The Variables category: a `single-page` category that renders every variable as a flat,
 * expandable list rather than a tree of nodes with per-item detail pages. Each row shows the
 * variable reference, a one-line description and count pills for its arguments and the agents
 * that use it at a glance; expanding a row reveals the full description, its id, its arguments
 * and the agents that use it as chips. Variables are read-only, so a dedicated detail page per
 * item would be more navigation than the payload warrants.
 */
@injectable()
export class VariablesConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.VARIABLES;
    readonly label = nls.localizeByDefault('Variables');
    readonly description = nls.localize(
        'theia/ai/ide/variableConfiguration/pageSubtitle',
        'Values you can reference with {0}name in a prompt. They are resolved and inserted at request time.',
        PromptText.VARIABLE_CHAR
    );
    readonly iconClass = codicon('symbol-variable');
    readonly order = AiConfigurationCategoryOrder.VARIABLES;
    readonly kind = 'single-page' as const;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    get renderer(): this {
        return this;
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.variableService.onDidChangeVariables(() => this.onDidChangeEmitter.fire()),
            this.agentService.onDidChangeAgents(() => this.onDidChangeEmitter.fire())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected getVariables(): AIVariable[] {
        return this.variableService.getVariables().sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Computes, per agent, which variables it uses: those explicitly declared in {@link Agent.variables}
     * (matched by id) plus those referenced in its prompt templates as `{{name}}` (matched by name).
     * Declared globals are rarely populated in practice, so the prompt-template references are the
     * signal that actually surfaces the "used by" chips.
     */
    protected computeAgentUsage(): VariableAgentUsage[] {
        return this.agentService.getAllAgents()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(agent => ({
                agent,
                declaredIds: new Set(agent.variables ?? []),
                referencedNames: this.getReferencedVariableNames(agent)
            }));
    }

    /** Variable names referenced as `{{name}}` (or `{{name:arg}}`) across the agent's prompt templates. */
    protected getReferencedVariableNames(agent: Agent): Set<string> {
        const names = new Set<string>();
        for (const promptVariantSet of agent.prompts ?? []) {
            const fragments = [promptVariantSet.defaultVariant, ...(promptVariantSet.variants ?? [])];
            for (const fragment of fragments) {
                if (!fragment?.template) {
                    continue;
                }
                for (const match of matchVariablesRegEx(fragment.template)) {
                    const name = match[1].split(PromptText.VARIABLE_SEPARATOR_CHAR, 2)[0].trim();
                    if (name) {
                        names.add(name);
                    }
                }
            }
        }
        return names;
    }

    protected getAgentsForVariable(variable: AIVariable, usage: VariableAgentUsage[]): Agent[] {
        return usage
            .filter(entry => entry.declaredIds.has(variable.id) || entry.referencedNames.has(variable.name))
            .map(entry => entry.agent);
    }

    /** The prompt reference used to insert the variable, e.g. `#file`. */
    protected getVariableReference(variable: AIVariable): string {
        return `${PromptText.VARIABLE_CHAR}${variable.name}`;
    }

    /**
     * Case-insensitive match of a variable against the filter query, testing both the variable name
     * and its description. An empty (or whitespace-only) query matches everything.
     */
    matchesVariable(variable: AIVariable, query: string): boolean {
        const needle = query.trim().toLocaleLowerCase();
        if (!needle) {
            return true;
        }
        const haystack = `${variable.name} ${VariablesConfigurationCategory.normalizeDescription(variable.description)}`.toLocaleLowerCase();
        return haystack.includes(needle);
    }

    protected buildRow(variable: AIVariable, usage: VariableAgentUsage[], onOpenAgent: (agentId: string) => void): CollapsibleRow {
        const reference = this.getVariableReference(variable);
        const description = VariablesConfigurationCategory.normalizeDescription(variable.description);
        const agents = this.getAgentsForVariable(variable, usage);
        const argCount = variable.args?.length ?? 0;
        const pills: string[] = [];
        if (argCount > 0) {
            pills.push(argCount === 1
                ? nls.localize('theia/ai/ide/variableConfiguration/argCountSingular', '1 argument')
                : nls.localize('theia/ai/ide/variableConfiguration/argCountPlural', '{0} arguments', argCount));
        }
        if (agents.length > 0) {
            pills.push(agents.length === 1 ? nls.localizeByDefault('1 agent') : nls.localizeByDefault('{0} agents', agents.length));
        }
        return {
            id: variable.id,
            title: reference,
            description,
            pills,
            filterText: `${variable.name} ${description}`.toLocaleLowerCase(),
            actions: <CopyReferenceButton onCopy={() => this.copyReference(variable)} />,
            body: <>
                <div className='ai-variable-id-row'>
                    <span className='ai-variable-id-label'>{nls.localizeByDefault('ID')}</span>
                    <code className='ai-variable-id-value'>{variable.id}</code>
                </div>
                {argCount > 0 && <VariableArgs variable={variable} />}
                {agents.length > 0 && <UsedByAgents agents={agents} onOpenAgent={onOpenAgent} />}
            </>
        };
    }

    /** Copies the variable's prompt reference (e.g. `#file`) to the clipboard. */
    protected copyReference(variable: AIVariable): void {
        this.clipboardService.writeText(this.getVariableReference(variable));
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        const variables = this.getVariables();
        const usage = this.computeAgentUsage();
        const onOpenAgent = (agentId: string): void => ctx.navigate({ categoryId: AiConfigurationCategoryId.AGENTS, itemId: agentId });
        const groups: CollapsibleGroup[] = [
            {
                id: 'context',
                title: nls.localize('theia/ai/ide/variableConfiguration/contextGroup', 'Context Variables'),
                description: nls.localize(
                    'theia/ai/ide/variableConfiguration/contextGroupDescription',
                    'Referenced with {0}name in a prompt and also attachable to a request as context that the agent and its tools can inspect.',
                    PromptText.VARIABLE_CHAR
                ),
                rows: variables.filter(variable => variable.isContextVariable).map(variable => this.buildRow(variable, usage, onOpenAgent))
            },
            {
                id: 'plain',
                title: nls.localize('theia/ai/ide/variableConfiguration/plainGroup', 'Plain Variables'),
                description: nls.localize(
                    'theia/ai/ide/variableConfiguration/plainGroupDescription',
                    'Referenced with {0}name in a prompt and resolved inline to a text value at request time.',
                    PromptText.VARIABLE_CHAR
                ),
                rows: variables.filter(variable => !variable.isContextVariable).map(variable => this.buildRow(variable, usage, onOpenAgent))
            }
        ];
        return <CollapsibleList
            groups={groups}
            filterPlaceholder={nls.localize('theia/ai/ide/variableConfiguration/filterPlaceholder', 'Filter variables by name or description')}
            emptyMessage={nls.localize('theia/ai/ide/variableConfiguration/noVariables', 'No variables are available.')}
            filterEmptyMessage={query => nls.localize('theia/ai/ide/variableConfiguration/noMatches', 'No variables match "{0}".', query)}
        />;
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const typeLabel = nls.localizeByDefault('Variable');
        return this.getVariables().map(variable => ({
            label: variable.name,
            typeLabel,
            categoryId: this.id,
            target: { categoryId: this.id, highlight: { rowId: variable.id } },
            keywords: `${variable.id} ${variable.description ?? ''}`
        } satisfies AiConfigurationSearchItem));
    }

    /**
     * Trims and collapses internal whitespace in a description. Descriptions are contributed by
     * third-party extensions, so they may contain runs of whitespace from indented template literals.
     */
    static normalizeDescription(text?: string): string {
        return (text ?? '').replace(/\s+/g, ' ').trim();
    }
}

/** An agent together with the variables it uses, resolved once per render. */
interface VariableAgentUsage {
    readonly agent: Agent;
    /** Ids of variables the agent explicitly declares in {@link Agent.variables}. */
    readonly declaredIds: Set<string>;
    /** Names of variables the agent references in its prompt templates. */
    readonly referencedNames: Set<string>;
}

/** A copy-to-clipboard affordance for the variable reference, briefly swapping to a check on success. */
const CopyReferenceButton: React.FC<{ onCopy: () => void }> = ({ onCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    React.useEffect(() => () => {
        if (timeoutRef.current !== undefined) {
            clearTimeout(timeoutRef.current);
        }
    }, []);
    const label = nls.localize('theia/ai/ide/variableConfiguration/copyVariableName', 'Copy variable name');
    return <>
        <CollapsibleRowAction
            iconClass={codicon(copied ? 'check' : 'copy')}
            label={label}
            onActivate={() => {
                onCopy();
                setCopied(true);
                if (timeoutRef.current !== undefined) {
                    clearTimeout(timeoutRef.current);
                }
                timeoutRef.current = setTimeout(() => setCopied(false), 1500);
            }}
        />
        {/* Announce the copy to assistive tech; the region is always present so the change is spoken. */}
        <span className='ai-variable-visually-hidden' aria-live='polite'>{copied ? nls.localizeByDefault('Copied') : ''}</span>
    </>;
};

const VariableArgs: React.FC<{ variable: AIVariable }> = ({ variable }) => {
    if (!variable.args || variable.args.length === 0) {
        return undefined;
    }
    return <div className='ai-variable-section'>
        <div className='ai-variable-section-label'>{nls.localizeByDefault('Arguments')}</div>
        <div className='ai-variable-args-container'>
            {variable.args.map(arg => <div key={arg.name} className='ai-variable-arg-row'>
                <code className='ai-variable-arg-name'>{arg.name}</code>
                <span className={`ai-variable-arg-badge ${arg.isOptional ? 'optional' : 'required'}`}>
                    {arg.isOptional
                        ? nls.localize('theia/ai/ide/variableConfiguration/optional', 'optional')
                        : nls.localize('theia/ai/ide/variableConfiguration/required', 'required')}
                </span>
                <div className='ai-variable-arg-description'>
                    {VariablesConfigurationCategory.normalizeDescription(arg.description)}
                    {arg.enum && arg.enum.length > 0 && <span className='ai-variable-arg-enum'>
                        {nls.localize('theia/ai/ide/variableConfiguration/argEnum', 'One of: {0}', arg.enum.join(', '))}
                    </span>}
                </div>
            </div>)}
        </div>
    </div>;
};

/** The agents that reference the variable, rendered as navigable chips. */
const UsedByAgents: React.FC<{ agents: Agent[]; onOpenAgent: (agentId: string) => void }> = ({ agents, onOpenAgent }) =>
    <div className='ai-variable-section'>
        <div className='ai-variable-section-label'>{nls.localize('theia/ai/ide/variableConfiguration/usedByAgents', 'Used by Agents')}</div>
        <div className='ai-variable-agent-chips'>
            {agents.map(agent => <AgentChip key={agent.id} agent={agent} onOpenAgent={onOpenAgent} />)}
        </div>
    </div>;

