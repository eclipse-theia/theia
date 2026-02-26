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

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { MaybePromise } from '@theia/core';
import {
    AIVariable,
    AIVariableArg,
    AIVariableContext,
    AIVariableContribution,
    AIVariableResolutionRequest,
    AIVariableResolverWithVariableDependencies,
    AIVariableService,
    ResolvedAIVariable,
    CapabilityAwareContext,
    AgentService,
    AgentsVariableContribution
} from '../common';
import { PromptVariableContribution } from './prompt-variable-contribution';
import { SkillService } from './skill-service';
import { SkillsVariableContribution } from './skills-variable-contribution';

/**
 * Variable IDs for generic capability selections.
 * These variables resolve to lists of selected items from the chat UI dropdowns.
 */
export const SELECTED_SKILLS_VARIABLE: AIVariable = {
    id: 'selected_skills',
    name: 'selected_skills',
    description: 'Returns the list of user-selected skills from the capabilities panel'
};

export const SELECTED_MCP_FUNCTIONS_VARIABLE: AIVariable = {
    id: 'selected_mcp_functions',
    name: 'selected_mcp_functions',
    description: 'Returns the list of user-selected MCP functions from the capabilities panel'
};

export const SELECTED_FUNCTIONS_VARIABLE: AIVariable = {
    id: 'selected_functions',
    name: 'selected_functions',
    description: 'Returns the list of user-selected functions from the capabilities panel'
};

export const SELECTED_PROMPT_FRAGMENTS_VARIABLE: AIVariable = {
    id: 'selected_prompt_fragments',
    name: 'selected_prompt_fragments',
    description: 'Returns the list of user-selected prompt fragments from the capabilities panel'
};

export const SELECTED_AGENT_DELEGATION_VARIABLE: AIVariable = {
    id: 'selected_agent_delegation',
    name: 'selected_agent_delegation',
    description: 'Returns the list of user-selected agents for delegation from the capabilities panel'
};

export const SELECTED_VARIABLES_VARIABLE: AIVariable = {
    id: 'selected_variables',
    name: 'selected_variables',
    description: 'Returns the list of user-selected variables from the capabilities panel'
};

const GENERIC_CAPABILITY_VARIABLES = [
    SELECTED_SKILLS_VARIABLE,
    SELECTED_MCP_FUNCTIONS_VARIABLE,
    SELECTED_FUNCTIONS_VARIABLE,
    SELECTED_PROMPT_FRAGMENTS_VARIABLE,
    SELECTED_AGENT_DELEGATION_VARIABLE,
    SELECTED_VARIABLES_VARIABLE
];

/**
 * Contribution that registers variables for resolving user-selected generic capabilities.
 * These variables read from the genericCapabilitySelections field in the context
 * and delegate resolution to the respective variable contributions.
 */
@injectable()
export class GenericCapabilitiesVariableContribution implements AIVariableContribution, AIVariableResolverWithVariableDependencies {

    @inject(SkillsVariableContribution) @optional()
    protected readonly skillsContribution: SkillsVariableContribution | undefined;

    @inject(SkillService) @optional()
    protected readonly skillService: SkillService | undefined;

    @inject(AIVariableService) @optional()
    protected readonly variableService: AIVariableService | undefined;

    @inject(AgentService) @optional()
    protected readonly agentService: AgentService | undefined;

    @inject(AgentsVariableContribution) @optional()
    protected readonly agentsContribution: AgentsVariableContribution | undefined;

    @inject(PromptVariableContribution) @optional()
    protected readonly promptContribution: PromptVariableContribution | undefined;

    registerVariables(service: AIVariableService): void {
        for (const variable of GENERIC_CAPABILITY_VARIABLES) {
            service.registerResolver(variable, this);
        }
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (GENERIC_CAPABILITY_VARIABLES.some(v => v.name === request.variable.name)) {
            return 1;
        }
        return -1;
    }

