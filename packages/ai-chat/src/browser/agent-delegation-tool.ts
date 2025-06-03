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

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ChatAgentService,
    ChatAgentServiceFactory,
    ChatRequest,
    ChatService,
    ChatServiceFactory,
    MutableChatRequestModel,
} from '../common';
import { DelegationResponseContent } from './delegation-response-content';

export const AGENT_DELEGATION_FUNCTION_ID = 'delegateToAgent';

@injectable()
export class AgentDelegationTool implements ToolProvider {
    static ID = AGENT_DELEGATION_FUNCTION_ID;

    @inject(ChatAgentServiceFactory)
    protected readonly getChatAgentService: () => ChatAgentService;

    @inject(ChatServiceFactory)
    protected readonly getChatService: () => ChatService;

    getTool(): ToolRequest {
        return {
            id: AgentDelegationTool.ID,
            name: AgentDelegationTool.ID,
            description:
                'Delegate a task or question to a specific AI agent. This tool allows you to route requests to specialized agents based on their capabilities.',
            parameters: {
                type: 'object',
                properties: {
                    agentName: {
                        type: 'string',
                        description:
                            'The name/ID of the AI agent to delegate the task to. Available agents can be found using the chatAgents variable.',
                    },
                    prompt: {
                        type: 'string',
                        description:
                            'The task, question, or prompt to pass to the specified agent.',
                    },
                },
                required: ['agentName', 'prompt'],
            },
            handler: (arg_string: string, ctx: MutableChatRequestModel) =>
                this.delegateToAgent(arg_string, ctx),
        };
    }

    private async delegateToAgent(
        arg_string: string,
        ctx: MutableChatRequestModel
    ): Promise<string> {
        try {
            const args = JSON.parse(arg_string);
            const { agentName, prompt } = args;

            if (!agentName || !prompt) {
                const errorMsg = 'Both agentName and prompt parameters are required.';
                console.error(errorMsg, { agentName, prompt });
                return errorMsg;
            }

            // Check if the specified agent exists
            const agent = this.getChatAgentService().getAgent(agentName);
            if (!agent) {
                const availableAgents = this.getChatAgentService()
                    .getAgents()
                    .map(a => a.id);
                const errorMsg = `Agent '${agentName}' not found or not enabled. Available agents: ${availableAgents.join(', ')}`;
                console.error(errorMsg);
                return errorMsg;
            }

            let newSession;
            try {
                // FIXME: this creates a new conversation visible in the UI (Panel), which we don't want
                // It is not possible to start a session without specifying a location (default=Panel)
                const chatService = this.getChatService();
                newSession = chatService.createSession(
                    undefined,
                    { focus: false },
                    agent
                );
            } catch (sessionError) {
                const errorMsg = `Failed to create chat session for agent '${agentName}': ${sessionError instanceof Error ? sessionError.message : sessionError}`;
                console.error(errorMsg, sessionError);
                return errorMsg;
            }

            // Send the request
            const chatRequest: ChatRequest = {
                text: prompt,
            };

            let response;
            try {
                const chatService = this.getChatService();
                response = await chatService.sendRequest(
                    newSession.id,
                    chatRequest
                );
            } catch (sendError) {
                const errorMsg = `Failed to send request to agent '${agentName}': ${sendError instanceof Error ? sendError.message : sendError}`;
                console.error(errorMsg, sendError);
                return errorMsg;
            }

            if (response) {
                try {
                    const result = await response.responseCompleted;
                    const stringResult = result.response.asString();
                    // Add a new response part that will be fully rendered in its own section
                    ctx.response.response.addContent(
                        new DelegationResponseContent(agentName, prompt, response)
                    );
                    // Also return the raw text to the top-level Agent, as a tool result
                    return stringResult;
                } catch (completionError) {
                    const errorMsg = `Failed to complete response from agent '${agentName}': ${completionError instanceof Error ? completionError.message : completionError}`;
                    console.error(errorMsg, completionError);
                    return errorMsg;
                }
            } else {
                const errorMsg = `Delegation to agent '${agentName}' has failed: no response returned.`;
                console.error(errorMsg);
                return errorMsg;
            }
        } catch (error) {
            console.error('Failed to delegate to agent', error);
            return JSON.stringify({
                error: `Failed to parse arguments or delegate to agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }
}
