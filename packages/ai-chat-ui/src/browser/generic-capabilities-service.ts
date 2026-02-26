// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable, named, optional, postConstruct } from '@theia/core/shared/inversify';
import { ContributionProvider, Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import { SkillService } from '@theia/ai-core/lib/browser';
import {
    AIVariable,
    CapabilityType,
    GenericCapabilitiesContribution,
    GenericCapabilityGroup,
    GenericCapabilityItem,
    GENERIC_CAPABILITIES_PROMPT_PREFIX,
    GENERIC_CAPABILITIES_VARIABLE_PREFIX,
    PromptFragment,
    PromptService,
    ToolInvocationRegistry,
    AIVariableService
} from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat';
import debounce = require('@theia/core/shared/lodash.debounce');

// Re-export types from ai-core for backward compatibility
export { GenericCapabilityItem, GenericCapabilityGroup, GenericCapabilitiesContribution };

/**
 * Represents the available generic capabilities aggregated from all sources.
 * Used by the UI to populate capability selection dropdowns.
 */
export interface AvailableGenericCapabilities {
    skills: GenericCapabilityItem[];
    mcpFunctions: GenericCapabilityGroup[];
    functions: GenericCapabilityGroup[];
    promptFragments: GenericCapabilityItem[];
    agentDelegation: GenericCapabilityItem[];
    variables: GenericCapabilityItem[];
}

export const GenericCapabilitiesService = Symbol('GenericCapabilitiesService');

/**
 * Service to provide lists of available generic capabilities for selection in the UI.
 * Aggregates capabilities from various sources (skills, MCP, functions, etc.)
 * and provides change notifications when available capabilities change.
 */
export interface GenericCapabilitiesService {
    /** Event fired when the list of available capabilities changes */
    readonly onDidChangeAvailableCapabilities: Event<void>;

    /** Get all available skills */
    getAvailableSkills(): GenericCapabilityItem[];

    /** Get all available MCP functions grouped by server */
    getAvailableMCPFunctions(): Promise<GenericCapabilityGroup[]>;

    /** Get all available functions (non-MCP) grouped by provider */
    getAvailableFunctions(): GenericCapabilityGroup[];

    /** Get all available prompt fragments */
    getAvailablePromptFragments(): GenericCapabilityItem[];

    /** Get all available agents for delegation, optionally excluding a specific agent */
    getAvailableAgents(excludeAgentId?: string): GenericCapabilityItem[];

    /** Get all available variables */
    getAvailableVariables(): GenericCapabilityItem[];
}

@injectable()
export class GenericCapabilitiesServiceImpl implements GenericCapabilitiesService, Disposable {

    @inject(SkillService) @optional()
    protected readonly skillService: SkillService | undefined;

    @inject(ToolInvocationRegistry) @optional()
    protected readonly toolInvocationRegistry: ToolInvocationRegistry | undefined;

    @inject(PromptService) @optional()
    protected readonly promptService: PromptService | undefined;

    @inject(ChatAgentService) @optional()
    protected readonly chatAgentService: ChatAgentService | undefined;

    @inject(AIVariableService) @optional()
    protected readonly variableService: AIVariableService | undefined;

    @inject(ContributionProvider) @named(GenericCapabilitiesContribution) @optional()
    protected readonly contributions: ContributionProvider<GenericCapabilitiesContribution> | undefined;

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChangeAvailableCapabilities: Event<void> = this.onDidChangeEmitter.event;

    protected readonly fireChangeDebounced = debounce(() => {
        this.onDidChangeEmitter.fire();
    }, 50);

    @postConstruct()
    protected init(): void {
        // Subscribe to change events from all relevant services
        if (this.skillService) {
            this.toDispose.push(this.skillService.onSkillsChanged(() => this.fireChangeDebounced()));
        }
        if (this.toolInvocationRegistry) {
            this.toDispose.push(this.toolInvocationRegistry.onDidChange(() => this.fireChangeDebounced()));
        }
        if (this.promptService) {
            this.toDispose.push(this.promptService.onPromptsChange(() => this.fireChangeDebounced()));
        }
        if (this.variableService) {
            this.toDispose.push(this.variableService.onDidChangeVariables(() => this.fireChangeDebounced()));
        }
        // Subscribe to change events from external contributions
        if (this.contributions) {
            for (const contribution of this.contributions.getContributions()) {
                if (contribution.onDidChange) {
                    this.toDispose.push(contribution.onDidChange(() => this.fireChangeDebounced()));
                }
            }
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    getAvailableSkills(): GenericCapabilityItem[] {
        if (!this.skillService) {
            return [];
        }

        return this.skillService.getSkills().map(skill => ({
            id: skill.name,
            name: skill.name,
            description: skill.description
        }));
    }

    async getAvailableMCPFunctions(): Promise<GenericCapabilityGroup[]> {
        return this.getContributedCapabilities('mcpFunctions');
    }

    protected async getContributedCapabilities(type: CapabilityType): Promise<GenericCapabilityGroup[]> {
        if (!this.contributions) {
            return [];
        }
        const results: GenericCapabilityGroup[] = [];
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.capabilityType === type) {
                const groups = await contribution.getAvailableCapabilities();
                results.push(...groups);
            }
        }
        return results;
    }

    getAvailableFunctions(): GenericCapabilityGroup[] {
        if (!this.toolInvocationRegistry) {
            return [];
        }

        const allFunctions = this.toolInvocationRegistry.getAllFunctions();
        const groupMap = new Map<string, GenericCapabilityItem[]>();

        for (const fn of allFunctions) {
            // Skip MCP functions - they are handled separately
            if (fn.providerName?.startsWith('mcp_')) {
                continue;
            }

            const groupName = fn.providerName || 'Other';
            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, []);
            }

            groupMap.get(groupName)!.push({
                id: fn.id,
                name: fn.name || fn.id,
                group: groupName,
                description: fn.description
            });
        }

        const groups: GenericCapabilityGroup[] = [];
        for (const [name, items] of groupMap) {
            groups.push({ name, items });
        }

        return groups;
    }

    getAvailablePromptFragments(): GenericCapabilityItem[] {
        if (!this.promptService) {
            return [];
        }

        const fragments = this.promptService.getActivePromptFragments();
        return fragments
            .filter((fragment: PromptFragment) => !fragment.id.startsWith(GENERIC_CAPABILITIES_PROMPT_PREFIX))
            .map((fragment: PromptFragment) => ({
                id: fragment.id,
                name: fragment.id,
                description: fragment.template.substring(0, 100).replace(/\n/g, ' ') +
                    (fragment.template.length > 100 ? '...' : '')
            }));
    }

    getAvailableAgents(excludeAgentId?: string): GenericCapabilityItem[] {
        if (!this.chatAgentService) {
            return [];
        }

        return this.chatAgentService.getAgents()
            .filter(agent => agent.id !== excludeAgentId)
            .map(agent => ({
                id: agent.id,
                name: agent.name,
                description: agent.description
            }));
    }

    getAvailableVariables(): GenericCapabilityItem[] {
        if (!this.variableService) {
            return [];
        }

        return this.variableService.getVariables()
            .filter((variable: Readonly<AIVariable>) => !variable.name.startsWith(GENERIC_CAPABILITIES_VARIABLE_PREFIX))
            .map((variable: Readonly<AIVariable>) => ({
                id: variable.name,
                name: variable.name,
                description: variable.description
            }));
    }
}
