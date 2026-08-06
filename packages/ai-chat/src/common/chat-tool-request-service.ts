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

import { ToolInvocationContext, ToolRequest } from '@theia/ai-core';
import { ILogger } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { MutableChatRequestModel, MutableChatResponseModel } from './chat-model';

/**
 * Checks if the given arguments string represents empty tool arguments.
 * Handles different representations: '', undefined, '{}', '{ }', etc.
 */
export function isEmptyToolArgs(args: string | undefined): boolean {
    if (!args) {
        return true;
    }
    try {
        const parsed = JSON.parse(args);
        return typeof parsed === 'object' && !!parsed && !Array.isArray(parsed) && Object.keys(parsed).length === 0;
    } catch {
        return false;
    }
}

/**
 * Normalizes tool arguments for comparison purposes.
 * Empty arguments (undefined, '', '{}') are normalized to '' for consistent comparison.
 */
export function normalizeToolArgs(args: string | undefined): string {
    return isEmptyToolArgs(args) ? '' : args!;
}

/**
 * Context object passed to tool handlers when invoked within a chat session.
 * Extends ToolInvocationContext to include chat-specific information.
 */
export interface ChatToolContext extends ToolInvocationContext {
    readonly request: MutableChatRequestModel;
    readonly response: MutableChatResponseModel;
    readonly rootSessionId?: string;
}

export namespace ChatToolContext {
    export function is(obj: unknown): obj is ChatToolContext {
        return !!obj && typeof obj === 'object' && 'request' in obj && 'response' in obj;
    }
}

/**
 * Asserts that the given context is a ChatToolContext.
 * Use this in tool handlers that require chat context to get type narrowing and runtime validation.
 * @throws Error if the context is not a valid ChatToolContext
 */
export function assertChatContext(ctx: unknown): asserts ctx is ChatToolContext {
    if (!ChatToolContext.is(ctx)) {
        throw new Error('This tool requires a chat context. It can only be used within a chat session.');
    }
}

/**
 * A ToolRequest that expects a ChatToolContext.
 */
export type ChatToolRequest = ToolRequest<ChatToolContext>;

/**
 * The subset of a chat agent that is relevant to tool filtering. Structurally satisfied by
 * `ChatAgent` (kept as a separate structural interface so the service does not depend on the
 * chat-agents module and tests can pass plain objects).
 *
 * Semantics: effective toolset = (parsed tools ∩ `allowedTools`) − `disallowedTools`.
 * Omitted `allowedTools` = no cap; omitted `disallowedTools` = deny nothing; deny always wins.
 * Entries are case-sensitive globs: `*` matches any character sequence, all other characters are
 * literal. The lists filter the tools that were parsed from the prompt/request — they never add
 * tools that nothing referenced.
 */
export interface AgentToolPolicy {
    id?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
}

/**
 * Matches a tool id against a policy pattern. `*` matches any character sequence; every other
 * character is literal. Anchored full match, case-sensitive.
 */
export function matchesToolPattern(pattern: string, toolId: string): boolean {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, char => char === '*' ? '.*' : `\\${char}`);
    return new RegExp(`^${escaped}$`).test(toolId);
}

/**
 * Wraps tool requests in a chat context.
 *
 * This service extracts tool requests from a given chat request model and wraps their
 * handler functions to provide additional context, such as the chat request model.
 */
@injectable()
export class ChatToolRequestService {

    @inject(ILogger) @named('ChatToolRequestService')
    protected readonly logger: ILogger;

    /**
     * Tool ids that a delegation request's text may still grant to the delegated agent. By default
     * only the skill-loading tool, so a delegating agent can prime a sub-agent with a skill
     * (the id is a literal because its constant lives in @theia/ai-ide, which this package must
     * not depend on). Subclasses may override to widen or clear the allowlist.
     */
    protected readonly delegationRequestGrantAllowlist: string[] = ['getSkillFileContent'];

