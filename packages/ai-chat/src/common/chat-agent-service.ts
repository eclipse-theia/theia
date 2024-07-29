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
import { ChatRequestModelImpl } from './chat-model';

export const ChatAgentService = Symbol('ChatAgentService');
export interface ChatAgentService {
    getAgents(): ChatAgent[];
    getAgent(id: string): ChatAgent | undefined;
    getAgentsByName(name: string): ChatAgent[];
    invokeAgent(agentId: string, request: ChatRequestModelImpl): Promise<void>;
}
@injectable()
export class ChatAgentServiceImpl implements ChatAgentService {

    @inject(ContributionProvider) @named(ChatAgent)
    protected readonly agents: ContributionProvider<ChatAgent>;

    @inject(ILogger)
    protected logger: ILogger;

    getAgent(id: string): ChatAgent | undefined {
        if (!this._agentIsEnabled(id)) {
            return;
        }

        return this.agents.getContributions().find(agent => agent.id === id);
    }
    getAgents(): ChatAgent[] {
        return this.agents.getContributions()
            .filter(a => this._agentIsEnabled(a.id));
    }
    getAgentsByName(name: string): ChatAgent[] {
        return this.getAgents().filter(a => a.name === name);
    }
    private _agentIsEnabled(id: string): boolean {
        // const entry = this.agents.getContributions().find(agent => agent.id === id);
        // return !entry?.when || this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(entry.when));
        return true;
    }
    invokeAgent(agentId: string, request: ChatRequestModelImpl): Promise<void> {
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        return agent.invoke(request);
    }
}
