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

import { inject, injectable } from '@theia/core/shared/inversify';
import { AGENT_DELEGATION_FUNCTION_ID, LIST_AGENTS_FUNCTION_ID, listByKeywords, ToolProvider, ToolRequest } from '@theia/ai-core';
import { ChatAgentService, ChatAgentServiceFactory } from '../common';

@injectable()
export class ListAgentsTool implements ToolProvider {
    static ID = LIST_AGENTS_FUNCTION_ID;

    @inject(ChatAgentServiceFactory)
    protected readonly getChatAgentService: () => ChatAgentService;

    getTool(): ToolRequest {
        return {
            id: ListAgentsTool.ID,
            name: ListAgentsTool.ID,
            description: `Lists the agents you can delegate to with ${AGENT_DELEGATION_FUNCTION_ID}, one per line as '- <agentId>: <description>'. ` +
                'Call it before delegating to pick the agent whose description fits the task. ' +
                'Pass a query with a few keywords to get only the agents whose id or description matches any of them, best matches first. ' +
                'Omit the query to list all agents, which is the safer choice when comparing candidates.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Optional space-separated keywords, matched case-insensitively against agent ids and descriptions (e.g. \'review test\')'
                    }
                },
                required: []
            },
            handler: (arg_string: string) => this.listAgents(arg_string)
        };
    }

    protected async listAgents(arg_string: string): Promise<string> {
        const query: unknown = arg_string ? JSON.parse(arg_string).query : undefined;
        const keywords = typeof query === 'string' ? query.trim() : '';
        const entries = this.getChatAgentService().getAgents().map(agent => ({ name: agent.id, description: agent.description }));
        return listByKeywords(entries, keywords) ?? (keywords
            ? `No agent matches '${keywords}'. Retry with other keywords or without a query to list all agents.`
            : 'No agents available.');
    }
}