    async resolve(
        request: AIVariableResolutionRequest,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable | undefined> {
        const selections = CapabilityAwareContext.is(context) ? context.genericCapabilitySelections : undefined;

        if (!selections) {
            return { variable: request.variable, value: '' };
        }

        switch (request.variable.name) {
            case SELECTED_SKILLS_VARIABLE.name:
                return this.resolveSelectedSkills(request.variable, selections.skills);
            case SELECTED_MCP_FUNCTIONS_VARIABLE.name:
                return this.resolveSelectedFunctions(request.variable, selections.mcpFunctions);
            case SELECTED_FUNCTIONS_VARIABLE.name:
                return this.resolveSelectedFunctions(request.variable, selections.functions);
            case SELECTED_PROMPT_FRAGMENTS_VARIABLE.name:
                return this.resolveSelectedPromptFragments(request.variable, selections.promptFragments, context, resolveDependency);
            case SELECTED_AGENT_DELEGATION_VARIABLE.name:
                return this.resolveSelectedAgentDelegation(request.variable, selections.agentDelegation);
            case SELECTED_VARIABLES_VARIABLE.name:
                return this.resolveSelectedVariables(request.variable, selections.variables, context, resolveDependency);
            default:
                return undefined;
        }
    }

    /**
     * Resolves selected skills using SkillsVariableContribution.resolveSkillsVariable().
     */
    protected resolveSelectedSkills(variable: AIVariable, skillIds: string[] | undefined): ResolvedAIVariable {
        if (!skillIds || skillIds.length === 0 || !this.skillService || !this.skillsContribution) {
            return { variable, value: '' };
        }

        const skills = skillIds
            .map(skillId => this.skillService!.getSkill(skillId))
            .filter((skill): skill is NonNullable<typeof skill> => skill !== undefined);

        return this.skillsContribution.resolveSkillsVariable(skills, variable);
    }

    /**
     * Resolves selected functions by outputting ~{functionId} syntax.
     * The chat request parser will pick these up and add them to the toolRequests map.
     */
    protected resolveSelectedFunctions(variable: AIVariable, functionIds: string[] | undefined): ResolvedAIVariable {
        if (!functionIds || functionIds.length === 0) {
            return { variable, value: '' };
        }

        // Output function references in ~{id} format so the chat parser picks them up
        const functionRefs = functionIds.map(id => `~{${id}}`).join('\n');
        return { variable, value: functionRefs };
    }

    /**
     * Resolves selected prompt fragments using PromptVariableContribution.resolvePromptFragments().
     */
    protected async resolveSelectedPromptFragments(
        variable: AIVariable,
        fragmentIds: string[] | undefined,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable> {
        if (!fragmentIds || fragmentIds.length === 0 || !this.promptContribution) {
            return { variable, value: '', allResolvedDependencies: [] };
        }

        return this.promptContribution.resolvePromptFragments(fragmentIds, variable, context, resolveDependency);
    }

    /**
     * Resolves selected agents for delegation using AgentsVariableContribution.resolveAgentsVariable().
     */
    protected resolveSelectedAgentDelegation(variable: AIVariable, agentIds: string[] | undefined): ResolvedAIVariable {
        if (!agentIds || agentIds.length === 0 || !this.agentService || !this.agentsContribution) {
            return { variable, value: '' };
        }

        const allAgents = this.agentService.getAgents();
        const agents = agentIds
            .map(agentId => allAgents.find(a => a.id === agentId))
            .filter((agent): agent is NonNullable<typeof agent> => agent !== undefined);

        return this.agentsContribution.resolveAgentsVariable(agents, variable);
    }

    /**
     * Resolves selected variables using AIVariableService.resolveVariable().
     */
    protected async resolveSelectedVariables(
        variable: AIVariable,
        variableNames: string[] | undefined,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable> {
        if (!variableNames || variableNames.length === 0 || !this.variableService) {
            return { variable, value: '', allResolvedDependencies: [] };
        }

        const resolvedValues: string[] = [];
        const allDependencies: ResolvedAIVariable[] = [];

        for (const variableName of variableNames) {
            const aiVariable = this.variableService.getVariable(variableName);
            if (aiVariable) {
                // Use resolveDependency if provided (for proper caching), otherwise use variableService directly
                const resolved = resolveDependency
                    ? await resolveDependency({ variable: aiVariable.name })
                    : await this.variableService.resolveVariable({ variable: aiVariable }, context);

                if (resolved && resolved.value) {
                    resolvedValues.push(`### ${aiVariable.name}\n${resolved.value}`);
                    allDependencies.push(resolved);
                    if (resolved.allResolvedDependencies) {
                        allDependencies.push(...resolved.allResolvedDependencies);
                    }
                }
            }
        }

        return {
            variable,
            value: resolvedValues.join('\n\n'),
            allResolvedDependencies: allDependencies
        };
    }
}
