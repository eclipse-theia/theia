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
import { webcrypto as crypto } from 'node:crypto';
import {
    LanguageModel,
    LanguageModelRequest,
    LanguageModelMessage,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    TokenUsageService,
    UserRequest,
    ImageContent,
    ToolCallResult
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration, Content, Schema, Part, Modality, FunctionResponse } from '@google/genai';
import { wait } from '@theia/core/lib/common/promise-util';
import { GoogleLanguageModelRetrySettings } from './google-language-models-manager-impl';

interface ToolCallback {
    readonly name: string;
    readonly id: string;
    readonly index: number;
    args: string;
}
const convertMessageToPart = (message: LanguageModelMessage): Part[] | undefined => {
    if (LanguageModelMessage.isTextMessage(message) && message.text.length > 0) {
        return [{ text: message.text }];
    } else if (LanguageModelMessage.isToolUseMessage(message)) {
        return [{
            functionCall: {
                id: message.id, name: message.name, args: message.input as Record<string, unknown>
            }
        }];
    } else if (LanguageModelMessage.isToolResultMessage(message)) {
        return [{ functionResponse: { id: message.tool_use_id, name: message.name, response: { output: message.content } } }];

    } else if (LanguageModelMessage.isThinkingMessage(message)) {
        return [{ thought: true }, { text: message.thinking }];
    } else if (LanguageModelMessage.isImageMessage(message) && ImageContent.isBase64(message.image)) {
        return [{ inlineData: { data: message.image.base64data, mimeType: message.image.mimeType } }];
    }
};
/**
 * Transforms Theia language model messages to Gemini API format
 * @param messages Array of LanguageModelRequestMessage to transform
 * @returns Object containing transformed messages and optional system message
 */
function transformToGeminiMessages(
    messages: readonly LanguageModelMessage[]
): { contents: Content[]; systemMessage?: string } {
    // Extract the system message (if any), as it is a separate parameter in the Gemini API.
    const systemMessageObj = messages.find(message => message.actor === 'system');
    const systemMessage = systemMessageObj && LanguageModelMessage.isTextMessage(systemMessageObj) && systemMessageObj.text || undefined;

    const contents: Content[] = [];

    for (const message of messages) {
        if (message.actor === 'system') {
            continue; // Skip system messages as they're handled separately
        }
        const resultParts = convertMessageToPart(message);
        if (resultParts === undefined) {
            continue;
        }

        const role = toGoogleRole(message);
        const lastContent = contents.pop();

        if (!lastContent) {
            contents.push({ role, parts: resultParts });
        } else if (lastContent.role !== role) {
            contents.push(lastContent);
            contents.push({ role, parts: resultParts });
        } else {
            lastContent?.parts?.push(...resultParts);
            contents.push(lastContent);
        }

    }

    return {
        contents: contents,
        systemMessage,
    };
}

export const GoogleModelIdentifier = Symbol('GoogleModelIdentifier');

/**
 * Converts Theia message actor to Gemini role
 * @param message The message to convert
 * @returns Gemini role ('user' or 'model')
 */
function toGoogleRole(message: LanguageModelMessage): 'user' | 'model' {
    switch (message.actor) {
        case 'ai':
            return 'model';
        default:
            return 'user';
    }
}

/**
 * Implements the Gemini language model integration for Theia
 */
export class GoogleModel implements LanguageModel {

    constructor(
        public readonly id: string,
        public model: string,
        public enableStreaming: boolean,
        public apiKey: () => string | undefined,
        public retrySettings: () => GoogleLanguageModelRetrySettings,
        protected readonly tokenUsageService?: TokenUsageService
    ) { }

    protected getSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return request.settings ?? {};
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        if (!request.messages?.length) {
            throw new Error('Request must contain at least one message');
        }

        const genAI = this.initializeGemini();

