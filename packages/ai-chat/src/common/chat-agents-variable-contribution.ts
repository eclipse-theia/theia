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
import { MaybePromise } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AIVariable,
    AIVariableContext,
    AIVariableContribution,
    AIVariableResolutionRequest,
    AIVariableResolver,
    AIVariableService,
    ResolvedAIVariable
} from '@theia/ai-core';
import { ChatAgentService } from './chat-agent-service';

export const CHAT_AGENTS_VARIABLE: AIVariable = {
    id: 'chatAgents',
    name: 'chatAgents',
    description: 'Returns the list of chat agents available in the system'
};

export interface ChatAgentDescriptor {
    id: string;
    name: string;
    description: string;
}

@injectable()
export class ChatAgentsVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(ChatAgentService)
    protected readonly agents: ChatAgentService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(CHAT_AGENTS_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name === CHAT_AGENTS_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === CHAT_AGENTS_VARIABLE.name) {
            return this.resolveAgentsVariable(request);
        }
    }

    resolveAgentsVariable(_request: AIVariableResolutionRequest): ResolvedAIVariable {
        const agents = this.agents.getAgents().map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description
        }));
        const value = agents.map(agent => prettyPrintInMd(agent)).join('\n');
        return { variable: CHAT_AGENTS_VARIABLE, value };
    }
}

function prettyPrintInMd(agent: { id: string; name: string; description: string; }): string {
    return `- ${agent.id}
  - *ID*: ${agent.id}
  - *Name*: ${agent.name}
  - *Description*: ${agent.description.replace(/\n/g, ' ')}`;
}

