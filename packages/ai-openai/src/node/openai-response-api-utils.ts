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
    ImageContent,
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelStreamResponsePart,
    TextMessage,
    TokenUsageService,
    ToolCallErrorResult,
    ToolRequest,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { OpenAI } from 'openai';
import type { RunnerOptions } from 'openai/lib/AbstractChatCompletionRunner';
import type { FunctionTool, ResponseInputItem, ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { ResponsesModel } from 'openai/resources/shared';
import { DeveloperMessageSettings, OpenAiModelUtils } from './openai-language-model';

/**
 * Utility class for handling OpenAI Response API requests and tool calling cycles.
 *
 * This class encapsulates the complexity of the Response API's multi-turn conversation
 * patterns for tool calling, keeping the main language model class clean and focused.
 */
@injectable()
export class OpenAiResponseApiUtils {

    /**
     * Handles streaming Response API requests with proper tool calling cycles.
     */
    async handleStreamingRequest(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: DeveloperMessageSettings,
        runnerOptions: RunnerOptions,
        modelId: string,
        tokenUsageService?: TokenUsageService,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponse> {
        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }

        // If no tools are provided, use simple streaming
        if (!request.tools || request.tools.length === 0) {
            const { instructions, input } = this.processMessages(request.messages, developerMessageSettings, model);
            const stream = openai.responses.stream({
                model: model as ResponsesModel,
                instructions,
                input,
                ...settings
            });

            return { stream: this.createSimpleResponseApiStreamIterator(stream, request.requestId, modelId, tokenUsageService, cancellationToken) };
        }

        // Handle tool calling with multi-turn conversation
        return {
            stream: this.createToolCallResponseApiStreamIterator(
                openai, request, settings, model, modelUtils, developerMessageSettings,
                runnerOptions, modelId, tokenUsageService, cancellationToken
            )
        };
    }

    /**
     * Handles non-streaming Response API requests with proper tool calling cycles.
     */
    async handleNonStreamingRequest(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: DeveloperMessageSettings,
        runnerOptions: RunnerOptions,
        modelId: string,
        tokenUsageService?: TokenUsageService
    ): Promise<LanguageModelResponse> {
        // If no tools are provided, use simple non-streaming
        if (!request.tools || request.tools.length === 0) {
            const { instructions, input } = this.processMessages(request.messages, developerMessageSettings, model);
            const response = await openai.responses.create({
                model: model as ResponsesModel,
                instructions,
                input,
                ...settings
            });

            // Record token usage if available
            if (tokenUsageService && response.usage) {
                await tokenUsageService.recordTokenUsage(
                    modelId,
                    {
                        inputTokens: response.usage.input_tokens,
                        outputTokens: response.usage.output_tokens,
                        requestId: request.requestId
                    }
                );
            }

            return {
                text: response.output_text || ''
            };
        }

        // Handle tool calling with multi-turn conversation
        return this.executeNonStreamingToolCallCycle(openai, request, settings, model, modelUtils, developerMessageSettings, runnerOptions, modelId, tokenUsageService);
    }

    /**
     * Converts ToolRequest objects to the format expected by the Response API.
     */
    convertToolsForResponseApi(tools?: ToolRequest[]): FunctionTool[] | undefined {
        if (!tools || tools.length === 0) {
            return undefined;
        }

        const converted = tools.map(tool => ({
            type: 'function' as const,
            name: tool.name,
            description: tool.description || '',
            // The Response API is very strict re: JSON schema: all properties must be listed as required,
            // and additional properties must be disallowed.
            parameters: {
                ...tool.parameters,
                additionalProperties: false,
                required: tool.parameters.properties ? Object.keys(tool.parameters.properties) : []
            },
            strict: true
        }));
        console.debug(`Converted ${tools.length} tools for Response API:`, converted.map(t => t.name));
        return converted;
    }

    protected createSimpleResponseApiStreamIterator(
        stream: AsyncIterable<ResponseStreamEvent>,
        requestId: string,
        modelId: string,
        tokenUsageService?: TokenUsageService,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        return {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                try {
                    for await (const event of stream) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }

                        if (event.type === 'response.output_text.delta') {
                            yield {
                                content: event.delta
                            };
                        } else if (event.type === 'response.completed') {
                            if (tokenUsageService && event.response?.usage) {
                                await tokenUsageService.recordTokenUsage(
                                    modelId,
                                    {
                                        inputTokens: event.response.usage.input_tokens,
                                        outputTokens: event.response.usage.output_tokens,
                                        requestId
                                    }
                                );
                            }
                        } else if (event.type === 'error') {
                            console.error('Response API error:', event.message);
                            throw new Error(`Response API error: ${event.message}`);
                        }
                    }
                } catch (error) {
                    console.error('Error in Response API stream:', error);
                    throw error;
                }
            }
        };
    }

    protected createToolCallResponseApiStreamIterator(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: DeveloperMessageSettings,
        runnerOptions: RunnerOptions,
        modelId: string,
        tokenUsageService?: TokenUsageService,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        const self = this;
        return {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                try {
                    const { instructions, input: initialInput } = self.processMessages(request.messages, developerMessageSettings, model);
                    const tools = self.convertToolsForResponseApi(request.tools);
                    let currentInput = initialInput;
                    let totalInputTokens = 0;
                    let totalOutputTokens = 0;

                    const maxIterations = runnerOptions.maxChatCompletions || 100;
                    let iteration = 0;
                    // Track tool calls across iterations to maintain continuity
                    const globalToolCalls: { [itemId: string]: { name: string; arguments: string; result?: unknown; error?: Error } } = {};

                    while (iteration < maxIterations) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }

                        console.debug(`Starting Response API iteration ${iteration} with ${currentInput.length} input messages`);
                        if (tools && tools.length > 0) {
                            console.debug('Tools available for this iteration:', tools.map(t => t.name));
                        }
                        const stream = openai.responses.stream({
                            model: model as ResponsesModel,
                            instructions,
                            input: currentInput,
                            tools,
                            ...settings
                        });

                        const currentIterationToolCalls: { [itemId: string]: { name: string; arguments: string; result?: unknown; error?: Error } } = {};
                        let hasToolCalls = false;
                        let responseText = '';
                        let currentUsage: { input_tokens: number; output_tokens: number } | undefined;

                        // Process the stream for this iteration
                        for await (const event of stream) {
                            if (cancellationToken?.isCancellationRequested) {
                                break;
                            }

                            if (event.type === 'response.output_text.delta') {
                                yield {
                                    content: event.delta
                                };
                                responseText += event.delta;
                                // Note: The Response API doesn't seem to have these specific event types.
                                // Function call events come through response.function_call_arguments.delta and .done
                            } else if (event.type === 'response.function_call_arguments.delta') {
                                // Handle function call argument streaming
                                if (!currentIterationToolCalls[event.item_id]) {
                                    // First time seeing this tool call - initialize and yield "started" state
                                    currentIterationToolCalls[event.item_id] = {
                                        name: '', // Will be set in the done event
                                        arguments: ''
                                    };
                                    globalToolCalls[event.item_id] = currentIterationToolCalls[event.item_id];
                                    yield {
                                        tool_calls: [{
                                            id: event.item_id,
                                            finished: false,
                                            function: {
                                                name: '',
                                                arguments: ''
                                            }
                                        }]
                                    };
                                }
                                // Accumulate arguments delta
                                currentIterationToolCalls[event.item_id].arguments += event.delta;
                                globalToolCalls[event.item_id].arguments = currentIterationToolCalls[event.item_id].arguments;

                                // Yield argument progress
                                if (event.delta) {
                                    yield {
                                        tool_calls: [{
                                            id: event.item_id,
                                            function: {
                                                arguments: event.delta
                                            }
                                        }]
                                    };
                                }
                            } else if (event.type === 'response.function_call_arguments.done') {
                                hasToolCalls = true;
                                console.debug(`Tool call completed: ${event.item_id} - ${event.name}`);
                                if (!currentIterationToolCalls[event.item_id]) {
                                    // Handle case where we didn't see delta events
                                    currentIterationToolCalls[event.item_id] = { name: event.name, arguments: event.arguments };
                                    globalToolCalls[event.item_id] = currentIterationToolCalls[event.item_id];
                                    yield {
                                        tool_calls: [{
                                            id: event.item_id,
                                            finished: false,
                                            function: {
                                                name: event.name,
                                                arguments: event.arguments
                                            }
                                        }]
                                    };
                                } else {
                                    // Update with final values
                                    currentIterationToolCalls[event.item_id].name = event.name;
                                    currentIterationToolCalls[event.item_id].arguments = event.arguments;
                                    globalToolCalls[event.item_id].name = event.name;
                                    globalToolCalls[event.item_id].arguments = event.arguments;
                                }

                                // Execute the tool and yield the result
                                if (!currentIterationToolCalls[event.item_id].result && !currentIterationToolCalls[event.item_id].error) {
                                    const tool = request.tools?.find(t => t.name === event.name);
                                    if (tool) {
                                        try {
                                            const result = await tool.handler(event.arguments);
                                            currentIterationToolCalls[event.item_id].result = result; // Store result for next iteration
                                            globalToolCalls[event.item_id].result = result;
                                            yield {
                                                tool_calls: [{
                                                    id: event.item_id,
                                                    finished: true,
                                                    function: {
                                                        name: event.name,
                                                        arguments: event.arguments
                                                    },
                                                    result
                                                }]
                                            };
                                        } catch (error) {
                                            console.error(`Error executing tool ${event.name}:`, error);
                                            const errorObj = error instanceof Error ? error : new Error(String(error));
                                            currentIterationToolCalls[event.item_id].error = errorObj; // Store error
                                            globalToolCalls[event.item_id].error = errorObj;
                                            const errorResult: ToolCallErrorResult = {
                                                type: 'error',
                                                data: error instanceof Error ? error.message : String(error)
                                            };
                                            yield {
                                                tool_calls: [{
                                                    id: event.item_id,
                                                    finished: true,
                                                    function: {
                                                        name: event.name,
                                                        arguments: event.arguments
                                                    },
                                                    result: errorResult
                                                }]
                                            };
                                        }
                                    } else {
                                        console.warn(`Tool ${event.name} not found in request tools`);
                                        const errorObj = new Error(`Tool ${event.name} not found`);
                                        currentIterationToolCalls[event.item_id].error = errorObj;
                                        globalToolCalls[event.item_id].error = errorObj;
                                        const errorResult: ToolCallErrorResult = {
                                            type: 'error',
                                            data: `Tool ${event.name} not found`
                                        };
                                        yield {
                                            tool_calls: [{
                                                id: event.item_id,
                                                finished: true,
                                                function: {
                                                    name: event.name,
                                                    arguments: event.arguments
                                                },
                                                result: errorResult
                                            }]
                                        };
                                    }
                                }
                            } else if (event.type === 'response.completed') {
                                currentUsage = event.response?.usage;
                            } else if (event.type === 'error') {
                                console.error('Response API error:', event.message);
                                // Log current tool calls state for debugging
                                console.debug('Current tool calls state:', Object.keys(currentIterationToolCalls));
                                console.debug('Global tool calls state:', Object.keys(globalToolCalls));
                                // If this is a tool call error, log more details
                                if (event.message?.includes('No tool call found')) {
                                    console.error('Tool call error details:', {
                                        currentIterationCalls: Object.keys(currentIterationToolCalls),
                                        globalCalls: Object.keys(globalToolCalls),
                                        lastInput: currentInput.slice(-3) // Last 3 messages for context
                                    });
                                }
                                throw new Error(`Response API error: ${event.message}`);
                            }
                        }

                        // Accumulate token usage
                        if (currentUsage) {
                            totalInputTokens += currentUsage.input_tokens;
                            totalOutputTokens += currentUsage.output_tokens;
                        }

                        // If no tool calls were made, we're done
                        if (!hasToolCalls) {
                            break;
                        }

                        // Ensure all tool calls have been executed before proceeding
                        const unexecutedCalls = Object.entries(currentIterationToolCalls).filter(
                            ([_, toolCall]) => toolCall.result === undefined && toolCall.error === undefined
                        );
                        if (unexecutedCalls.length > 0) {
                            console.warn(`${unexecutedCalls.length} tool calls were not executed:`, unexecutedCalls.map(([id, _]) => id));
                            // Mark them as errors to prevent infinite loops
                            for (const [itemId, toolCall] of unexecutedCalls) {
                                toolCall.error = new Error('Tool call was not executed');
                                globalToolCalls[itemId].error = toolCall.error;
                            }
                        }

                        // Prepare tool results for next iteration using stored results from tool executions above
                        const toolResults: ResponseInputItem[] = [];
                        console.debug(`Preparing tool results for ${Object.keys(currentIterationToolCalls).length} tool calls`);
                        for (const [itemId, toolCall] of Object.entries(currentIterationToolCalls)) {
                            console.debug(`Processing tool result for item_id: ${itemId}`);
                            if (toolCall.result !== undefined) {
                                const resultContent = typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result);
                                toolResults.push({
                                    type: 'function_call_output',
                                    call_id: itemId, // Use the item_id as call_id for consistency
                                    output: resultContent
                                });
                                console.debug(`Added result for tool call ${itemId}`);
                            } else if (toolCall.error) {
                                toolResults.push({
                                    type: 'function_call_output',
                                    call_id: itemId, // Use the item_id as call_id for consistency
                                    output: `Error: ${toolCall.error.message}`
                                });
                                console.debug(`Added error result for tool call ${itemId}`);
                            } else {
                                console.warn(`Tool call ${itemId} has no result or error - this may cause issues`);
                            }
                        }

                        // Add assistant response and tool results to conversation
                        const assistantMessage: ResponseInputItem = {
                            role: 'assistant',
                            content: responseText || ''
                        };

                        // Validate tool results before adding them to the conversation
                        if (toolResults.length > 0) {
                            console.debug(`Adding ${toolResults.length} tool results to conversation for next iteration`);
                            // Ensure all tool results have valid call_ids
                            const validToolResults = toolResults.filter(result => {
                                if (result.type === 'function_call_output' && !(result as { call_id?: string }).call_id) {
                                    console.warn('Tool result missing call_id:', result);
                                    return false;
                                }
                                return true;
                            });
                            if (validToolResults.length !== toolResults.length) {
                                console.warn(`Filtered out ${toolResults.length - validToolResults.length} invalid tool results`);
                            }
                            currentInput = [...currentInput, assistantMessage, ...validToolResults];
                        } else {
                            currentInput = [...currentInput, assistantMessage];
                        }
                        iteration++;
                    }

                    // Record final token usage
                    if (tokenUsageService && (totalInputTokens > 0 || totalOutputTokens > 0)) {
                        await tokenUsageService.recordTokenUsage(
                            modelId,
                            {
                                inputTokens: totalInputTokens,
                                outputTokens: totalOutputTokens,
                                requestId: request.requestId
                            }
                        );
                    }
                } catch (error) {
                    console.error('Error in Response API tool call stream:', error);
                    throw error;
                }
            }
        };
    }

    protected async executeNonStreamingToolCallCycle(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: DeveloperMessageSettings,
        runnerOptions: RunnerOptions,
        modelId: string,
        tokenUsageService?: TokenUsageService
    ): Promise<LanguageModelResponse> {
        const { instructions, input: initialInput } = this.processMessages(request.messages, developerMessageSettings, model);
        const tools = this.convertToolsForResponseApi(request.tools);
        let currentInput = initialInput;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalText = '';

        // Maximum number of tool calling iterations to prevent infinite loops
        const maxIterations = runnerOptions.maxChatCompletions || 100;
        let iteration = 0;

        while (iteration < maxIterations) {
            const response = await openai.responses.create({
                model: model as ResponsesModel,
                instructions,
                input: currentInput,
                tools,
                ...settings
            });

            // Accumulate token usage
            if (response.usage) {
                totalInputTokens += response.usage.input_tokens;
                totalOutputTokens += response.usage.output_tokens;
            }

            // Check for function calls in the response
            const functionCalls = response.output?.filter(item => item.type === 'function_call') || [];

            if (functionCalls.length === 0) {
                // No more tool calls, we're done
                finalText = response.output_text || '';
                break;
            }

            // Execute all function calls and collect results
            const toolResults: ResponseInputItem[] = [];
            for (const functionCall of functionCalls) {
                if (functionCall.type === 'function_call') {
                    const tool = request.tools?.find(t => t.name === functionCall.name);
                    if (tool) {
                        try {
                            const result = await tool.handler(functionCall.arguments);
                            const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
                            toolResults.push({
                                type: 'function_call_output',
                                call_id: functionCall.call_id, // Ensure call_id is preserved correctly
                                output: resultContent
                            });
                        } catch (error) {
                            console.error(`Error executing tool ${functionCall.name}:`, error);
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            toolResults.push({
                                type: 'function_call_output',
                                call_id: functionCall.call_id, // Ensure call_id is preserved correctly
                                output: `Error: ${errorMessage}`
                            });
                        }
                    } else {
                        console.warn(`Tool ${functionCall.name} not found in request tools`);
                        toolResults.push({
                            type: 'function_call_output',
                            call_id: functionCall.call_id, // Ensure call_id is preserved correctly
                            output: `Error: Tool ${functionCall.name} not found`
                        });
                    }
                }
            }

            // Add the assistant's response (with function calls) and tool results to the conversation
            const assistantMessage: ResponseInputItem = {
                role: 'assistant',
                content: response.output_text || ''
            };

            // Update input for next iteration
            currentInput = [...currentInput, assistantMessage, ...toolResults];
            iteration++;
        }

        // Record final token usage if available
        if (tokenUsageService && (totalInputTokens > 0 || totalOutputTokens > 0)) {
            await tokenUsageService.recordTokenUsage(
                modelId,
                {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    requestId: request.requestId
                }
            );
        }

        return {
            text: finalText
        };
    }

    /**
     * Processes the provided list of messages by applying system message adjustments and converting
     * them directly to the format expected by the OpenAI Response API.
     *
     * This method converts messages directly without going through ChatCompletionMessageParam types.
     *
     * @param messages the list of messages to process.
     * @param developerMessageSettings how system and developer messages are handled during processing.
     * @param model the OpenAI model identifier. Currently not used, but allows subclasses to implement model-specific behavior.
     * @returns an object containing instructions and input formatted for the Response API.
     */
    processMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): { instructions?: string; input: ResponseInputItem[] } {
        const processed = this.processSystemMessages(messages, developerMessageSettings)
            .filter(m => m.type !== 'thinking');

        // Extract system/developer messages for instructions
        const systemMessages = processed.filter((m): m is TextMessage => m.type === 'text' && m.actor === 'system');
        const instructions = systemMessages.length > 0
            ? systemMessages.map(m => m.text).join('\n')
            : undefined;

        // Convert non-system messages to Response API input items
        const nonSystemMessages = processed.filter(m => m.actor !== 'system');
        const input: ResponseInputItem[] = [];

        for (const message of nonSystemMessages) {
            if (LanguageModelMessage.isTextMessage(message)) {
                if (message.actor === 'ai') {
                    // Assistant messages use ResponseOutputMessage format
                    input.push({
                        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                        type: 'message',
                        role: 'assistant',
                        status: 'completed',
                        content: [{
                            type: 'output_text',
                            text: message.text,
                            annotations: []
                        }]
                    });
                } else {
                    // User messages use input format
                    input.push({
                        type: 'message',
                        role: 'user',
                        content: [{
                            type: 'input_text',
                            text: message.text
                        }]
                    });
                }
            } else if (LanguageModelMessage.isToolUseMessage(message)) {
                input.push({
                    type: 'function_call',
                    call_id: message.id,
                    name: message.name,
                    arguments: JSON.stringify(message.input)
                });
            } else if (LanguageModelMessage.isToolResultMessage(message)) {
                const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
                input.push({
                    type: 'function_call_output',
                    call_id: message.tool_use_id,
                    output: content
                });
            } else if (LanguageModelMessage.isImageMessage(message) && message.actor === 'user') {
                input.push({
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_image',
                        detail: 'auto',
                        image_url: ImageContent.isBase64(message.image) ?
                            `data:${message.image.mimeType};base64,${message.image.base64data}` :
                            message.image.url
                    }]
                });
            } else {
                console.warn(`Unknown message type for Response API: '${JSON.stringify(message)}'`);
            }
        }

        return { instructions, input };
    }

    protected processSystemMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings
    ): LanguageModelMessage[] {
        return processSystemMessages(messages, developerMessageSettings);
    }
}

export function processSystemMessages(
    messages: LanguageModelMessage[],
    developerMessageSettings: DeveloperMessageSettings
): LanguageModelMessage[] {
    if (developerMessageSettings === 'skip') {
        return messages.filter(message => message.actor !== 'system');
    } else if (developerMessageSettings === 'mergeWithFollowingUserMessage') {
        const updated = messages.slice();
        for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].actor === 'system') {
                const systemMessage = updated[i] as TextMessage;
                if (i + 1 < updated.length && updated[i + 1].actor === 'user') {
                    // Merge system message with the next user message
                    const userMessage = updated[i + 1] as TextMessage;
                    updated[i + 1] = {
                        ...updated[i + 1],
                        text: systemMessage.text + '\n' + userMessage.text
                    } as TextMessage;
                    updated.splice(i, 1);
                } else {
                    // The message directly after is not a user message (or none exists), so create a new user message right after
                    updated.splice(i + 1, 0, { actor: 'user', type: 'text', text: systemMessage.text });
                    updated.splice(i, 1);
                }
            }
        }
        return updated;
    }
    return messages;
}
