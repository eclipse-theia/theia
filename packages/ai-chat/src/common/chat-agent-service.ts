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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatAgents.ts

import { ContributionProvider, ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ChatAgent } from './chat-agents';
import { AgentService } from '@theia/ai-core';

export const ChatAgentService = Symbol('ChatAgentService');
export const ChatAgentServiceFactory = Symbol('ChatAgentServiceFactory');
/**
 * The ChatAgentService provides access to the available chat agents.
 */
export interface ChatAgentService {
    /**
     * Returns all available agents.
     */
    getAgents(): ChatAgent[];
    /**
     * Returns the specified agent, if available
     */
    getAgent(id: string): ChatAgent | undefined;
    /**
     * Returns all agents, including disabled ones.
     */
    getAllAgents(): ChatAgent[];

    /**
     * Allows to register a chat agent programmatically.
     * @param agent the agent to register
     */
    registerChatAgent(agent: ChatAgent): void;

    /**
     * Allows to unregister a chat agent programmatically.
     * @param agentId the agent id to unregister
     */
    unregisterChatAgent(agentId: string): void;
}
@injectable()
export class ChatAgentServiceImpl implements ChatAgentService {

    @inject(ContributionProvider) @named(ChatAgent)
    protected readonly agentContributions: ContributionProvider<ChatAgent>;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(AgentService)
    protected agentService: AgentService;

    protected _agents: ChatAgent[] = [];

    protected get agents(): ChatAgent[] {
        // We can't collect the contributions at @postConstruct because this will lead to a circular dependency
        // with chat agents reusing the chat agent service (e.g. orchestrator)
        return [...this.agentContributions.getContributions(), ...this._agents];
    }

    registerChatAgent(agent: ChatAgent): void {
        this._agents.push(agent);
    }
    unregisterChatAgent(agentId: string): void {
        this._agents = this._agents.filter(a => a.id !== agentId);
    }

    getAgent(id: string): ChatAgent | undefined {
        if (!this._agentIsEnabled(id)) {
            return undefined;
        }
        return this.getAgents().find(agent => agent.id === id);
    }
    getAgents(): ChatAgent[] {
        return this.agents.filter(a => this._agentIsEnabled(a.id));
    }
    getAllAgents(): ChatAgent[] {
        return this.agents;
    }

    private _agentIsEnabled(id: string): boolean {
        return this.agentService.isEnabled(id);
    }
}
