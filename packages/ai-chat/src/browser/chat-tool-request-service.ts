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
import { ChatToolRequestService } from '../common/chat-tool-request-service';
import { MutableChatRequestModel, ToolCallChatResponseContent } from '../common/chat-model';
import { ToolConfirmationMode, ChatToolPreferences } from '../common/chat-tool-preferences';
import { ToolConfirmationManager } from './chat-tool-preference-bindings';

/**
 * Frontend-specific implementation of ChatToolRequestService that handles tool confirmation
 */
@injectable()
export class FrontendChatToolRequestService extends ChatToolRequestService {

    @inject(ILogger) @named('ChatToolRequestService')
    protected readonly logger: ILogger;

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ChatToolPreferences)
    protected readonly preferences: ChatToolPreferences;

    protected override toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ToolRequest {
        const confirmationMode = this.confirmationManager.getConfirmationMode(toolRequest.id, request.session.id, toolRequest);

        return {
            ...toolRequest,
            handler: async (arg_string: string, ctx?: ToolInvocationContext) => {
                const toolCallId = ctx?.toolCallId;

                switch (confirmationMode) {
                    case ToolConfirmationMode.DISABLED:
                        return { denied: true, message: `Tool ${toolRequest.id} is disabled` };

                    case ToolConfirmationMode.ALWAYS_ALLOW: {
                        const toolCallContentAlwaysAllow = this.findToolCallContent(toolRequest, arg_string, request, toolCallId);
                        toolCallContentAlwaysAllow.confirm();
                        const result = await toolRequest.handler(arg_string, this.createToolContext(request, ToolInvocationContext.create(toolCallContentAlwaysAllow.id)));
                        // Signal completion for immediate UI update. The language model uses Promise.all
                        // for parallel tools, so without this the UI wouldn't update until all tools finish.
                        // The result will be overwritten with the same value when the LLM stream yields it.
                        toolCallContentAlwaysAllow.complete(result);
                        return result;
                    }

                    case ToolConfirmationMode.CONFIRM:
                    default: {
                        const toolCallContent = this.findToolCallContent(toolRequest, arg_string, request, toolCallId);
                        const confirmed = await toolCallContent.confirmed;

                        if (confirmed) {
                            const result = await toolRequest.handler(arg_string, this.createToolContext(request, ToolInvocationContext.create(toolCallContent.id)));
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
        request: MutableChatRequestModel,
        toolCallId?: string
    ): ToolCallChatResponseContent {
        const response = request.response.response;
        const contentArray = response.content;

        // Match on toolCallId first if LLM made it available
        if (toolCallId !== undefined) {
            for (let i = contentArray.length - 1; i >= 0; i--) {
                const content = contentArray[i];
                if (ToolCallChatResponseContent.is(content) && content.id === toolCallId) {
                    return content;
                }
            }
        }

        // Some LLM providers do not return toolCallIds, so fall back to matching on tool name and arguments
        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id &&
                content.arguments === arguments_) {
                return content;
            }
        }

        // Fallback: match on tool name only
        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id &&
                !content.finished) {
                this.logger.warn(`Tool call content for tool ${toolRequest.id} matched by incomplete status fallback. ` +
                    `Expected toolCallId: ${toolCallId}, arguments: ${arguments_}`);
                return content;
            }
        }

        throw new Error(`Tool call content for tool ${toolRequest.id} not found in the response`);
    }
}
