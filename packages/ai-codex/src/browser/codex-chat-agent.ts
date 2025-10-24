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
    ChatAgent,
    ChatAgentLocation,
    ErrorChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    ToolCallChatResponseContent,
} from '@theia/ai-chat';
import { TokenUsageService } from '@theia/ai-core';
import { PromptText } from '@theia/ai-core/lib/common/prompt-text';
import { generateUuid, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AgentMessageItem,
    CommandExecutionItem,
    ItemCompletedEvent,
    ItemStartedEvent,
    StreamEvent,
    TokenUsage,
    TurnCompletedEvent,
    TurnFailedEvent
} from '../common';
import { CodexToolCallChatResponseContent } from './codex-tool-call-content';
import { CodexFrontendService } from './codex-frontend-service';

export const CODEX_CHAT_AGENT_ID = 'Codex';
export const CODEX_INPUT_TOKENS_KEY = 'codexInputTokens';
export const CODEX_OUTPUT_TOKENS_KEY = 'codexOutputTokens';
export const CODEX_TOOL_CALLS_KEY = 'codexToolCalls';

/**
 * Chat agent for OpenAI Codex integration.
 * Handles user requests, processes streaming responses, tracks token usage,
 * and renders different types of content (text, commands, errors).
 */
@injectable()
export class CodexChatAgent implements ChatAgent {
    id = CODEX_CHAT_AGENT_ID;
    name = 'Codex';
    description = nls.localize('theia/ai/codex/agentDescription',
        'OpenAI\'s coding assistant powered by Codex');
    iconClass = 'codicon codicon-robot';
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;
    tags = [nls.localizeByDefault('Chat')];
    variables: string[] = [];
    prompts: [] = [];
    languageModelRequirements: [] = [];
    agentSpecificVariables: [] = [];
    functions: string[] = [];

    @inject(CodexFrontendService)
    protected codexService: CodexFrontendService;

    @inject(TokenUsageService)
    protected tokenUsageService: TokenUsageService;

    /**
     * Invoke the chat agent with a user request.
     * @param request The chat request to process
     */
    async invoke(request: MutableChatRequestModel): Promise<void> {
        try {
            // Extract prompt text, removing agent address if present
            const agentAddress = `${PromptText.AGENT_CHAR}${CODEX_CHAT_AGENT_ID}`;
            let prompt = request.request.text.trim();
            if (prompt.startsWith(agentAddress)) {
                prompt = prompt.replace(agentAddress, '').trim();
            }

            // Send request to Codex service
            const streamResult = await this.codexService.send(
                { prompt },
                request.response.cancellationToken
            );

            // Process streaming responses
            for await (const event of streamResult) {
                this.handleEvent(event, request);
            }

            request.response.complete();
        } catch (error) {
            console.error('Codex error:', error);
            request.response.response.addContent(
                new ErrorChatResponseContentImpl(error)
            );
            request.response.error(error);
        }
    }

    /**
     * Get or create tool calls map for tracking in-progress tool calls.
     * @param request The chat request
     * @returns Map of tool call IDs to tool call content
     */
    protected getToolCalls(request: MutableChatRequestModel): Map<string, CodexToolCallChatResponseContent> {
        let toolCalls = request.getDataByKey(CODEX_TOOL_CALLS_KEY) as Map<string, CodexToolCallChatResponseContent> | undefined;
        if (!toolCalls) {
            toolCalls = new Map();
            request.addData(CODEX_TOOL_CALLS_KEY, toolCalls);
        }
        return toolCalls;
    }

    /**
     * Handle individual SDK events from the stream.
     * @param event The SDK event to process
     * @param request The chat request being processed
     */
    protected handleEvent(event: StreamEvent, request: MutableChatRequestModel): void {
        if (event.type === 'item.started') {
            this.handleItemStarted(event, request);
        } else if (ItemCompletedEvent.is(event)) {
            this.handleItemCompleted(event, request);
        } else if (TurnCompletedEvent.is(event)) {
            this.handleTurnCompleted(event, request);
        } else if (TurnFailedEvent.is(event)) {
            this.handleTurnFailed(event, request);
        }
    }

    /**
     * Handle started item events (commands starting).
     * Creates a pending tool call that will be updated when the item completes.
     * @param event The item started event
     * @param request The chat request being processed
     */
    protected handleItemStarted(event: ItemStartedEvent, request: MutableChatRequestModel): void {
        const item = event.item;

        if (item.type === 'command_execution') {
            // Generate unique ID for this tool call
            const toolCallId = generateUuid();

            // Extract command if available
            const command = (item as { command?: string }).command || 'executing...';

            // Create tool call content (not finished yet, no result)
            const toolCall = new CodexToolCallChatResponseContent(
                toolCallId,
                'command_execution',
                JSON.stringify({ command }),
                false,  // not finished
                undefined  // no result yet
            );

            // Store for later completion
            this.getToolCalls(request).set(toolCallId, toolCall);

            // Add to response immediately so user sees it's in progress
            request.response.response.addContent(toolCall);
        }
    }