        try {
            if (this.enableStreaming) {
                return this.handleStreamingRequest(genAI, request, cancellationToken);
            }
            return this.handleNonStreamingRequest(genAI, request);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Gemini API request failed: ${errorMessage}`);
        }
    }
    protected async handleStreamingRequest(
        genAI: GoogleGenAI,
        request: UserRequest,
        cancellationToken?: CancellationToken,
        toolMessages?: Content[]
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const { contents: parts, systemMessage } = transformToGeminiMessages(request.messages);
        const functionDeclarations = this.createFunctionDeclarations(request);

        // Wrap the API call in the retry mechanism
        const stream = await this.withRetry(async () =>
            genAI.models.generateContentStream({
                model: this.model,
                config: {
                    systemInstruction: systemMessage,
                    toolConfig: {
                        functionCallingConfig: {
                            mode: FunctionCallingConfigMode.AUTO,
                        }
                    },
                    responseModalities: [Modality.TEXT],
                    tools: [{
                        functionDeclarations
                    }],
                    temperature: 1,
                    ...settings
                },
                contents: [...parts, ...(toolMessages ?? [])]
            }));

        const that = this;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                const toolCallMap: { [key: string]: ToolCallback } = {};
                let currentContent: Content | undefined = undefined;
                try {
                    for await (const chunk of stream) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }
                        if (chunk.candidates?.[0].finishReason) {
                            currentContent = chunk.candidates?.[0].content;
                        }
                        // Handle text content
                        if (chunk.text) {
                            yield { content: chunk.text };
                        }

                        // Handle function calls from Gemini
                        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                            let functionIndex = 0;
                            for (const functionCall of chunk.functionCalls) {
                                const callId = functionCall.id ?? crypto.randomUUID().replace(/-/g, '');
                                let toolCall = toolCallMap[callId];
                                if (toolCall === undefined) {
                                    toolCall = {
                                        name: functionCall.name ?? '',
                                        args: functionCall.args ? JSON.stringify(functionCall.args) : '{}',
                                        id: callId,
                                        index: functionIndex++
                                    };
                                    toolCallMap[callId] = toolCall;

                                    yield {
                                        tool_calls: [{
                                            finished: false,
                                            id: toolCall.id,
                                            function: {
                                                name: toolCall.name,
                                                arguments: toolCall.args
                                            }
                                        }]
                                    };
                                } else {
                                    // Update to existing tool call
                                    toolCall.args = functionCall.args ? JSON.stringify(functionCall.args) : '{}';
                                    yield {
                                        tool_calls: [{
                                            function: {
                                                arguments: toolCall.args
                                            }
                                        }]
                                    };
                                }
                            }
                        }

                        // Report token usage if available
                        if (chunk.usageMetadata && that.tokenUsageService && that.id) {
                            const promptTokens = chunk.usageMetadata.promptTokenCount;
                            const completionTokens = chunk.usageMetadata.candidatesTokenCount;
                            if (promptTokens && completionTokens) {
                                that.tokenUsageService.recordTokenUsage(that.id, {
                                    inputTokens: promptTokens,
                                    outputTokens: completionTokens,
                                    requestId: request.requestId
                                }).catch(error => console.error('Error recording token usage:', error));
                            }
                        }
                    }

                    // Mark tool call as finished if it exists
                    const toolCalls = Object.values(toolCallMap);
                    for (const toolCall of toolCalls) {
                        yield { tool_calls: [{ finished: true, id: toolCall.id }] };
                    }

                    // Process tool calls if any exist
                    if (toolCalls.length > 0) {
                        // Collect tool results
                        const toolResult = await Promise.all(toolCalls.map(async tc => {
                            const tool = request.tools?.find(t => t.name === tc.name);
                            let result;
                            try {
                                result = await tool?.handler(tc.args);
                            } catch (e) {
                                console.error(`Error executing tool ${tc.name}:`, e);
                                result = { error: e.message || 'Tool execution failed' };
                            }
                            return {
                                name: tc.name,
                                result: result,
                                id: tc.id,
                                arguments: tc.args
                            };
                        }));

                        // Generate tool call responses
                        const calls = toolResult.map(tr => ({
                            finished: true,
                            id: tr.id,
                            result: tr.result,
                            function: { name: tr.name, arguments: tr.arguments }
                        }));
                        yield { tool_calls: calls };

                        // Format tool responses for Gemini
                        const toolResponses: Part[] = toolResult.map(call => ({
                            functionResponse: {
                                id: call.id,
                                name: call.name,
                                response: that.formatToolCallResult(call.result)
                            }
                        }));
                        const responseMessage: Content = { role: 'user', parts: toolResponses };

                        const messages = [...(toolMessages ?? [])];
                        if (currentContent) {
                            messages.push(currentContent);
                        }
                        messages.push(responseMessage);
                        // Continue the conversation with tool results
                        const continuedResponse = await that.handleStreamingRequest(
                            genAI,
                            request,
                            cancellationToken,
                            messages
                        );

                        // Stream the continued response
                        for await (const nestedEvent of continuedResponse.stream) {
                            yield nestedEvent;
                        }
                    }
                } catch (e) {
                    console.error('Error in Gemini streaming:', e);
                    throw e;
                }
            },
        };

        return { stream: asyncIterator };
    }

    protected formatToolCallResult(result: ToolCallResult): FunctionResponse['response'] {
        // If "output" and "error" keys are not specified, then whole "response" is treated as function output.
        // There is no particular support for different types of output such as images so we use the structure provided by the tool call.
        // Using the format that is used for image messages does not seem to yield any different results.
        return { output: result };
    }

    private createFunctionDeclarations(request: LanguageModelRequest): FunctionDeclaration[] {
        if (!request.tools || request.tools.length === 0) {
            return [];
        }

        return request.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: (tool.parameters && Object.keys(tool.parameters.properties).length !== 0) ? tool.parameters as Schema : undefined
        }));
    }

    protected async handleNonStreamingRequest(
        genAI: GoogleGenAI,
        request: UserRequest
    ): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const { contents: parts, systemMessage } = transformToGeminiMessages(request.messages);
        const functionDeclarations = this.createFunctionDeclarations(request);

        // Wrap the API call in the retry mechanism
        const model = await this.withRetry(async () => genAI.models.generateContent({
            model: this.model,
            config: {
                systemInstruction: systemMessage,
                toolConfig: {
                    functionCallingConfig: {
                        mode: FunctionCallingConfigMode.AUTO,
                    }
                },
                tools: [{ functionDeclarations }],
                ...settings
            },
            contents: parts
        }));

        try {
            const responseText = model.text;

            // Record token usage if available
            if (model.usageMetadata && this.tokenUsageService) {
                const promptTokens = model.usageMetadata.promptTokenCount;
                const completionTokens = model.usageMetadata.candidatesTokenCount;
                if (promptTokens && completionTokens) {
                    await this.tokenUsageService.recordTokenUsage(this.id, {
                        inputTokens: promptTokens,
                        outputTokens: completionTokens,
                        requestId: request.requestId
                    });
                }
            }

            return { text: responseText ?? '' };
        } catch (error) {
            throw new Error(`Failed to get response from Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected initializeGemini(): GoogleGenAI {
        const apiKey = this.apiKey();
        if (!apiKey) {
            throw new Error('Please provide GOOGLE_API_KEY in preferences or via environment variable');
        }

        // TODO test vertexai
        return new GoogleGenAI({ apiKey, vertexai: false });
    }

    /**
     * Implements a retry mechanism for the handle(non)Streaming request functions.
     * @param fn the wrapped function to which the retry logic should be applied.
     * @param retrySettings the configuration settings for the retry mechanism.
     * @returns the result of the wrapped function.
     */
    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        const { maxRetriesOnErrors, retryDelayOnRateLimitError, retryDelayOnOtherErrors } = this.retrySettings();

        for (let i = 0; i <= maxRetriesOnErrors; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetriesOnErrors) {
                    // no retries left - throw the original error
                    throw error;
                }

                const message = (error as Error).message;
                // Check for rate limit exhaustion (usually, there is a rate limit per minute, so we can retry after a delay...)
                if (message && message.includes('429 Too Many Requests')) {
                    if (retryDelayOnRateLimitError < 0) {
                        // rate limit error should not retried because of the setting
                        throw error;
                    }

                    const delayMs = retryDelayOnRateLimitError * 1000;
                    console.warn(`Received 429 (Too Many Requests). Retrying in ${retryDelayOnRateLimitError}s. Attempt ${i + 1} of ${maxRetriesOnErrors}.`);
                    await wait(delayMs);
                } else if (retryDelayOnOtherErrors < 0) {
                    // Other errors should not retried because of the setting
                    throw error;
                } else {
                    const delayMs = retryDelayOnOtherErrors * 1000;
                    console.warn(`Request failed: ${message}. Retrying in ${retryDelayOnOtherErrors}s. Attempt ${i + 1} of ${maxRetriesOnErrors}.`);
                    await wait(delayMs);
                }
                // -> reiterate the loop for the next attempt
            }
        }
        // This should not be reached
        throw new Error('Retry mechanism failed unexpectedly.');
    }
}
