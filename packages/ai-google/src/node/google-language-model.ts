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
    createToolCallError,
    ImageContent,
    LanguageModel,
    LanguageModelMessage,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelStatus,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    TokenUsageService,
    ToolCallResult,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration, Content, Schema, Part, Modality, FunctionResponse, ToolConfig } from '@google/genai';
import { wait } from '@theia/core/lib/common/promise-util';
import { GoogleLanguageModelRetrySettings } from './google-language-models-manager-impl';
import { UUID } from '@theia/core/shared/@lumino/coreutils';

interface ToolCallback {
    readonly name: string;
    readonly id: string;
    args: string;
}
/**
 * Converts a tool call result to the Gemini FunctionResponse format.
 * Gemini requires response to be an object, not an array or primitive.
 */
function toFunctionResponse(content: ToolCallResult): FunctionResponse['response'] {
    if (content === undefined) {
        return {};
    }
    if (Array.isArray(content)) {
        return { result: content };
    }
    if (typeof content === 'object') {
        return content as FunctionResponse['response'];
    }
    return { result: content };
}

const convertMessageToPart = (message: LanguageModelMessage): Part[] | undefined => {
    if (LanguageModelMessage.isTextMessage(message) && message.text.length > 0) {
        return [{ text: message.text }];
    } else if (LanguageModelMessage.isToolUseMessage(message)) {
        return [{
            functionCall: {
                id: message.id, name: message.name, args: message.input as Record<string, unknown>
            },
            thoughtSignature: message.data?.thoughtSignature,
        }];
    } else if (LanguageModelMessage.isToolResultMessage(message)) {
        return [{ functionResponse: { name: message.name, response: toFunctionResponse(message.content) } }];
    } else if (LanguageModelMessage.isThinkingMessage(message)) {
        return [{ thought: true, text: message.thinking }];
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
        public status: LanguageModelStatus,
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

        const toolConfig: ToolConfig = {};

        if (functionDeclarations.length > 0) {
            toolConfig.functionCallingConfig = {
                mode: FunctionCallingConfigMode.AUTO,
            };
        }

        // Wrap the API call in the retry mechanism
        const stream = await this.withRetry(async () =>
            genAI.models.generateContentStream({
                model: this.model,
                config: {
                    systemInstruction: systemMessage,
                    toolConfig,
                    responseModalities: [Modality.TEXT],
                    ...(functionDeclarations.length > 0 && {
                        tools: [{
                            functionDeclarations
                        }]
                    }),
                    thinkingConfig: {
                        // https://ai.google.dev/gemini-api/docs/thinking#summaries
                        includeThoughts: true,
                    },
                    temperature: 1,
                    ...settings
                },
                contents: [...parts, ...(toolMessages ?? [])]
            }));

        const that = this;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {
                const toolCallMap: { [key: string]: ToolCallback } = {};
                const collectedParts: Part[] = [];
                try {
                    for await (const chunk of stream) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }
                        const finishReason = chunk.candidates?.[0].finishReason;
                        if (finishReason) {
                            switch (finishReason) {
                                // 'STOP' is the only valid (non-error) finishReason
                                // "Natural stop point of the model or provided stop sequence."
                                case 'STOP':
                                    break;
                                // MALFORMED_FUNCTION_CALL: The model produced a malformed function call.
                                // Log warning but continue - there might still be usable text content.
                                case 'MALFORMED_FUNCTION_CALL':
                                    console.warn('Gemini returned MALFORMED_FUNCTION_CALL finish reason.', {
                                        finishReason,
                                        candidate: chunk.candidates?.[0],
                                        content: chunk.candidates?.[0]?.content,
                                        parts: chunk.candidates?.[0]?.content?.parts,
                                        text: chunk.text,
                                        usageMetadata: chunk.usageMetadata
                                    });
                                    break;
                                // All other reasons are error-cases. Throw an Error.
                                // e.g. SAFETY, MAX_TOKENS, RECITATION, LANGUAGE, ...
                                // https://ai.google.dev/api/generate-content#FinishReason
                                default:
                                    console.error('Gemini streaming ended with unexpected finish reason:', {
                                        finishReason,
                                        candidate: chunk.candidates?.[0],
                                        content: chunk.candidates?.[0]?.content,
                                        parts: chunk.candidates?.[0]?.content?.parts,
                                        safetyRatings: chunk.candidates?.[0]?.safetyRatings,
                                        text: chunk.text,
                                        usageMetadata: chunk.usageMetadata
                                    });
                                    throw new Error(`Unexpected finish reason: ${finishReason}`);
                            }
                        }
                        // Handle thinking, text content, and function calls from parts
                        if (chunk.candidates?.[0]?.content?.parts) {
                            for (const part of chunk.candidates[0].content.parts) {
                                collectedParts.push(part);
                                if (part.text) {
                                    if (part.thought) {
                                        yield { thought: part.text, signature: part.thoughtSignature ?? '' };
                                    } else {
                                        yield { content: part.text };
                                    }
                                } else if (part.functionCall) {
                                    const functionCall = part.functionCall;
                                    // Gemini does not always provide a function call ID (unlike Anthropic/OpenAI).
                                    // We need a stable ID to track calls in toolCallMap and correlate results.
                                    const callId = functionCall.id ?? UUID.uuid4().replace(/-/g, '');
                                    let toolCall = toolCallMap[callId];
                                    if (toolCall === undefined) {
                                        toolCall = {
                                            name: functionCall.name ?? '',
                                            args: functionCall.args ? JSON.stringify(functionCall.args) : '{}',
                                            id: callId,
                                        };
                                        toolCallMap[callId] = toolCall;

                                        yield {
                                            tool_calls: [{
                                                finished: false,
                                                id: toolCall.id,
                                                function: {
                                                    name: toolCall.name,
                                                    arguments: toolCall.args
                                                },
                                                data: part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : undefined
                                            }]
                                        };
                                    } else {
                                        // Update to existing tool call
                                        toolCall.args = functionCall.args ? JSON.stringify(functionCall.args) : '{}';
                                        yield {
                                            tool_calls: [{
                                                function: {
                                                    arguments: toolCall.args
                                                },
                                                data: part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : undefined
                                            }]
                                        };
                                    }
                                }
                            }
                        } else if (chunk.text) {
                            yield { content: chunk.text };
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

                    // Process tool calls if any exist
                    const toolCalls = Object.values(toolCallMap);
                    if (toolCalls.length > 0) {
                        // Collect tool results
                        const toolResult = await Promise.all(toolCalls.map(async tc => {
                            const tool = request.tools?.find(t => t.name === tc.name);
                            let result;
                            if (!tool) {
                                result = createToolCallError(`Tool '${tc.name}' not found in the available tools for this request.`, 'tool-not-available');
                            } else {
                                try {
                                    result = await tool.handler(tc.args);
                                } catch (e) {
                                    console.error(`Error executing tool ${tc.name}:`, e);
                                    result = createToolCallError(e.message || 'Tool execution failed');
                                }
                            }
                            return {
                                name: tc.name,
                                result: result,
                                id: tc.id,
                                arguments: tc.args,
                            };
                        }));

                        // Generate tool call responses
                        const calls = toolResult.map(tr => ({
                            finished: true,
                            id: tr.id,
                            result: tr.result,
                            function: { name: tr.name, arguments: tr.arguments },
                        }));
                        yield { tool_calls: calls };

                        // Format tool responses for Gemini
                        // According to Gemini docs, functionResponse needs name and response
                        const toolResponses: Part[] = toolResult.map(call => ({
                            functionResponse: {
                                name: call.name,
                                response: toFunctionResponse(call.result)
                            }
                        }));
                        const responseMessage: Content = { role: 'user', parts: toolResponses };

                        // Build the model's response content from collected parts
                        // Exclude thinking parts as they should not be included in the conversation history sent back to the model
                        const modelResponseParts = collectedParts.filter(p => !p.thought);
                        const modelContent: Content = { role: 'model', parts: modelResponseParts };

                        const messages = [...(toolMessages ?? []), modelContent, responseMessage];

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
                ...(functionDeclarations.length > 0 && {
                    tools: [{ functionDeclarations }]
                }),
                ...settings
            },
            contents: parts
        }));

        try {
            let responseText = '';
            // For non streaming requests we are always only interested in text parts
            if (model.candidates?.[0]?.content?.parts) {
                for (const part of model.candidates[0].content.parts) {
                    if (part.text) {
                        responseText += part.text;
                    }
                }
            } else {
                responseText = model.text ?? '';
            }

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
            return { text: responseText };
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
