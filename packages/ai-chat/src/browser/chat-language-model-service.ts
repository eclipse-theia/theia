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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger, PreferenceService } from '@theia/core';
import { LanguageModelServiceImpl } from '@theia/ai-core/lib/common/language-model-service';
import {
    LanguageModel,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    UserRequest,
    isLanguageModelStreamResponse,
    isToolCallResponsePart,
    ToolCall,
    ToolRequest,
    ToolCallResult,
    LanguageModelMessage,
    LanguageModelRegistry
} from '@theia/ai-core';
import { BUDGET_AWARE_TOOL_LOOP_PREF } from '../common/ai-chat-preferences';
import { ChatSessionTokenTracker, CHAT_TOKEN_THRESHOLD } from './chat-session-token-tracker';
import { ChatSessionSummarizationService } from './chat-session-summarization-service';
import { PREFERENCE_NAME_REQUEST_SETTINGS, RequestSetting } from '@theia/ai-core/lib/common/ai-core-preferences';
import { mergeRequestSettings } from '@theia/ai-core/lib/browser/frontend-language-model-service';

/**
 * Chat-specific language model service that adds budget-aware tool loop handling.
 * Extends LanguageModelServiceImpl to intercept sendRequest() calls.
 *
 * When the experimental preference is enabled, this service:
 * 1. Sets singleRoundTrip=true to prevent models from handling tool loops internally
 * 2. Manages the tool loop externally with budget checks between iterations
 * 3. Triggers summarization when token budget is exceeded mid-turn
 *
 * Models that don't support singleRoundTrip will ignore the flag - this is detected
 * by checking if tool_calls have results attached (model handled internally) vs
 * no results (model respected the flag).
 */
@injectable()
export class ChatLanguageModelServiceImpl extends LanguageModelServiceImpl {

    @inject(LanguageModelRegistry)
    protected override languageModelRegistry: LanguageModelRegistry;