    /**
     * Extracts tool requests from a chat request and wraps them to provide chat context.
     * @param request The chat request containing tool requests
     * @param agent optional tool policy of the invoking agent; tools not permitted by the policy are filtered out
     * @returns Tool requests with handlers that receive ChatToolContext
     */
    getChatToolRequests(request: MutableChatRequestModel, agent?: AgentToolPolicy): ToolRequest[] {
        const toolRequests = request.message.toolRequests.size > 0 ? [...request.message.toolRequests.values()] : undefined;
        if (!toolRequests) {
            return [];
        }
        // Request-text grants in a delegated session are capped to an explicit allowlist: the
        // request text was authored by the delegating LLM, so its wording must not determine the
        // delegated agent's toolset (https://github.com/eclipse-theia/theia/issues/17836).
        const granted = this.isDelegatedSession(request)
            ? toolRequests.filter(tool => {
                if (this.delegationRequestGrantAllowlist.includes(tool.id)) {
                    return true;
                }
                this.logger?.info(`Dropped the '${tool.id}' tool grant from a delegated session's request: a delegation prompt does not grant tools.`);
                return false;
            })
            : toolRequests;
        return this.toChatToolRequests(granted, request, agent);
    }

    /**
     * Wraps multiple tool requests to provide chat context to their handlers.
     * @param toolRequests The original tool requests
     * @param request The chat request to use for context
     * @param agent optional tool policy of the invoking agent; tools not permitted by the policy are filtered out
     * @returns Wrapped tool requests whose handlers receive ChatToolContext
     */
    toChatToolRequests(toolRequests: ToolRequest[] | undefined, request: MutableChatRequestModel, agent?: AgentToolPolicy): ToolRequest[] {
        if (!toolRequests) {
            return [];
        }
        return this.filterByAgentToolPolicy(toolRequests, agent).map(toolRequest => this.toChatToolRequest(toolRequest, request));
    }

    /**
     * Wraps a single tool request to provide chat context to its handler.
     * The returned tool request accepts ToolInvocationContext but internally
     * enriches it to ChatToolContext before passing to the original handler.
     * @param toolRequest The original tool request
     * @param request The chat request to use for context
     * @returns A wrapped tool request
     */
    protected toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ToolRequest {
        return {
            ...toolRequest,
            handler: async (arg_string: string, ctx?: ToolInvocationContext) =>
                toolRequest.handler(arg_string, this.createToolContext(request, ctx))
        };
    }

    /**
     * Checks whether the given request belongs to a delegated session, i.e. one created by
     * `AgentDelegationTool.delegateToAgent` (and restored on session deserialization).
     * @param request The chat request to check
     * @returns `true` if `request.session.rootSessionId` is set
     */
    protected isDelegatedSession(request: MutableChatRequestModel): boolean {
        return request.session.rootSessionId !== undefined;
    }

    /**
     * Applies the agent's tool policy: a tool survives only if it matches some `allowedTools`
     * pattern (no list = no cap) and no `disallowedTools` pattern. Deny wins.
     * @param toolRequests The candidate tool requests
     * @param agent optional tool policy of the invoking agent; tools not permitted by the policy are filtered out
     * @returns Tool requests permitted by the policy
     */
    protected filterByAgentToolPolicy(toolRequests: ToolRequest[], agent?: AgentToolPolicy): ToolRequest[] {
        if (!agent || (!agent.allowedTools && !agent.disallowedTools?.length)) {
            return toolRequests;
        }
        return toolRequests.filter(tool => {
            if (agent.disallowedTools?.some(pattern => matchesToolPattern(pattern, tool.id))) {
                this.logger?.info(`Dropped tool '${tool.id}' for agent '${agent.id ?? '<unknown>'}': matched disallowedTools.`);
                return false;
            }
            if (agent.allowedTools && !agent.allowedTools.some(pattern => matchesToolPattern(pattern, tool.id))) {
                this.logger?.info(`Dropped tool '${tool.id}' for agent '${agent.id ?? '<unknown>'}': not matched by allowedTools.`);
                return false;
            }
            return true;
        });
    }

    /**
     * Creates a ChatToolContext by enriching a ToolInvocationContext with chat-specific data.
     * @param request The chat request providing context
     * @param ctx The base tool invocation context
     * @returns A ChatToolContext with request, response, and cancellation token
     */
    protected createToolContext(request: MutableChatRequestModel, ctx?: ToolInvocationContext): ChatToolContext {
        return {
            request,
            toolCallId: ctx?.toolCallId,
            cancellationToken: request.response.cancellationToken,
            rootSessionId: request.session.rootSessionId,
            get response(): MutableChatResponseModel {
                return request.response;
            }
        };
    }

}
