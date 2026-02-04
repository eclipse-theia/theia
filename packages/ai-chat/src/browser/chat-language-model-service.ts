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
import { applyRequestSettings } from '@theia/ai-core/lib/browser/frontend-language-model-service';

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
        applyRequestSettings(request, languageModel.id, request.agentId, this.preferenceService);

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
        const modifiedRequest: UserRequest = {
            ...request,
            singleRoundTrip: true
        };
        return this.executeToolLoop(languageModel, modifiedRequest);
    }

    /**
     * Execute the tool loop, handling tool calls and budget checks between iterations.
     * This method coordinates the overall flow, delegating to helper methods for specific tasks.
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

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                let continueLoop = true;
                let iteration = 0;

                while (continueLoop) {
                    continueLoop = false;

                    // Get response from model
                    const response = await that.sendSingleRoundTripRequest(
                        languageModel, request, currentMessages, sessionId, iteration
                    );

                    // Process the stream and collect tool calls
                    const streamProcessor = that.processResponseStream(response.stream);
                    let streamResult: IteratorResult<LanguageModelStreamResponsePart, { pendingToolCalls: ToolCall[]; modelHandledLoop: boolean }>;

                    // Yield all parts from the stream processor
                    while (!(streamResult = await streamProcessor.next()).done) {
                        yield streamResult.value;
                    }

                    const { pendingToolCalls, modelHandledLoop } = streamResult.value;

                    // If model handled the loop internally, we're done
                    if (modelHandledLoop) {
                        return;
                    }

                    // If there are pending tool calls, execute them and check if we need to split
                    if (pendingToolCalls.length > 0) {
                        const { toolResults, shouldSplit } = await that.executeToolsAndCheckBudget(
                            pendingToolCalls, tools, sessionId
                        );

                        if (shouldSplit && sessionId) {
                            // Budget exceeded - mark pending split and exit cleanly
                            that.summarizationService.markPendingSplit(sessionId, request.requestId, pendingToolCalls, toolResults);
                            return;
                        }

                        // Normal case - append tool messages and continue loop
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

                        iteration++;
                        continueLoop = true;
                    }
                }
            }
        };

        return { stream: asyncIterator };
    }

    /**
     * Send a single round-trip request to the language model.
     * Handles context-too-long errors and ensures streaming response.
     */
    protected async sendSingleRoundTripRequest(
        languageModel: LanguageModel,
        request: UserRequest,
        currentMessages: LanguageModelMessage[],
        sessionId: string | undefined,
        iteration: number
    ): Promise<LanguageModelStreamResponse> {
        const currentRequest: UserRequest = {
            ...request,
            messages: currentMessages,
            singleRoundTrip: true,
            subRequestId: `${request.requestId}-${iteration}`
        };

        let response: LanguageModelResponse;
        try {
            response = await LanguageModelServiceImpl.prototype.sendRequest.call(
                this, languageModel, currentRequest
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.toLowerCase().includes('context') ||
                errorMessage.toLowerCase().includes('token') ||
                errorMessage.toLowerCase().includes('too long') ||
                errorMessage.toLowerCase().includes('max_tokens')) {
                this.logger.error(
                    'Context too long error for session ' + sessionId + '. ' +
                    'Cannot recover - summarization also requires an LLM call.',
                    error
                );
            }
            throw error;
        }

        if (!isLanguageModelStreamResponse(response)) {
            throw new Error('Budget-aware tool loop requires streaming response. Model returned non-streaming response.');
        }

        return response;
    }

    /**
     * Process a response stream, collecting tool calls and yielding parts.
     * @returns Object with pendingToolCalls and whether the model handled the loop internally
     */
    protected async *processResponseStream(
        stream: AsyncIterable<LanguageModelStreamResponsePart>
    ): AsyncGenerator<LanguageModelStreamResponsePart, { pendingToolCalls: ToolCall[]; modelHandledLoop: boolean }> {
        const pendingToolCalls: ToolCall[] = [];
        let modelHandledLoop = false;

        for await (const part of stream) {
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

        return { pendingToolCalls, modelHandledLoop };
    }

    /**
     * Execute pending tool calls and check if budget is exceeded.
     * Returns a signal indicating if the turn should be split.
     */
    protected async executeToolsAndCheckBudget(
        pendingToolCalls: ToolCall[],
        tools: ToolRequest[],
        sessionId: string | undefined
    ): Promise<{ toolResults: Map<string, ToolCallResult>; shouldSplit: boolean }> {
        const toolResults = await this.executeTools(pendingToolCalls, tools);

        const shouldSplit = sessionId !== undefined && this.isBudgetExceeded(sessionId);

        return { toolResults, shouldSplit };
    }

    /**
     * Check if the token budget is exceeded for a session.
     */
    protected isBudgetExceeded(sessionId: string | undefined): boolean {
        if (!sessionId) {
            return false;
        }
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

