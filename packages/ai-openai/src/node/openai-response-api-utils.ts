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
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable } from '@theia/core/shared/inversify';
import { OpenAI } from 'openai';
import type { RunnerOptions } from 'openai/lib/AbstractChatCompletionRunner';
import type {
    FunctionTool,
    ResponseFunctionCallArgumentsDeltaEvent,
    ResponseFunctionCallArgumentsDoneEvent,
    ResponseFunctionToolCall,
    ResponseInputItem,
    ResponseStreamEvent
} from 'openai/resources/responses/responses';
import type { ResponsesModel } from 'openai/resources/shared';
import { DeveloperMessageSettings, OpenAiModelUtils } from './openai-language-model';

interface ToolCall {
    id: string;
    call_id?: string;
    name: string;
    arguments: string;
    result?: unknown;
    error?: Error;
    executed: boolean;
}

/**
 * Utility class for handling OpenAI Response API requests and tool calling cycles.
 *
 * This class encapsulates the complexity of the Response API's multi-turn conversation
 * patterns for tool calling, keeping the main language model class clean and focused.
 */
@injectable()
export class OpenAiResponseApiUtils {

    /**
     * Handles Response API requests with proper tool calling cycles.
     * Works for both streaming and non-streaming cases.
     */
    async handleRequest(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: DeveloperMessageSettings,
        runnerOptions: RunnerOptions,
        modelId: string,
        isStreaming: boolean,
        tokenUsageService?: TokenUsageService,
        cancellationToken?: CancellationToken
    ): Promise<LanguageModelResponse> {
        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }

        const { instructions, input } = this.processMessages(request.messages, developerMessageSettings, model);
        const tools = this.convertToolsForResponseApi(request.tools);

        // If no tools are provided, use simple response handling
        if (!tools || tools.length === 0) {
            if (isStreaming) {
                const stream = openai.responses.stream({
                    model: model as ResponsesModel,
                    instructions,
                    input,
                    ...settings
                });
                return { stream: this.createSimpleResponseApiStreamIterator(stream, request.requestId, modelId, tokenUsageService, cancellationToken) };
            } else {
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

                return { text: response.output_text || '' };
            }
        }

        // Handle tool calling with multi-turn conversation using the unified iterator
        const iterator = new ResponseApiToolCallIterator(
            openai,
            request,
            settings,
            model,
            modelUtils,
            developerMessageSettings,
            runnerOptions,
            modelId,
            this,
            isStreaming,
            tokenUsageService,
            cancellationToken
        );

        return { stream: iterator };
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
            // https://platform.openai.com/docs/guides/function-calling#strict-mode
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

/**
 * Iterator for handling Response API streaming with tool calls.
 * Based on the pattern from openai-streaming-iterator.ts but adapted for Response API.
 */
class ResponseApiToolCallIterator implements AsyncIterableIterator<LanguageModelStreamResponsePart> {
    protected readonly requestQueue = new Array<Deferred<IteratorResult<LanguageModelStreamResponsePart>>>();
    protected readonly messageCache = new Array<LanguageModelStreamResponsePart>();
    protected done = false;
    protected terminalError: Error | undefined = undefined;

    // Current iteration state
    protected currentInput: ResponseInputItem[];
    protected currentToolCalls = new Map<string, ToolCall>();
    protected totalInputTokens = 0;
    protected totalOutputTokens = 0;
    protected iteration = 0;
    protected readonly maxIterations: number;
    protected readonly tools: FunctionTool[] | undefined;
    protected readonly instructions?: string;
    protected currentResponseText = '';

