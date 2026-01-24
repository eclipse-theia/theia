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
import { ToolConfirmationMode, ChatToolPreferences } from '../common/chat-tool-preferences';
import { ToolConfirmationManager } from './chat-tool-preference-bindings';

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
        const confirmationMode = this.confirmationManager.getConfirmationMode(toolRequest.id, request.session.id, toolRequest);

        return {
            ...toolRequest,
            handler: async (arg_string: string) => {
                switch (confirmationMode) {
                    case ToolConfirmationMode.DISABLED:
                        return { denied: true, message: `Tool ${toolRequest.id} is disabled` };

                    case ToolConfirmationMode.ALWAYS_ALLOW: {
                        const toolCallContentAlwaysAllow = this.findToolCallContent(toolRequest, arg_string, request);
                        toolCallContentAlwaysAllow.confirm();
                        const result = await toolRequest.handler(arg_string, this.createToolContext(request, toolCallContentAlwaysAllow.id));
                        // Signal completion for immediate UI update. The language model uses Promise.all
                        // for parallel tools, so without this the UI wouldn't update until all tools finish.
                        // The result will be overwritten with the same value when the LLM stream yields it.
                        toolCallContentAlwaysAllow.complete(result);
                        return result;
                    }

                    case ToolConfirmationMode.CONFIRM:
                    default: {
                        const toolCallContent = this.findToolCallContent(toolRequest, arg_string, request);
                        const confirmed = await toolCallContent.confirmed;

                        if (confirmed) {
                            const result = await toolRequest.handler(arg_string, this.createToolContext(request, toolCallContent.id));
                            // Signal completion for immediate UI update (see ALWAYS_ALLOW case for details)
                            toolCallContent.complete(result);
                            return result;
                        } else {
                            return toolCallContent.result;
                        }
                    }
                }
            }
        };
    }

    protected findToolCallContent(
        toolRequest: ToolRequest,
        arguments_: string,
        request: MutableChatRequestModel
    ): ToolCallChatResponseContent {
        const response = request.response.response;
        const contentArray = response.content;

        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id &&
                content.arguments === arguments_) {
                return content;
            }
        }

        throw new Error(`Tool call content for tool ${toolRequest.id} not found in the response`);
    }
}
