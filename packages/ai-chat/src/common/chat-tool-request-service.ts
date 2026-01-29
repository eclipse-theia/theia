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
import { injectable } from '@theia/core/shared/inversify';
import { MutableChatRequestModel, MutableChatResponseModel } from './chat-model';

/**
 * Context object passed to tool handlers when invoked within a chat session.
 * Extends ToolInvocationContext to include chat-specific information.
 */
export interface ChatToolContext extends ToolInvocationContext {
    readonly request: MutableChatRequestModel;
    readonly response: MutableChatResponseModel;
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
 * Wraps tool requests in a chat context.
 *
 * This service extracts tool requests from a given chat request model and wraps their
 * handler functions to provide additional context, such as the chat request model.
 */
@injectable()
export class ChatToolRequestService {

    /**
     * Extracts tool requests from a chat request and wraps them to provide chat context.
     * @param request The chat request containing tool requests
     * @returns Tool requests with handlers that receive ChatToolContext
     */
    getChatToolRequests(request: MutableChatRequestModel): ToolRequest[] {
        const toolRequests = request.message.toolRequests.size > 0 ? [...request.message.toolRequests.values()] : undefined;
        if (!toolRequests) {
            return [];
        }
        return this.toChatToolRequests(toolRequests, request);
    }

    /**
     * Wraps multiple tool requests to provide chat context to their handlers.
     * @param toolRequests The original tool requests
     * @param request The chat request to use for context
     * @returns Wrapped tool requests whose handlers receive ChatToolContext
     */
    toChatToolRequests(toolRequests: ToolRequest[] | undefined, request: MutableChatRequestModel): ToolRequest[] {
        if (!toolRequests) {
            return [];
        }
        return toolRequests.map(toolRequest => this.toChatToolRequest(toolRequest, request));
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
            get response(): MutableChatResponseModel {
                return request.response;
            }
        };
    }

}
