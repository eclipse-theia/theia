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
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest, AIVariableResolver, AIVariableService, ResolvedAIVariable } from './variable-service';
import { MaybePromise } from '@theia/core';
import { AgentService } from './agent-service';

export const AGENTS_VARIABLE: AIVariable = {
    id: 'agents',
    name: 'agents',
    description: 'Returns the list of agents available in the system'
};

export interface ResolvedAgentsVariable extends ResolvedAIVariable {
    agents: AgentDescriptor[];
}

export interface AgentDescriptor {
    id: string;
    name: string;
    description: string;
}

@injectable()
export class AgentsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(AgentService)
    protected readonly agentService: AgentService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(AGENTS_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name === AGENTS_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAgentsVariable | undefined> {
        if (request.variable.name === AGENTS_VARIABLE.name) {
            const agents = this.agentService.getAgents().map(agent => ({
                id: agent.id,
                name: agent.name,
                description: agent.description
            }));
            return { variable: AGENTS_VARIABLE, agents, value: JSON.stringify(agents) };
        }
    }
}
