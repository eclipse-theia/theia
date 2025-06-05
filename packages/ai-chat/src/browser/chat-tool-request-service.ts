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
import { injectable, inject } from '@theia/core/shared/inversify';
import { ChatToolRequestService, ChatToolRequest } from '../common/chat-tool-request-service';
import { MutableChatRequestModel, ToolCallChatResponseContent } from '../common/chat-model';
import { ToolConfirmationManager, ToolConfirmationMode, ChatToolPreferences } from './chat-tool-preferences';

/**
 * Frontend-specific implementation of ChatToolRequestService that handles tool confirmation
 */
@injectable()
export class FrontendChatToolRequestService extends ChatToolRequestService {

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ChatToolPreferences)
    protected readonly preferences: ChatToolPreferences;

    protected override toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ChatToolRequest {
        const confirmationMode = this.confirmationManager.getConfirmationMode(toolRequest.id, request.session.id);

        return {
            ...toolRequest,
            handler: async (arg_string: string) => {
                switch (confirmationMode) {
                    case ToolConfirmationMode.DISABLED:
                        return { denied: true, message: `Tool ${toolRequest.id} is disabled` };

                    case ToolConfirmationMode.ALWAYS_ALLOW:
                        // Execute immediately without confirmation
                        return toolRequest.handler(arg_string, request);

                    case ToolConfirmationMode.CONFIRM:
                    default:
                        // Create confirmation requirement
                        const toolCallContent = this.findToolCallContent(toolRequest, arg_string, request);
                        const confirmed = await toolCallContent.confirmed;

                        if (confirmed) {
                            return toolRequest.handler(arg_string, request);
                        } else {
                            // Return an object indicating the user denied the tool execution
                            // instead of throwing an error
                            return { denied: true, message: `Tool execution denied by user: ${toolRequest.id}` };
                        }
                }
            }
        };
    }

    /**
     * Find existing tool call content or create a new one for confirmation tracking
     *
     * Looks for ToolCallChatResponseContent nodes where the name field matches the toolRequest id.
     * Starts from the back of the content array to find the most recent match.
     */
    protected findToolCallContent(
        toolRequest: ToolRequest,
        arguments_: string,
        request: MutableChatRequestModel
    ): ToolCallChatResponseContent {
        // Look for existing tool call content with matching ID
        const response = request.response.response;
        const contentArray = response.content;

        // Start from the end of the array and find the first match
        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id) {
                return content;
            }
        }

        throw new Error(`Tool call content for tool ${toolRequest.id} not found in the response`);
    }
}