    constructor(
        protected readonly openai: OpenAI,
        protected readonly request: UserRequest,
        protected readonly settings: Record<string, unknown>,
        protected readonly model: string,
        protected readonly modelUtils: OpenAiModelUtils,
        protected readonly developerMessageSettings: DeveloperMessageSettings,
        protected readonly runnerOptions: RunnerOptions,
        protected readonly modelId: string,
        protected readonly utils: OpenAiResponseApiUtils,
        protected readonly isStreaming: boolean,
        protected readonly tokenUsageService?: TokenUsageService,
        protected readonly cancellationToken?: CancellationToken
    ) {
        const { instructions, input } = utils.processMessages(request.messages, developerMessageSettings, model);
        this.instructions = instructions;
        this.currentInput = input;
        this.tools = utils.convertToolsForResponseApi(request.tools);
        this.maxIterations = runnerOptions.maxChatCompletions || 100;

        // Start the first iteration
        this.startIteration();
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<LanguageModelStreamResponsePart> {
        return this;
    }

    async next(): Promise<IteratorResult<LanguageModelStreamResponsePart>> {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }

        // Deliver all the messages we got, even if we've since terminated.
        if (this.messageCache.length) {
            return {
                done: false,
                value: this.messageCache.shift()!
            };
        } else if (this.terminalError) {
            throw this.terminalError;
        } else if (this.done) {
            return {
                done: true,
                value: undefined
            };
        } else {
            const deferred = new Deferred<IteratorResult<LanguageModelStreamResponsePart>>();
            this.requestQueue.push(deferred);
            return deferred.promise;
        }
    }

    protected async startIteration(): Promise<void> {
        try {
            while (this.iteration < this.maxIterations && !this.cancellationToken?.isCancellationRequested) {
                console.debug(`Starting Response API iteration ${this.iteration} with ${this.currentInput.length} input messages`);

                await this.processStream();

                // Check if we have tool calls that need execution
                if (this.currentToolCalls.size === 0) {
                    // No tool calls, we're done
                    this.finalize();
                    return;
                }

                // Execute all tool calls
                await this.executeToolCalls();

                // Prepare for next iteration
                this.prepareNextIteration();
                this.iteration++;
            }

            // Max iterations reached
            this.finalize();
        } catch (error) {
            this.terminalError = error instanceof Error ? error : new Error(String(error));
            this.finalize();
        }
    }

    protected async processStream(): Promise<void> {
        this.currentToolCalls.clear();
        this.currentResponseText = '';

        if (this.isStreaming) {
            // Use streaming API
            const stream = this.openai.responses.stream({
                model: this.model as ResponsesModel,
                instructions: this.instructions,
                input: this.currentInput,
                tools: this.tools,
                ...this.settings
            });

            for await (const event of stream) {
                if (this.cancellationToken?.isCancellationRequested) {
                    break;
                }

                await this.handleStreamEvent(event);
            }
        } else {
            // Use non-streaming API but yield results incrementally
            await this.processNonStreamingResponse();
        }
    }

    protected async processNonStreamingResponse(): Promise<void> {
        const response = await this.openai.responses.create({
            model: this.model as ResponsesModel,
            instructions: this.instructions,
            input: this.currentInput,
            tools: this.tools,
            ...this.settings
        });

        // Record token usage
        if (response.usage) {
            this.totalInputTokens += response.usage.input_tokens;
            this.totalOutputTokens += response.usage.output_tokens;
        }

        // First, yield any text content from the response
        this.currentResponseText = response.output_text || '';
        if (this.currentResponseText) {
            this.handleIncoming({ content: this.currentResponseText });
        }

        // Find function calls in the response
        const functionCalls = response.output?.filter((item): item is ResponseFunctionToolCall => item.type === 'function_call') || [];

        // Process each function call
        for (const functionCall of functionCalls) {
            if (functionCall.id && functionCall.name) {
                const toolCall: ToolCall = {
                    id: functionCall.id,
                    call_id: functionCall.call_id || functionCall.id,
                    name: functionCall.name,
                    arguments: functionCall.arguments || '',
                    executed: false
                };

                this.currentToolCalls.set(functionCall.id, toolCall);

                // Yield the tool call initiation
                this.handleIncoming({
                    tool_calls: [{
                        id: functionCall.id,
                        finished: false,
                        function: {
                            name: functionCall.name,
                            arguments: functionCall.arguments || ''
                        }
                    }]
                });
            }
        }
    }

