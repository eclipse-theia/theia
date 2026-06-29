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
    LanguageModel,
    LanguageModelMessage,
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelStatus,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse,
    ReasoningApi,
    ReasoningSupport,
    ServerToolCall,
    ServerToolDescriptor,
    ToolCallResult,
    ToolCallExecutor,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration, Content, Schema, Part, Modality, FunctionResponse, ToolConfig, Tool, UrlContextMetadata, GroundingMetadata
} from '@google/genai';
import { wait } from '@theia/core/lib/common/promise-util';
import { GoogleLanguageModelRetrySettings } from './google-language-models-manager-impl';
import { googleReasoningFor } from './google-reasoning';
import { GOOGLE_GOOGLE_SEARCH, GOOGLE_URL_CONTEXT } from './google-server-tools';
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
    } else if (LanguageModelMessage.isServerToolUseMessage(message)) {
        // Gemini grounding / url-context is informational and re-derived by the provider on each turn,
        // so server tool invocations are not replayed into the conversation history.
        return undefined;
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

export interface GoogleModelParams {
    id: string;
    model: string;
    status: LanguageModelStatus;
    enableStreaming: boolean;
    apiKey: () => string | undefined;
    retrySettings: () => GoogleLanguageModelRetrySettings;
    reasoningSupport?: ReasoningSupport;
    reasoningApi?: ReasoningApi;
    maxInputTokens?: number;
    serverTools?: ServerToolDescriptor[];
}

export const GoogleModelParams = Symbol('GoogleModelParams');

export const GoogleLanguageModelFactory = Symbol('GoogleLanguageModelFactory');
export type GoogleLanguageModelFactory = (params: GoogleModelParams) => GoogleModel;

/**
 * Implements the Gemini language model integration for Theia. Reasoning-level
 * translation lives in {@link googleReasoningFor}.
 */
@injectable()
export class GoogleModel implements LanguageModel {

    id: string;
    model: string;
    status: LanguageModelStatus;
    enableStreaming: boolean;
    apiKey: () => string | undefined;
    retrySettings: () => GoogleLanguageModelRetrySettings;
    reasoningSupport?: ReasoningSupport;
    reasoningApi?: ReasoningApi;
    maxInputTokens?: number;
    serverTools?: ServerToolDescriptor[];

    /** Provider identifier, used to key per-provider settings (e.g. server tool selections) and the capabilities UI. */
    readonly vendor = 'google';

    @inject(GoogleModelParams)
    protected readonly params: GoogleModelParams;

    @inject(ToolCallExecutor)
    protected readonly toolCallExecutor: ToolCallExecutor;

    @postConstruct()
    protected init(): void {
        const params = this.params;
        this.id = params.id;
        this.model = params.model;
        this.status = params.status;
        this.enableStreaming = params.enableStreaming;
        this.apiKey = params.apiKey;
        this.retrySettings = params.retrySettings;
        this.reasoningSupport = params.reasoningSupport;
        this.reasoningApi = params.reasoningApi;
        this.maxInputTokens = params.maxInputTokens;
        this.serverTools = params.serverTools;
    }

    protected getSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return {
            ...request.settings,
            ...googleReasoningFor(request.reasoning?.level, this.reasoningApi)
        };
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
        const tools = this.createTools(request, functionDeclarations);

        const toolConfig: ToolConfig = {};

        if (functionDeclarations.length > 0) {
            toolConfig.functionCallingConfig = {
                mode: FunctionCallingConfigMode.AUTO,
            };
        }
        // Required by Gemini when combining server tools (urlContext / googleSearch) with function
        // declarations; without it the API rejects the request with INVALID_ARGUMENT.
        if ((request.serverTools?.length ?? 0) > 0) {
            toolConfig.includeServerSideToolInvocations = true;
        }

        // Wrap the API call in the retry mechanism
        const stream = await this.withRetry(async () =>
            genAI.models.generateContentStream({
                model: this.model,
                config: {
                    systemInstruction: systemMessage,
                    toolConfig,
                    responseModalities: [Modality.TEXT],
                    ...(tools.length > 0 && { tools }),
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
                // Server tool (url_context / google_search) metadata is reported on the candidate, usually in the final chunk.
                let latestUrlContextMetadata: UrlContextMetadata | undefined;
                let latestGroundingMetadata: GroundingMetadata | undefined;
                try {
                    for await (const chunk of stream) {
                        if (cancellationToken?.isCancellationRequested) {
                            break;
                        }
                        const candidate = chunk.candidates?.[0];
                        if (candidate?.urlContextMetadata) {
                            latestUrlContextMetadata = candidate.urlContextMetadata;
                        }
                        if (candidate?.groundingMetadata) {
                            latestGroundingMetadata = candidate.groundingMetadata;
                        }
                        const finishReason = candidate?.finishReason;
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
                        if (chunk.usageMetadata) {
                            const promptTokens = chunk.usageMetadata.promptTokenCount;
                            const completionTokens = chunk.usageMetadata.candidatesTokenCount;
                            if (promptTokens !== undefined && completionTokens !== undefined) {
                                yield { input_tokens: promptTokens, output_tokens: completionTokens };
                            }
                        }
                    }

                    // Surface any server tools (url_context / google_search) that the provider executed.
                    const serverToolCalls = that.buildServerToolCalls(latestUrlContextMetadata, latestGroundingMetadata);
                    if (serverToolCalls.length > 0) {
                        yield { server_tool_calls: serverToolCalls };
                    }

                    // Process tool calls if any exist
                    const toolCalls = Object.values(toolCallMap);
                    if (toolCalls.length > 0) {
                        const toolResult = await that.toolCallExecutor.executeToolCalls(
                            toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.args })),
                            request.tools,
                            { cancellationToken }
                        );

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

    /**
     * Builds the Gemini `tools` array, combining client function declarations with the enabled native server tools.
     *
     * Note: combining native tools (`googleSearch` / `urlContext`) with `functionDeclarations` in a single
     * request requires a Gemini 2.0+ model. Older models (e.g. Gemini 1.5) reject the combination with a 400
     * error. Since adopters configure both the model and which server tools to offer, this is left to the
     * provider rather than silently dropping either set of tools.
     */
    protected createTools(request: LanguageModelRequest, functionDeclarations: FunctionDeclaration[]): Tool[] {
        const tools: Tool[] = [];
        if (functionDeclarations.length > 0) {
            tools.push({ functionDeclarations });
        }
        const serverTools = request.serverTools ?? [];
        if (serverTools.includes(GOOGLE_URL_CONTEXT)) {
            tools.push({ urlContext: {} });
        }
        if (serverTools.includes(GOOGLE_GOOGLE_SEARCH)) {
            tools.push({ googleSearch: {} });
        }
        return tools;
    }

    /**
     * Summarizes the provider-executed server tools (url_context / google_search) into finished
     * {@link ServerToolCall}s for display. Gemini does not provide tool ids, so a fresh id is generated;
     * these calls are informational and are not replayed into the conversation history.
     */
    protected buildServerToolCalls(urlContextMetadata?: UrlContextMetadata, groundingMetadata?: GroundingMetadata): ServerToolCall[] {
        const calls: ServerToolCall[] = [];
        const urlMetadata = urlContextMetadata?.urlMetadata?.filter(entry => entry.retrievedUrl);
        if (urlMetadata && urlMetadata.length > 0) {
            const summary = urlMetadata.map(entry => `${entry.retrievedUrl} (${entry.urlRetrievalStatus ?? 'unknown'})`).join('\n');
            calls.push({
                id: UUID.uuid4().replace(/-/g, ''),
                name: GOOGLE_URL_CONTEXT,
                arguments: JSON.stringify({ urls: urlMetadata.map(entry => entry.retrievedUrl) }),
                finished: true,
                result: { content: [{ type: 'text', text: summary }] }
            });
        }
        const webSearchQueries = groundingMetadata?.webSearchQueries;
        if (webSearchQueries && webSearchQueries.length > 0) {
            const sources = (groundingMetadata?.groundingChunks ?? [])
                .map(chunk => chunk.web)
                .filter((web): web is NonNullable<typeof web> => !!web)
                .map(web => web.uri ? `${web.title ?? web.uri} (${web.uri})` : `${web.title ?? ''}`)
                .filter(entry => entry.length > 0);
            const summaryParts = [`Queries: ${webSearchQueries.join(', ')}`];
            if (sources.length > 0) {
                summaryParts.push(`Sources:\n${sources.join('\n')}`);
            }
            calls.push({
                id: UUID.uuid4().replace(/-/g, ''),
                name: GOOGLE_GOOGLE_SEARCH,
                arguments: JSON.stringify({ queries: webSearchQueries }),
                finished: true,
                result: { content: [{ type: 'text', text: summaryParts.join('\n\n') }] }
            });
        }
        return calls;
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

            const result: LanguageModelTextResponse = { text: responseText };
            if (model.usageMetadata) {
                const promptTokens = model.usageMetadata.promptTokenCount;
                const completionTokens = model.usageMetadata.candidatesTokenCount;
                if (promptTokens !== undefined && completionTokens !== undefined) {
                    result.usage = { input_tokens: promptTokens, output_tokens: completionTokens };
                }
            }
            return result;
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
