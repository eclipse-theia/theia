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
import { MutableChatRequestModel, ToolCallChatResponseContentImpl } from '../common/chat-model';
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
        const confirmationMode = this.confirmationManager.getConfirmationMode(toolRequest.id);

        return {
            ...toolRequest,
            handler: async (arg_string: string) => {
                switch (confirmationMode) {
                    case ToolConfirmationMode.DISABLED:
                        throw new Error(`Tool ${toolRequest.id} is disabled`);

                    case ToolConfirmationMode.YOLO:
                        // Execute immediately without confirmation
                        return toolRequest.handler(arg_string, request);

                    case ToolConfirmationMode.CONFIRM:
                    default:
                        // Create confirmation requirement
                        const toolCallContent = this.findToolCallContent(toolRequest, arg_string, request);
                        const confirmed = await toolCallContent.createConfirmationPromise();

                        if (confirmed) {
                            return toolRequest.handler(arg_string, request);
                        } else {
                            throw new Error(`Tool execution denied by user: ${toolRequest.id}`);
                        }
                }
            }
        };
    }

    /**
     * Find existing tool call content or create a new one for confirmation tracking
     */
    protected findToolCallContent(
        toolRequest: ToolRequest,
        arguments_: string,
        request: MutableChatRequestModel
    ): ToolCallChatResponseContentImpl {
        // Look for existing tool call content with matching ID
        const response = request.response.response;
        const existingContent = response.content.find(content =>
            content.kind === 'toolCall' &&
            (content as ToolCallChatResponseContentImpl).id === toolRequest.id
        ) as ToolCallChatResponseContentImpl | undefined;

        if (!existingContent) {
            throw new Error(`Tool call content for tool ${toolRequest.id} not found in the response`);
        }

        return existingContent;
    }
}