    protected async handleStreamEvent(event: ResponseStreamEvent): Promise<void> {
        switch (event.type) {
            case 'response.output_text.delta':
                this.currentResponseText += event.delta;
                this.handleIncoming({ content: event.delta });
                break;

            case 'response.output_item.added':
                if (event.item?.type === 'function_call') {
                    this.handleFunctionCallAdded(event.item);
                }
                break;

            case 'response.function_call_arguments.delta':
                this.handleFunctionCallArgsDelta(event);
                break;

            case 'response.function_call_arguments.done':
                await this.handleFunctionCallArgsDone(event);
                break;

            case 'response.output_item.done':
                if (event.item?.type === 'function_call') {
                    this.handleFunctionCallDone(event.item);
                }
                break;

            case 'response.completed':
                if (event.response?.usage) {
                    this.totalInputTokens += event.response.usage.input_tokens;
                    this.totalOutputTokens += event.response.usage.output_tokens;
                }
                break;

            case 'error':
                console.error('Response API error:', event.message);
                throw new Error(`Response API error: ${event.message}`);
        }
    }

    protected handleFunctionCallAdded(functionCall: ResponseFunctionToolCall): void {
        if (functionCall.id && functionCall.call_id) {
            console.debug(`Function call added: ${functionCall.name} with id ${functionCall.id} and call_id ${functionCall.call_id}`);

            const toolCall: ToolCall = {
                id: functionCall.id,
                call_id: functionCall.call_id,
                name: functionCall.name || '',
                arguments: functionCall.arguments || '',
                executed: false
            };

            this.currentToolCalls.set(functionCall.id, toolCall);

            this.handleIncoming({
                tool_calls: [{
                    id: functionCall.id,
                    finished: false,
                    function: {
                        name: functionCall.name || '',
                        arguments: functionCall.arguments || ''
                    }
                }]
            });
        }
    }

    protected handleFunctionCallArgsDelta(event: ResponseFunctionCallArgumentsDeltaEvent): void {
        const toolCall = this.currentToolCalls.get(event.item_id);
        if (toolCall) {
            toolCall.arguments += event.delta;

            if (event.delta) {
                this.handleIncoming({
                    tool_calls: [{
                        id: event.item_id,
                        function: {
                            arguments: event.delta
                        }
                    }]
                });
            }
        }
    }

    protected async handleFunctionCallArgsDone(event: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
        let toolCall = this.currentToolCalls.get(event.item_id);
        if (!toolCall) {
            // Create if we didn't see the added event
            toolCall = {
                id: event.item_id,
                name: event.name || '',
                arguments: event.arguments || '',
                executed: false
            };
            this.currentToolCalls.set(event.item_id, toolCall);

            this.handleIncoming({
                tool_calls: [{
                    id: event.item_id,
                    finished: false,
                    function: {
                        name: event.name || '',
                        arguments: event.arguments || ''
                    }
                }]
            });
        } else {
            // Update with final values
            toolCall.name = event.name || toolCall.name;
            toolCall.arguments = event.arguments || toolCall.arguments;
        }
    }

    protected handleFunctionCallDone(functionCall: ResponseFunctionToolCall): void {
        if (!functionCall.id) { console.warn('Unexpected absence of ID for call ID', functionCall.call_id); return; }
        const toolCall = this.currentToolCalls.get(functionCall.id);
        if (toolCall && !toolCall.call_id && functionCall.call_id) {
            toolCall.call_id = functionCall.call_id;
        }
    }

