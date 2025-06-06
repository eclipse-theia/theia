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

import { ToolRequest } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { MutableChatRequestModel } from './chat-model';

export interface ChatToolRequest extends ToolRequest {
    handler(arg_string: string, context: MutableChatRequestModel): ReturnType<ToolRequest['handler']>;
    handler(arg_string: string, ctx?: unknown): ReturnType<ToolRequest['handler']>;
}

/**
 * Wraps tool requests in a chat context.
 *
 * This service extracts tool requests from a given chat request model and wraps their
 * handler functions to provide additional context, such as the chat request model.
 */
@injectable()
export class ChatToolRequestService {

    getChatToolRequests(request: MutableChatRequestModel): ChatToolRequest[] {
        const toolRequests = request.message.toolRequests.size > 0 ? [...request.message.toolRequests.values()] : undefined;
        if (!toolRequests) {
            return [];
        }
        return this.toChatToolRequests(toolRequests, request);
    }

    toChatToolRequests(toolRequests: ToolRequest[] | undefined, request: MutableChatRequestModel): ChatToolRequest[] {
        if (!toolRequests) {
            return [];
        }
        return toolRequests.map(toolRequest => this.toChatToolRequest(toolRequest, request));
    }

    protected toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ChatToolRequest {
        return {
            ...toolRequest,
            handler: async (arg_string: string) => toolRequest.handler(arg_string, request)
        };
    }

}