    @inject(ChatSessionTokenTracker)
    protected readonly tokenTracker: ChatSessionTokenTracker;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ChatSessionSummarizationService)
    protected readonly summarizationService: ChatSessionSummarizationService;

    override async sendRequest(
        languageModel: LanguageModel,
        request: UserRequest
    ): Promise<LanguageModelResponse> {
        // Apply request settings (matching FrontendLanguageModelServiceImpl behavior)
        const requestSettings = this.preferenceService.get<RequestSetting[]>(PREFERENCE_NAME_REQUEST_SETTINGS, []);
        const ids = languageModel.id.split('/');
        const matchingSetting = mergeRequestSettings(requestSettings, ids[1], ids[0], request.agentId);
        if (matchingSetting?.requestSettings) {
            request.settings = {
                ...matchingSetting.requestSettings,
                ...request.settings
            };
        }
        if (matchingSetting?.clientSettings) {
            request.clientSettings = {
                ...matchingSetting.clientSettings,
                ...request.clientSettings
            };
        }

        const budgetAwareEnabled = this.preferenceService.get<boolean>(BUDGET_AWARE_TOOL_LOOP_PREF, false);

        if (budgetAwareEnabled && request.tools?.length) {
            return this.sendRequestWithBudgetAwareness(languageModel, request);
        }

        return super.sendRequest(languageModel, request);
    }

    /**
     * Send request with budget-aware tool loop handling.
     * Manages the tool loop externally, checking token budget between iterations
     * and triggering summarization when needed.
     */
    protected async sendRequestWithBudgetAwareness(
        languageModel: LanguageModel,
        request: UserRequest
    ): Promise<LanguageModelResponse> {
        // Check if budget is exceeded BEFORE sending
        if (request.sessionId && this.isBudgetExceeded(request.sessionId)) {
            this.logger.info(`Budget exceeded before request for session ${request.sessionId}, triggering summarization...`);
            await this.summarizationService.triggerSummarization(request.sessionId, false);
        }

        const modifiedRequest: UserRequest = {
            ...request,
            singleRoundTrip: true
        };
        return this.executeToolLoop(languageModel, modifiedRequest);
    }

    /**
     * Execute the tool loop, handling tool calls and budget checks between iterations.
     */
    protected async executeToolLoop(
        languageModel: LanguageModel,
        request: UserRequest
    ): Promise<LanguageModelStreamResponse> {
        const that = this;
        const sessionId = request.sessionId;
        const tools = request.tools ?? [];

        // State that persists across the async iterator
        let currentMessages = [...request.messages];
        let pendingToolCalls: ToolCall[] = [];
        let modelHandledLoop = false;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                let continueLoop = true;

                while (continueLoop) {
                    continueLoop = false;
                    pendingToolCalls = [];
                    modelHandledLoop = false;

                    // Create request with current messages
                    const currentRequest: UserRequest = {
                        ...request,
                        messages: currentMessages,
                        singleRoundTrip: true
                    };

                    let response: LanguageModelResponse;
                    try {
                        // Call the parent's sendRequest to get the response
                        response = await LanguageModelServiceImpl.prototype.sendRequest.call(
                            that, languageModel, currentRequest
                        );
                    } catch (error) {
                        // Check if this is a "context too long" error
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        if (errorMessage.toLowerCase().includes('context') ||
                            errorMessage.toLowerCase().includes('token') ||
                            errorMessage.toLowerCase().includes('too long') ||
                            errorMessage.toLowerCase().includes('max_tokens')) {
                            that.logger.error(
                                'Context too long error for session ' + sessionId + '. ' +
                                'Cannot recover - summarization also requires an LLM call.',
                                error
                            );
                        }
                        // Re-throw to let the chat agent handle and display the error
                        throw error;
                    }

                    if (!isLanguageModelStreamResponse(response)) {
                        // Non-streaming response - just return as-is
                        // This shouldn't happen with singleRoundTrip but handle gracefully
                        return;
                    }

                    // Process the stream
                    for await (const part of response.stream) {
                        // Collect tool calls to check if model respected singleRoundTrip
                        if (isToolCallResponsePart(part)) {
                            for (const toolCall of part.tool_calls) {
                                // If any tool call has a result, the model handled the loop internally
                                if (toolCall.result !== undefined) {
                                    modelHandledLoop = true;
                                }
                                // Collect finished tool calls without results (model respected singleRoundTrip)
                                if (toolCall.finished && toolCall.result === undefined && toolCall.id) {
                                    pendingToolCalls.push(toolCall);
                                }
                            }
                        }
                        yield part;
                    }

                    // If model handled the loop internally, we're done
                    if (modelHandledLoop) {
                        return;
                    }

                    // If there are pending tool calls, execute them and continue the loop
                    if (pendingToolCalls.length > 0) {
                        // Execute tools
                        const toolResults = await that.executeTools(pendingToolCalls, tools);

                        // Check budget after tool execution
                        if (that.isBudgetExceeded(sessionId)) {
                            that.logger.info(`Budget exceeded after tool execution for session ${sessionId}, triggering summarization...`);
                            // Pass skipReorder=true for mid-turn summarization to avoid disrupting the active request
                            await that.summarizationService.triggerSummarization(sessionId, true);
                        }

                        // Append tool messages to current messages
                        currentMessages = that.appendToolMessages(
                            currentMessages,
                            pendingToolCalls,
                            toolResults
                        );

                        // Yield tool call results
                        const resultsToYield = pendingToolCalls.map(tc => ({
                            finished: true,
                            id: tc.id,
                            result: toolResults.get(tc.id!),
                            function: tc.function
                        }));
                        yield { tool_calls: resultsToYield };

                        continueLoop = true;
                    }
                }
            }
        };

        return { stream: asyncIterator };
    }

    /**
     * Check if the token budget is exceeded for a session.
     */
    protected isBudgetExceeded(sessionId: string): boolean {
        const tokens = this.tokenTracker.getSessionInputTokens(sessionId);
        return tokens !== undefined && tokens >= CHAT_TOKEN_THRESHOLD;
    }

    /**
     * Execute tool calls and collect results.
     */
    protected async executeTools(
        toolCalls: ToolCall[],
        toolRequests: ToolRequest[]
    ): Promise<Map<string, ToolCallResult>> {
        const results = new Map<string, ToolCallResult>();

        for (const toolCall of toolCalls) {
            const toolRequest = toolRequests.find(t => t.name === toolCall.function?.name);
            if (toolRequest && toolCall.id && toolCall.function?.arguments) {
                try {
                    const result = await toolRequest.handler(toolCall.function.arguments);
                    results.set(toolCall.id, result);
                } catch (error) {
                    this.logger.error(`Tool execution failed for ${toolCall.function?.name}:`, error);
                    results.set(toolCall.id, { type: 'error', data: String(error) } as ToolCallResult);
                }
            }
        }

        return results;
    }

    /**
     * Append tool_use and tool_result messages to the message array.
     */
    protected appendToolMessages(
        messages: LanguageModelMessage[],
        toolCalls: ToolCall[],
        toolResults: Map<string, ToolCallResult>
    ): LanguageModelMessage[] {
        const newMessages: LanguageModelMessage[] = [...messages];

        // Add tool_use messages (AI requesting tool calls)
        for (const toolCall of toolCalls) {
            if (toolCall.id && toolCall.function?.name) {
                newMessages.push({
                    actor: 'ai',
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
                });
            }
        }

        // Add tool_result messages (user providing results)
        for (const toolCall of toolCalls) {
            if (toolCall.id && toolCall.function?.name) {
                const result = toolResults.get(toolCall.id);
                newMessages.push({
                    actor: 'user',
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    name: toolCall.function.name,
                    content: result
                });
            }
        }

        return newMessages;
    }
}