    protected async executeToolCalls(): Promise<void> {
        for (const [itemId, toolCall] of this.currentToolCalls) {
            if (toolCall.executed) {
                continue;
            }

            const tool = this.request.tools?.find(t => t.name === toolCall.name);
            if (tool) {
                try {
                    const result = await tool.handler(toolCall.arguments);
                    toolCall.result = result;

                    // Yield the tool call completion
                    this.handleIncoming({
                        tool_calls: [{
                            id: itemId,
                            finished: true,
                            function: {
                                name: toolCall.name,
                                arguments: toolCall.arguments
                            },
                            result
                        }]
                    });
                } catch (error) {
                    console.error(`Error executing tool ${toolCall.name}:`, error);
                    toolCall.error = error instanceof Error ? error : new Error(String(error));

                    const errorResult: ToolCallErrorResult = {
                        type: 'error',
                        data: error instanceof Error ? error.message : String(error)
                    };

                    // Yield the tool call error
                    this.handleIncoming({
                        tool_calls: [{
                            id: itemId,
                            finished: true,
                            function: {
                                name: toolCall.name,
                                arguments: toolCall.arguments
                            },
                            result: errorResult
                        }]
                    });
                }
            } else {
                console.warn(`Tool ${toolCall.name} not found in request tools`);
                toolCall.error = new Error(`Tool ${toolCall.name} not found`);

                const errorResult: ToolCallErrorResult = {
                    type: 'error',
                    data: `Tool ${toolCall.name} not found`
                };

                // Yield the tool call error
                this.handleIncoming({
                    tool_calls: [{
                        id: itemId,
                        finished: true,
                        function: {
                            name: toolCall.name,
                            arguments: toolCall.arguments
                        },
                        result: errorResult
                    }]
                });
            }

            toolCall.executed = true;
        }
    }

    protected prepareNextIteration(): void {
        // Add assistant response with the actual text that was streamed
        const assistantMessage: ResponseInputItem = {
            role: 'assistant',
            content: this.currentResponseText
        };

        // Add the function calls that were made by the assistant
        const functionCalls: ResponseInputItem[] = [];
        for (const [itemId, toolCall] of this.currentToolCalls) {
            functionCalls.push({
                type: 'function_call',
                call_id: toolCall.call_id || itemId,
                name: toolCall.name,
                arguments: toolCall.arguments
            });
        }

        // Add tool results
        const toolResults: ResponseInputItem[] = [];
        for (const [itemId, toolCall] of this.currentToolCalls) {
            const callId = toolCall.call_id || itemId;

            if (toolCall.result !== undefined) {
                const resultContent = typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result);
                toolResults.push({
                    type: 'function_call_output',
                    call_id: callId,
                    output: resultContent
                });
            } else if (toolCall.error) {
                toolResults.push({
                    type: 'function_call_output',
                    call_id: callId,
                    output: `Error: ${toolCall.error.message}`
                });
            }
        }

        this.currentInput = [...this.currentInput, assistantMessage, ...functionCalls, ...toolResults];
    }

    protected handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }

        if (this.requestQueue.length) {
            this.requestQueue.shift()!.resolve({
                done: false,
                value: message
            });
        } else {
            this.messageCache.push(message);
        }
    }

    protected async finalize(): Promise<void> {
        this.done = true;

        // Record final token usage
        if (this.tokenUsageService && (this.totalInputTokens > 0 || this.totalOutputTokens > 0)) {
            try {
                await this.tokenUsageService.recordTokenUsage(
                    this.modelId,
                    {
                        inputTokens: this.totalInputTokens,
                        outputTokens: this.totalOutputTokens,
                        requestId: this.request.requestId
                    }
                );
            } catch (error) {
                console.error('Error recording token usage:', error);
            }
        }

        // Resolve any outstanding requests
        if (this.terminalError) {
            this.requestQueue.forEach(request => request.reject(this.terminalError));
        } else {
            this.requestQueue.forEach(request => request.resolve({ done: true, value: undefined }));
        }
        this.requestQueue.length = 0;
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
