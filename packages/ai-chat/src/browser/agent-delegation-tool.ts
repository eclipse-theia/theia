// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
    MutableChatModel,
    ChatSession,
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
                'Delegate a task or question to a specific AI agent. This tool allows you to submit requests to specialized agents based on their capabilities.',
            parameters: {
                type: 'object',
                properties: {
                    agentId: {
                        type: 'string',
                        description:
                            'The ID of the AI agent to delegate the task to.',
                    },
                    prompt: {
                        type: 'string',
                        description:
                            'The task, question, or prompt to pass to the specified agent.',
                    },
                },
                required: ['agentId', 'prompt'],
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
            const { agentId, prompt } = args;

            if (!agentId || !prompt) {
                const errorMsg = 'Both agentId and prompt parameters are required.';
                console.error(errorMsg, { agentId, prompt });
                return errorMsg;
            }

            // Check if the specified agent exists
            const agent = this.getChatAgentService().getAgent(agentId);
            if (!agent) {
                const availableAgents = this.getChatAgentService()
                    .getAgents()
                    .map(a => a.id);
                const errorMsg = `Agent '${agentId}' not found or not enabled. Available agents: ${availableAgents.join(', ')}`;
                console.error(errorMsg);
                return errorMsg;
            }

            let newSession;
            try {
                // FIXME: this creates a new conversation visible in the UI (Panel), which we don't want
                // It is not possible to start a session without specifying a location (default=Panel)
                const chatService = this.getChatService();

                // Store the current active session to restore it after delegation
                const currentActiveSession = chatService.getActiveSession();

                newSession = chatService.createSession(
                    undefined,
                    { focus: false },
                    agent
                );

                // Immediately restore the original active session to avoid confusing the user
                if (currentActiveSession) {
                    chatService.setActiveSession(currentActiveSession.id, { focus: false });
                }

                // Setup ChangeSet bubbling from delegated session to parent session
                this.setupChangeSetBubbling(newSession, ctx.session, agent.name);
            } catch (sessionError) {
                const errorMsg = `Failed to create chat session for agent '${agentId}': ${sessionError instanceof Error ? sessionError.message : sessionError}`;
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
                const errorMsg = `Failed to send request to agent '${agentId}': ${sendError instanceof Error ? sendError.message : sendError}`;
                console.error(errorMsg, sendError);
                return errorMsg;
            }

            if (response) {
                // Add the response content immediately to enable streaming
                // The renderer will handle the streaming updates
                ctx.response.response.addContent(
                    new DelegationResponseContent(agent.name, prompt, response)
                );

                try {
                    // Wait for completion to return the final result as tool output
                    const result = await response.responseCompleted;
                    const stringResult = result.response.asString();

                    // Clean up the session after completion
                    const chatService = this.getChatService();
                    chatService.deleteSession(newSession.id);

                    // Return the raw text to the top-level Agent, as a tool result
                    return stringResult;
                } catch (completionError) {
                    const errorMsg = `Failed to complete response from agent '${agentId}': ${completionError instanceof Error ? completionError.message : completionError}`;
                    console.error(errorMsg, completionError);
                    return errorMsg;
                }
            } else {
                const errorMsg = `Delegation to agent '${agentId}' has failed: no response returned.`;
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

    /**
     * Sets up monitoring of the ChangeSet in the delegated session and bubbles changes to the parent session.
     * @param delegatedSession The session created for the delegated agent
     * @param parentModel The parent session model that should receive the bubbled changes
     * @param agentName The name of the agent for attribution purposes
     */
    private setupChangeSetBubbling(
        delegatedSession: ChatSession,
        parentModel: MutableChatModel,
        agentName: string
    ): void {
        // Monitor ChangeSet for bubbling
        delegatedSession.model.changeSet.onDidChange(_event => {
            this.bubbleChangeSet(delegatedSession, parentModel, agentName);
        });
    }

    /**
     * Bubbles the ChangeSet from the delegated session to the parent session.
     * @param delegatedSession The session from which to bubble changes
     * @param parentModel The parent session model to receive the bubbled changes
     * @param agentName The name of the agent for attribution purposes
     */
    private bubbleChangeSet(
        delegatedSession: ChatSession,
        parentModel: MutableChatModel,
        agentName: string
    ): void {
        const delegatedElements = delegatedSession.model.changeSet.getElements();
        if (delegatedElements.length > 0) {
            const bubbledTitle = `Changes from ${agentName}`;
            parentModel.changeSet.setTitle(bubbledTitle);
            parentModel.changeSet.addElements(...delegatedElements);
        }
    }
}
