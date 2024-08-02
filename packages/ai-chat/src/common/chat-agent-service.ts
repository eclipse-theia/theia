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
import { ChatRequestModel, ChatRequestModelImpl } from './chat-model';
import { AgentService } from '@theia/ai-core';

export const ChatAgentService = Symbol('ChatAgentService');
/**
 * The ChatAgentService provides access to the available chat agents.
 */
export interface ChatAgentService {
    getAgents(includeDisabledAgent?: boolean): ChatAgent[];
    getAgent(id: string, includeDisabledAgent?: boolean): ChatAgent | undefined;
    getAgentsByName(name: string, includeDisabledAgent?: boolean): ChatAgent[];
    invokeAgent(agentId: string, request: ChatRequestModel): Promise<void>;
}
@injectable()
export class ChatAgentServiceImpl implements ChatAgentService {

    @inject(ContributionProvider) @named(ChatAgent)
    protected readonly agents: ContributionProvider<ChatAgent>;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(AgentService)
    protected agentService: AgentService;

    getAgent(id: string, includeDisabledAgent = false): ChatAgent | undefined {
        if (!includeDisabledAgent && !this._agentIsEnabled(id)) {
            return;
        }
        return this.getAgents(includeDisabledAgent).find(agent => agent.id === id);
    }
    getAgents(includeDisabledAgent = false): ChatAgent[] {
        return this.agents.getContributions()
            .filter(a => includeDisabledAgent || this._agentIsEnabled(a.id));
    }
    getAgentsByName(name: string, includeDisabledAgent = false): ChatAgent[] {
        return this.getAgents(includeDisabledAgent).filter(a => a.name === name);
    }

    private _agentIsEnabled(id: string): boolean {
        return this.agentService.isEnabled(id);
    }
    invokeAgent(agentId: string, request: ChatRequestModelImpl): Promise<void> {
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        return agent.invoke(request, this);
    }
}
