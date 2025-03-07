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

import {
    CommunicationRecordingService,
    isLanguageModelParsedResponse,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModel,
    LanguageModelRegistry,
    LanguageModelRequest,
    LanguageModelRequestWithRawResponse,
    LanguageModelResponse,
    LanguageModelStreamResponsePart,
} from '@theia/ai-core';
import { MutableChatRequestModel } from './chat-model';
import { inject } from '@theia/core/shared/inversify';
import { ChatHistoryEntry } from './chat-history-entry';

export const ChatLanguageModelService = Symbol('ChatLanguageModelService');
export interface ChatLanguageModelService {
    /**
     * Submit a language model request in the context of the given `chatRequest`.
     */
    sendRequest(
        languageModelRequest: LanguageModelRequest,
        chatRequest: MutableChatRequestModel,
        languageModel: LanguageModel
    ): Promise<LanguageModelResponse>;
}

export class ChatLanguageModelServiceImpl implements ChatLanguageModelService {

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    async sendRequest(
        languageModelRequest: LanguageModelRequest,
        chatRequest: MutableChatRequestModel,
        languageModel: LanguageModel
    ): Promise<LanguageModelResponse> {
        const agentId = chatRequest.agentId ?? 'unknown';
        const llmRequest: LanguageModelRequestWithRawResponse = { ...languageModelRequest };
        chatRequest.llmRequests.push(llmRequest);

        const originalResponse = await languageModel.request(languageModelRequest, chatRequest.response.cancellationToken);

        if (isLanguageModelStreamResponse(originalResponse)) {
            const stream = this.createMonitoringStream(originalResponse.stream, llmRequest);
            return { ...originalResponse, stream };
        }

        if (isLanguageModelTextResponse(originalResponse)) {
            llmRequest.response = originalResponse;
        } else if (isLanguageModelParsedResponse(originalResponse)) {
            llmRequest.response = { text: originalResponse.content };
        }
        this.recordingService.recordResponse(ChatHistoryEntry.fromResponse(agentId, chatRequest));
        return originalResponse;
    }

    protected createMonitoringStream(
        originalStream: AsyncIterable<LanguageModelStreamResponsePart>,
        llmRequest: LanguageModelRequestWithRawResponse
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const self = this;
        return {
            [Symbol.asyncIterator]: async function* (): AsyncGenerator<LanguageModelStreamResponsePart> {
                const monitoredResponse = {
                    text: llmRequest.response?.text ?? '',
                    tool_calls: llmRequest.response?.tool_calls ?? []
                };

                try {
                    for await (const chunk of originalStream) {
                        if (chunk.tool_calls?.length) {
                            for (const toolCall of chunk.tool_calls) {
                                // Find existing tool call by ID
                                let index = monitoredResponse.tool_calls.findIndex(tc => tc.id === toolCall.id);

                                // Special case: If we can't find an existing tool call by ID, the incoming tool call doesn't specify an ID, and we have existing tool calls,
                                // assume it's a continuation of the last tool call in the list
                                if (index === -1 && toolCall.id === undefined && monitoredResponse.tool_calls.length > 0) {
                                    index = monitoredResponse.tool_calls.length - 1;
                                }

                                if (index === -1) {
                                    // No matching tool call found, add new one
                                    monitoredResponse.tool_calls.push(toolCall);
                                } else {
                                    // Found matching tool call, merge the new data into the existing one
                                    const existingCall = monitoredResponse.tool_calls[index];
                                    monitoredResponse.tool_calls[index] = {
                                        id: existingCall.id ?? toolCall.id,
                                        finished: existingCall.finished ?? toolCall.finished,
                                        result: self.concatValues(existingCall.result, toolCall.result),
                                        function: {
                                            name: existingCall.function?.name ?? toolCall.function?.name,
                                            arguments: self.concatValues(existingCall.function?.arguments, toolCall.function?.arguments)
                                        }
                                    };
                                }
                            }
                        }

                        if (chunk.content) {
                            monitoredResponse.text += chunk.content;
                        }

                        yield chunk;
                    }

                    llmRequest.response = monitoredResponse;
                } catch (error) {
                    throw error;
                }
            }
        };
    }

    private concatValues(a: string | undefined, b: string | undefined): string {
        if (!a) { return b || ''; }
        if (!b) { return a; }
        return a + b;
    }

}