    /**
     * Handle completed item events (commands, messages).
     * Updates the pending tool call with results or creates a new one if no pending call exists.
     * @param event The item completed event
     * @param request The chat request being processed
     */
    protected handleItemCompleted(event: ItemCompletedEvent, request: MutableChatRequestModel): void {
        const item = event.item;

        if (CommandExecutionItem.is(item)) {
            // Try to find the matching pending tool call
            const toolCalls = this.getToolCalls(request);
            let toolCall: CodexToolCallChatResponseContent | undefined;

            // Find the matching tool call by command string
            // This prevents matching the wrong tool call if multiple commands are in progress
            for (const [id, call] of toolCalls.entries()) {
                // Cast to interface to access getters
                const toolCallContent = call as ToolCallChatResponseContent;
                if (toolCallContent.name !== 'command_execution' || toolCallContent.finished) {
                    continue;
                }

                // Match by command string from the arguments
                try {
                    const args = toolCallContent.arguments ? JSON.parse(toolCallContent.arguments) : {};
                    if (args.command === item.command) {
                        toolCall = call;
                        // Mark as complete by updating the call in place
                        // Since ToolCallChatResponseContentImpl properties are protected,
                        // we'll create a new instance and replace in the response
                        const updatedCall = new CodexToolCallChatResponseContent(
                            id,
                            'command_execution',
                            JSON.stringify({ command: item.command }),
                            true,  // finished
                            JSON.stringify(item)  // result
                        );
                        toolCalls.set(id, updatedCall);
                        // The response will be notified of the change via merge mechanism
                        request.response.response.addContent(updatedCall);
                        break;
                    }
                } catch {
                    // JSON parse error, skip this tool call
                    continue;
                }
            }

            // Fallback: If we didn't find a pending tool call (e.g., if we missed the started event
            // or if command strings don't match), create a new completed tool call
            if (!toolCall) {
                const toolCallId = generateUuid();
                const newToolCall = new CodexToolCallChatResponseContent(
                    toolCallId,
                    'command_execution',
                    JSON.stringify({ command: item.command }),
                    true,  // finished
                    JSON.stringify(item)  // result
                );
                toolCalls.set(toolCallId, newToolCall);
                request.response.response.addContent(newToolCall);
            }
        } else if (AgentMessageItem.is(item)) {
            // Render agent text message
            request.response.response.addContent(
                new MarkdownChatResponseContentImpl(item.text)
            );
        }
    }

    /**
     * Handle turn completion event with token usage.
     * @param event The turn completed event
     * @param request The chat request being processed
     */
    protected handleTurnCompleted(event: TurnCompletedEvent, request: MutableChatRequestModel): void {
        const usage = event.usage;
        this.updateTokens(request, usage.input_tokens, usage.output_tokens);
        this.reportTokenUsage(request, usage);
    }

    /**
     * Handle turn failure event.
     * @param event The turn failed event
     * @param request The chat request being processed
     */
    protected handleTurnFailed(event: TurnFailedEvent, request: MutableChatRequestModel): void {
        const errorMsg = event.error.message;
        request.response.response.addContent(
            new ErrorChatResponseContentImpl(new Error(errorMsg))
        );
    }

    /**
     * Update token counts for the current request.
     * @param request The chat request
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     */
    protected updateTokens(request: MutableChatRequestModel, inputTokens: number, outputTokens: number): void {
        request.addData(CODEX_INPUT_TOKENS_KEY, inputTokens);
        request.addData(CODEX_OUTPUT_TOKENS_KEY, outputTokens);
        this.updateSessionSuggestion(request);
    }

    /**
     * Update session suggestion display with total token counts.
     * @param request The chat request
     */
    protected updateSessionSuggestion(request: MutableChatRequestModel): void {
        const { inputTokens, outputTokens } = this.getSessionTotalTokens(request);
        const formatTokens = (tokens: number): string => {
            if (tokens >= 1000) {
                return `${(tokens / 1000).toFixed(1)}K`;
            }
            return tokens.toString();
        };
        const suggestion = `↑ ${formatTokens(inputTokens)} | ↓ ${formatTokens(outputTokens)}`;
        request.session.setSuggestions([suggestion]);
    }

    /**
     * Get total token counts across all requests in the session.
     * @param request The chat request
     * @returns Object with total input and output tokens
     */
    protected getSessionTotalTokens(request: MutableChatRequestModel): { inputTokens: number; outputTokens: number } {
        const requests = request.session.getRequests();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for (const req of requests) {
            const inputTokens = req.getDataByKey(CODEX_INPUT_TOKENS_KEY) as number ?? 0;
            const outputTokens = req.getDataByKey(CODEX_OUTPUT_TOKENS_KEY) as number ?? 0;
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;
        }

        return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    /**
     * Report token usage to the token usage service.
     * @param request The chat request
     * @param usage The token usage data
     */
    protected async reportTokenUsage(request: MutableChatRequestModel, usage: TokenUsage): Promise<void> {
        try {
            await this.tokenUsageService.recordTokenUsage('openai/codex', {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                cachedInputTokens: usage.cached_input_tokens,
                requestId: request.id
            });
        } catch (error) {
            console.error('Failed to report token usage:', error);
        }
    }
}
