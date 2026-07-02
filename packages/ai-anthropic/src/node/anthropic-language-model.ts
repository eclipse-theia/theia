// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
    ImageMimeType,
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
    resolveServerSideCompaction,
    ServerToolCallResponsePart,
    ServerToolDescriptor,
    ToolCallContent,
    ToolCallResult,
    ToolInvocationContext,
    ToolRequest,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken, isArray } from '@theia/core';
import { Anthropic } from '@anthropic-ai/sdk';
import type { Base64ImageSource, ImageBlockParam, Message, MessageParam, TextBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources';
import { createProxyFetch } from '@theia/ai-core/lib/node';
import { anthropicReasoningFor } from './anthropic-reasoning';
import { ANTHROPIC_WEB_FETCH, ANTHROPIC_WEB_SEARCH } from './anthropic-server-tools';
import { AnthropicMemoryTool, MEMORY_TOOL_BETA, MEMORY_TOOL_NAME, MEMORY_TOOL_TYPE } from './anthropic-memory-tool';

export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Key under which the raw Anthropic server tool result block is stored on the server tool call's `data`,
 * so it can be reconstructed faithfully on replay. The human-readable `result` summary is kept separately
 * for rendering (see {@link buildServerToolResultPart}).
 */
export const ANTHROPIC_RESULT_BLOCK_DATA_KEY = 'anthropicResultBlock';

interface ToolCallback {
    readonly name: string;
    readonly id: string;
    readonly index: number;
    args: string;
}

const createMessageContent = (message: LanguageModelMessage, compactionEnabled: boolean): MessageParam['content'] => {
    if (LanguageModelMessage.isCompactionMessage(message)) {
        // Only replay our own provider's compaction blocks, and only when the request will use the beta endpoint.
        // Returning [] for a skipped/foreign/disabled compaction message lets the surrounding real history carry the context.
        if (compactionEnabled && message.provider === 'anthropic') {
            const data = message.data as { content: string | null; encrypted_content: string | null };
            return [{ type: 'compaction', content: data.content, encrypted_content: data.encrypted_content }] as unknown as MessageParam['content'];
        }
        return [];
    } else if (LanguageModelMessage.isTextMessage(message)) {
        return [{ type: 'text', text: message.text }];
    } else if (LanguageModelMessage.isThinkingMessage(message)) {
        return [{ signature: message.signature, thinking: message.thinking, type: 'thinking' }];
    } else if (LanguageModelMessage.isToolUseMessage(message)) {
        return [{ id: message.id, input: message.input, name: message.name, type: 'tool_use' }];
    } else if (LanguageModelMessage.isToolResultMessage(message)) {
        return [{ type: 'tool_result', tool_use_id: message.tool_use_id, content: formatToolCallResult(message.content) }];
    } else if (LanguageModelMessage.isServerToolUseMessage(message)) {
        // Reconstruct the server tool invocation and its result so Anthropic can replay the prior turn.
        // The raw provider result block was stored on the message's `data` (see buildServerToolResultPart);
        // fall back to `result` for forward compatibility if it is missing.
        const useBlock: Anthropic.Messages.ServerToolUseBlockParam = {
            type: 'server_tool_use',
            id: message.id,
            name: message.name as Anthropic.Messages.ServerToolUseBlockParam['name'],
            input: message.input
        };
        let resultContent: unknown = message.result;
        const rawBlock = message.data?.[ANTHROPIC_RESULT_BLOCK_DATA_KEY];
        if (rawBlock) {
            try {
                resultContent = JSON.parse(rawBlock);
            } catch {
                // keep message.result as the fallback
            }
        }
        if (message.name === ANTHROPIC_WEB_SEARCH) {
            const resultBlock: Anthropic.Messages.WebSearchToolResultBlockParam = {
                type: 'web_search_tool_result',
                tool_use_id: message.id,
                content: resultContent as unknown as Anthropic.Messages.WebSearchToolResultBlockParam['content']
            };
            return [useBlock, resultBlock];
        }
        const fetchResultBlock: Anthropic.Messages.WebFetchToolResultBlockParam = {
            type: 'web_fetch_tool_result',
            tool_use_id: message.id,
            content: resultContent as unknown as Anthropic.Messages.WebFetchToolResultBlockParam['content']
        };
        return [useBlock, fetchResultBlock];
    } else if (LanguageModelMessage.isImageMessage(message)) {
        if (ImageContent.isBase64(message.image)) {
            return [{ type: 'image', source: { type: 'base64', media_type: mimeTypeToMediaType(message.image.mimeType), data: message.image.base64data } }];
        } else {
            return [{ type: 'image', source: { type: 'url', url: message.image.url } }];
        }
    }
    throw new Error(`Unknown message type:'${JSON.stringify(message)}'`);
};

function mimeTypeToMediaType(mimeType: ImageMimeType): Base64ImageSource['media_type'] {
    switch (mimeType) {
        case 'image/gif':
            return 'image/gif';
        case 'image/jpeg':
            return 'image/jpeg';
        case 'image/png':
            return 'image/png';
        case 'image/webp':
            return 'image/webp';
        default:
            return 'image/jpeg';
    }
}

type NonThinkingParam = Exclude<Anthropic.Messages.ContentBlockParam, Anthropic.Messages.ThinkingBlockParam | Anthropic.Messages.RedactedThinkingBlockParam>;
function isNonThinkingParam(
    content: Anthropic.Messages.ContentBlockParam
): content is NonThinkingParam {
    return content.type !== 'thinking' && content.type !== 'redacted_thinking';
}

/**
 * Transforms Theia language model messages to Anthropic API format
 * @param messages Array of LanguageModelRequestMessage to transform
 * @param addCacheControl whether to add prompt-cache control to the system message
 * @param compactionEnabled whether the request will use the beta endpoint, so compaction replay blocks may be emitted
 * @returns Object containing transformed messages and optional system message
 */
export function transformToAnthropicParams(
    messages: readonly LanguageModelMessage[],
    addCacheControl: boolean = true,
    compactionEnabled: boolean = false
): { messages: MessageParam[]; systemMessage?: Anthropic.Messages.TextBlockParam[] } {
    // Extract the system message (if any), as it is a separate parameter in the Anthropic API.
    const systemMessageObj = messages.find(message => message.actor === 'system');
    const systemMessageText = systemMessageObj && LanguageModelMessage.isTextMessage(systemMessageObj) && systemMessageObj.text || undefined;
    const systemMessage: Anthropic.Messages.TextBlockParam[] | undefined =
        systemMessageText ? [{ type: 'text', text: systemMessageText, cache_control: addCacheControl ? { type: 'ephemeral' } : undefined }] : undefined;

    const convertedMessages = messages
        .filter(message => message.actor !== 'system')
        .map(message => ({
            role: toAnthropicRole(message),
            content: createMessageContent(message, compactionEnabled)
        }))
        // Drop messages whose content converted to empty (e.g. a skipped compaction message), so no empty turns are sent.
        .filter(message => !Array.isArray(message.content) || message.content.length > 0);

    return {
        messages: mergeConsecutiveSameRoleMessages(convertedMessages),
        systemMessage,
    };
}

export function mergeConsecutiveSameRoleMessages(messages: MessageParam[]): MessageParam[] {
    const result: MessageParam[] = [];
    for (const message of messages) {
        const previous = result[result.length - 1];
        // tool results are user messages and not tool messages and thus should be merged:
        // assistant(tool_use_1 + tool_use_2)
        // user(tool_result_1 + tool_result_2)
        if (previous?.role === message.role && (message.role === 'user' || message.role === 'assistant')) {
            const previousContent = Array.isArray(previous.content)
                ? previous.content
                : [{ type: 'text', text: previous.content } as Anthropic.Messages.TextBlockParam];
            const nextContent = Array.isArray(message.content)
                ? message.content
                : [{ type: 'text', text: message.content } as Anthropic.Messages.TextBlockParam];
            result[result.length - 1] = {
                ...previous,
                role: message.role,
                content: [...previousContent, ...nextContent]
            };
        } else {
            result.push(message);
        }
    }
    return result;
}

/**
 * If possible adds a cache control to the last message in the conversation.
 * This is used to enable incremental caching of the conversation.
 * @param messages The messages to process
 * @returns A new messages array with the last message adapted to include cache control. If no cache control can be added, the original messages are returned.
 * In any case, the original messages are not modified
 */
export function addCacheControlToLastMessage(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
    const clonedMessages = [...messages];
    const latestMessage = clonedMessages.pop();
    if (latestMessage) {
        if (typeof latestMessage.content === 'string') {
            // Wrap the string content into a content block with cache control
            const cachedContent: NonThinkingParam = {
                type: 'text',
                text: latestMessage.content,
                cache_control: { type: 'ephemeral' }
            };
            return [...clonedMessages, { ...latestMessage, content: [cachedContent] }];
        } else if (Array.isArray(latestMessage.content)) {
            // Update the last non-thinking content block to include cache control
            const updatedContent = [...latestMessage.content];
            for (let i = updatedContent.length - 1; i >= 0; i--) {
                if (isNonThinkingParam(updatedContent[i])) {
                    updatedContent[i] = {
                        ...updatedContent[i],
                        cache_control: { type: 'ephemeral' }
                    } as NonThinkingParam;
                    return [...clonedMessages, { ...latestMessage, content: updatedContent }];
                }
            }
        }
    }
    return messages;
}

export const AnthropicModelIdentifier = Symbol('AnthropicModelIdentifier');

/**
 * Converts Theia message actor to Anthropic role
 * @param message The message to convert
 * @returns Anthropic role ('user' or 'assistant')
 */
function toAnthropicRole(message: LanguageModelMessage): 'user' | 'assistant' {
    switch (message.actor) {
        case 'ai':
            return 'assistant';
        default:
            return 'user';
    }
}

function formatToolCallResult(result: ToolCallResult): ToolResultBlockParam['content'] {
    if (typeof result === 'object' && result && 'content' in result && Array.isArray(result.content)) {
        return result.content.map<TextBlockParam | ImageBlockParam>(content => {
            if (content.type === 'text') {
                return { type: 'text', text: content.text };
            } else if (content.type === 'image') {
                return { type: 'image', source: { type: 'base64', data: content.base64data, media_type: mimeTypeToMediaType(content.mimeType) } };
            } else {
                return { type: 'text', text: content.data };
            }
        });
    }

    if (isArray(result)) {
        return result.map(r => ({ type: 'text', text: r as string }));
    }

    if (typeof result === 'object') {
        return JSON.stringify(result);
    }

    return result;
}

/**
 * Builds a finished server tool call stream part from a provider result block. The raw block is stored on
 * `data` for faithful replay, while `result` holds a compact, human-readable summary for rendering (the raw
 * fetched document / search payload would otherwise render as an unreadable JSON blob).
 */
function buildServerToolResultPart(
    serverToolCalls: readonly ToolCallback[],
    toolUseId: string,
    nativeName: string,
    result: ToolCallContent,
    rawContent: unknown
): ServerToolCallResponsePart {
    const matching = serverToolCalls.find(call => call.id === toolUseId);
    return {
        server_tool_calls: [{
            id: toolUseId,
            name: matching?.name ?? nativeName,
            arguments: matching?.args,
            finished: true,
            result,
            data: { [ANTHROPIC_RESULT_BLOCK_DATA_KEY]: JSON.stringify(rawContent) }
        }]
    };
}

/**
 * Implements the Anthropic language model integration for Theia. Reasoning-level
 * translation lives in {@link anthropicReasoningFor}.
 */
export class AnthropicModel implements LanguageModel {

    /** Provider identifier, used to key per-provider settings (e.g. server tool selections) and the capabilities UI. */
    readonly vendor = 'anthropic';

    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public enableStreaming: boolean,
        public useCaching: boolean,
        public apiKey: () => string | undefined,
        public url: string | undefined,
        public maxTokens: number = DEFAULT_MAX_TOKENS,
        public maxRetries: number = 3,
        public proxy?: string,
        public reasoningSupport?: ReasoningSupport,
        public reasoningApi?: ReasoningApi,
        public supportsXHighEffort?: boolean,
        public maxInputTokens?: number,
        public serverTools?: ServerToolDescriptor[],
        public serverSideCompactionEnabledByDefault: boolean = false,
        public memoryToolFolder?: string
    ) { }

    get serverSideCompactionSupport(): boolean {
        return this.computeServerSideCompactionSupport();
    }

    /**
     * Server-side compaction (`compact_20260112`) is available on Claude Opus and Sonnet 4.6 and later.
     * Heuristic over the model id; override for custom endpoints with different support.
     */
    protected computeServerSideCompactionSupport(): boolean {
        const match = /(opus|sonnet)-(\d+)-(\d+)/.exec(this.model);
        if (!match) {
            return false;
        }
        const major = Number(match[2]);
        // A 4+ digit "minor" is a date suffix on a `.0` model id (e.g. claude-sonnet-4-20250514), not a minor version.
        const minor = Number(match[3]) >= 1000 ? 0 : Number(match[3]);
        return major > 4 || (major === 4 && minor >= 6);
    }

    protected getSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return {
            ...request.settings,
            ...anthropicReasoningFor(request.reasoning?.level, this.reasoningApi, this.supportsXHighEffort)
        };
    }

    /** Resolves whether this request will route through the Anthropic Beta Messages API for server-side compaction. */
    protected useServerSideCompaction(request: LanguageModelRequest): boolean {
        return resolveServerSideCompaction(this.serverSideCompactionSupport, this.serverSideCompactionEnabledByDefault, request.compaction);
    }

    /** Whether this request routes through the Anthropic Beta Messages API (server-side compaction and/or the memory tool). */
    protected useBetaMessages(request: LanguageModelRequest): boolean {
        return this.useServerSideCompaction(request) || this.hasMemoryTool(request);
    }

    /** Whether Anthropic's built-in memory tool is active for this request: its storage folder is configured and the tool has been injected (see {@link withMemoryTool}). */
    protected hasMemoryTool(request: LanguageModelRequest): boolean {
        return !!this.memoryToolFolder && !!request.tools?.some(tool => tool.name === MEMORY_TOOL_NAME);
    }

    /**
     * Augments the base message-create params for the Beta Messages API: it sets the `betas` header and, when server-side
     * compaction is enabled for the request, the context-management edit. When neither server-side compaction nor the
     * memory tool is active, the params are returned unchanged so the default (stable) path is byte-for-byte identical.
     */
    protected applyBetaParams<T extends Anthropic.MessageCreateParams>(params: T, request: LanguageModelRequest): T {
        const useCompaction = this.useServerSideCompaction(request);
        const useMemory = this.hasMemoryTool(request);
        if (!useCompaction && !useMemory) {
            return params;
        }
        const betaParams = params as T & Anthropic.Beta.Messages.MessageCreateParams;
        const betas: string[] = [];
        if (useCompaction) {
            betas.push('compact-2026-01-12');
            betaParams.context_management = { edits: [{ type: 'compact_20260112' }] };
        }
        if (useMemory) {
            betas.push(MEMORY_TOOL_BETA);
        }
        betaParams.betas = betas;
        return betaParams;
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        if (!request.messages?.length) {
            throw new Error('Request must contain at least one message');
        }

        const anthropic = this.initializeAnthropic();
        const effectiveRequest = this.withMemoryTool(request);

        try {
            if (this.enableStreaming) {
                return this.handleStreamingRequest(anthropic, effectiveRequest, cancellationToken);
            }
            return this.handleNonStreamingRequest(anthropic, effectiveRequest);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Anthropic API request failed: ${errorMessage}`);
        }
    }

    protected async handleStreamingRequest(
        anthropic: Anthropic,
        request: UserRequest,
        cancellationToken?: CancellationToken,
        toolMessages?: readonly Anthropic.Messages.MessageParam[]
    ): Promise<LanguageModelStreamResponse> {
        const settings = this.getSettings(request);
        const useCompaction = this.useServerSideCompaction(request);
        const useBeta = this.useBetaMessages(request);
        const { messages, systemMessage: baseSystemMessage } = transformToAnthropicParams(request.messages, this.useCaching, useCompaction);
        const systemMessage = this.appendMemoryGuidance(baseSystemMessage, request);

        let anthropicMessages = [...messages, ...(toolMessages ?? [])];

        if (this.useCaching && anthropicMessages.length) {
            anthropicMessages = addCacheControlToLastMessage(anthropicMessages);
        }

        const tools = this.createTools(request);
        if (request.deferredToolIds?.length && tools) {
            console.debug('Anthropic: converted tools for deferred loading:', tools.map(tool => ({
                name: 'name' in tool ? tool.name : undefined,
                type: 'type' in tool ? tool.type : 'custom',
                defer_loading: 'defer_loading' in tool ? tool.defer_loading : undefined
            })));
        }
        const params: Anthropic.MessageCreateParams = this.applyBetaParams({
            max_tokens: this.maxTokens,
            messages: anthropicMessages,
            tools,
            tool_choice: tools ? { type: 'auto' } : undefined,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings
        }, request);
        // The beta message params are a structural superset of the stable ones for the content we build, so the cast at the beta call boundary is safe.
        // The beta stream is likewise structurally compatible with the stable MessageStream: we narrow compaction events via explicit casts in the
        // loop below, and casting the stream here keeps the iterator and lifecycle handling identical on both paths.
        const stream = useBeta
            ? anthropic.beta.messages.stream(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
                { maxRetries: this.maxRetries }) as unknown as ReturnType<Anthropic['messages']['stream']>
            : anthropic.messages.stream(params, { maxRetries: this.maxRetries });

        cancellationToken?.onCancellationRequested(() => {
            stream.abort();
        });
        const that = this;

        const asyncIterator = {
            async *[Symbol.asyncIterator](): AsyncIterator<LanguageModelStreamResponsePart> {

                const toolCalls: ToolCallback[] = [];
                let toolCall: ToolCallback | undefined;
                // Server tools are executed by Anthropic; we surface their invocations/results but do not call any client handler.
                const serverToolCalls: ToolCallback[] = [];
                let serverToolCall: ToolCallback | undefined;
                const currentMessages: Message[] = [];
                let currentMessage: Message | undefined = undefined;
                let currentOutputTokens: number = 0;
                let usageYielded = false;
                // Accumulator for a streamed compaction block (beta path only): content + opaque encrypted_content across start + deltas.
                let compaction: { index: number; content: string | null; encrypted_content: string | null } | undefined;

                try {
                    for await (const event of stream) {
                        if (event.type === 'content_block_start') {
                            const contentBlock = event.content_block;

                            if (contentBlock.type === 'thinking') {
                                yield { thought: contentBlock.thinking, signature: contentBlock.signature ?? '' };
                            }
                            if (contentBlock.type === 'text') {
                                yield { content: contentBlock.text };
                            }
                            // Compaction blocks only occur on the beta path; guard via type narrowing.
                            if (contentBlock.type === 'compaction') {
                                const block = contentBlock as Anthropic.Beta.Messages.BetaCompactionBlock;
                                compaction = { index: event.index, content: block.content, encrypted_content: block.encrypted_content };
                            }
                            if (contentBlock.type === 'tool_use') {
                                toolCall = { name: contentBlock.name!, args: '', id: contentBlock.id!, index: event.index };
                                yield { tool_calls: [{ finished: false, id: toolCall.id, function: { name: toolCall.name, arguments: toolCall.args } }] };
                            }
                            if (contentBlock.type === 'server_tool_use') {
                                // The deferred-tool search invocation also arrives as `server_tool_use`; it is handled by Anthropic
                                // internally and must not be surfaced to the UI as a server tool call.
                                if (contentBlock.name === 'tool_search_tool_bm25') {
                                    console.debug('Anthropic: received deferred tool stream block:', contentBlock);
                                } else {
                                    serverToolCall = { name: contentBlock.name, args: '', id: contentBlock.id, index: event.index };
                                    yield { server_tool_calls: [{ id: serverToolCall.id, name: serverToolCall.name, arguments: '', finished: false }] };
                                }
                            }
                            if (contentBlock.type === 'web_fetch_tool_result') {
                                // Result blocks are delivered complete (not streamed). Surface them as a finished server tool call.
                                const fetchContent = contentBlock.content;
                                const result: ToolCallContent = fetchContent.type === 'web_fetch_result'
                                    ? { content: [{ type: 'text', text: `Fetched ${fetchContent.url}${fetchContent.content.title ? ` — ${fetchContent.content.title}` : ''}` }] }
                                    : createToolCallError(`Web fetch failed: ${fetchContent.error_code}`);
                                yield buildServerToolResultPart(serverToolCalls, contentBlock.tool_use_id, ANTHROPIC_WEB_FETCH, result, fetchContent);
                            }
                            if (contentBlock.type === 'web_search_tool_result') {
                                const searchContent = contentBlock.content;
                                let result: ToolCallContent;
                                if (Array.isArray(searchContent)) {
                                    const lines = searchContent.map(entry => [entry.title, entry.url].filter(Boolean).join(' — ')).filter(line => line.length > 0);
                                    result = { content: [{ type: 'text', text: lines.length > 0 ? lines.join('\n') : 'No search results.' }] };
                                } else {
                                    result = createToolCallError(`Web search failed: ${searchContent.error_code}`);
                                }
                                yield buildServerToolResultPart(serverToolCalls, contentBlock.tool_use_id, ANTHROPIC_WEB_SEARCH, result, searchContent);
                            }
                            if ((contentBlock.type as string) === 'tool_search_tool_result') {
                                console.debug('Anthropic: received deferred tool stream block:', contentBlock);
                            }
                        } else if (event.type === 'content_block_delta') {
                            const delta = event.delta;
                            if (delta.type === 'thinking_delta') {
                                yield { thought: delta.thinking, signature: '' };
                            }
                            if (delta.type === 'signature_delta') {
                                yield { thought: '', signature: delta.signature };
                            }
                            if (delta.type === 'text_delta') {
                                yield { content: delta.text };
                            }
                            if (compaction && delta.type === 'compaction_delta') {
                                const compactionDelta = delta as Anthropic.Beta.Messages.BetaCompactionContentBlockDelta;
                                compaction.content = compactionDelta.content;
                                compaction.encrypted_content = compactionDelta.encrypted_content;
                            }
                            if (toolCall && delta.type === 'input_json_delta') {
                                toolCall.args += delta.partial_json;
                                yield { tool_calls: [{ function: { arguments: delta.partial_json } }] };
                            }
                            if (serverToolCall && delta.type === 'input_json_delta') {
                                serverToolCall.args += delta.partial_json;
                                yield { server_tool_calls: [{ id: serverToolCall.id, name: serverToolCall.name, arguments: serverToolCall.args, finished: false }] };
                            }
                        } else if (event.type === 'content_block_stop') {
                            if (toolCall && toolCall.index === event.index) {
                                toolCalls.push(toolCall);
                                toolCall = undefined;
                            }
                            if (serverToolCall && serverToolCall.index === event.index) {
                                serverToolCalls.push(serverToolCall);
                                serverToolCall = undefined;
                            }
                            if (compaction && compaction.index === event.index) {
                                const data = { content: compaction.content, encrypted_content: compaction.encrypted_content };
                                yield { compaction: { provider: 'anthropic', data, summary: compaction.content ?? undefined } };
                                compaction = undefined;
                            }
                        } else if (event.type === 'message_delta') {
                            currentOutputTokens = event.usage.output_tokens;
                            if (event.delta.stop_reason === 'max_tokens') {
                                if (toolCall) {
                                    yield { tool_calls: [{ finished: true, id: toolCall.id }] };
                                }
                                throw new Error(`The response was stopped because it exceeded the max token limit of ${event.usage.output_tokens}.`);
                            }
                        } else if (event.type === 'message_start') {
                            currentMessages.push(event.message);
                            currentMessage = event.message;
                            currentOutputTokens = 0;
                        } else if (event.type === 'message_stop') {
                            if (currentMessage) {
                                usageYielded = true;
                                yield {
                                    input_tokens: currentMessage.usage.input_tokens,
                                    output_tokens: currentOutputTokens,
                                    cache_creation_input_tokens: currentMessage.usage.cache_creation_input_tokens || undefined,
                                    cache_read_input_tokens: currentMessage.usage.cache_read_input_tokens || undefined,
                                };
                            }
                        }
                    }
                } finally {
                    // Yield partial usage data when stream is aborted before message_stop
                    if (!usageYielded && currentMessage) {
                        yield {
                            input_tokens: currentMessage.usage.input_tokens,
                            output_tokens: currentOutputTokens,
                            cache_creation_input_tokens: currentMessage.usage.cache_creation_input_tokens || undefined,
                            cache_read_input_tokens: currentMessage.usage.cache_read_input_tokens || undefined,
                        };
                    }
                }
                if (toolCalls.length > 0) {
                    const toolResult = await Promise.all(toolCalls.map(async tc => {
                        const tool = request.tools?.find(t => t.name === tc.name);
                        const argsObject = tc.args.length === 0 ? '{}' : tc.args;
                        const handlerResult = tool
                            ? await tool.handler(argsObject, ToolInvocationContext.create(tc.id))
                            : createToolCallError(`Tool '${tc.name}' not found in the available tools for this request.`, 'tool-not-available');

                        return { name: tc.name, result: handlerResult, id: tc.id, arguments: argsObject };

                    }));

                    const calls = toolResult.map(tr => ({ finished: true, id: tr.id, result: tr.result, function: { name: tr.name, arguments: tr.arguments } }));
                    yield { tool_calls: calls };

                    const toolResponseMessage: Anthropic.Messages.MessageParam = {
                        role: 'user',
                        content: toolResult.map(call => ({
                            type: 'tool_result',
                            tool_use_id: call.id!,
                            content: formatToolCallResult(call.result)
                        }))
                    };
                    const result = await that.handleStreamingRequest(
                        anthropic,
                        request,
                        cancellationToken,
                        [
                            ...(toolMessages ?? []),
                            ...currentMessages.map(m => ({ role: m.role, content: m.content })),
                            toolResponseMessage
                        ]
                    );
                    for await (const nestedEvent of result.stream) {
                        yield nestedEvent;
                    }
                }
            },
        };

        stream.on('error', (error: Error) => {
            console.error('Error in Anthropic streaming:', error);
        });

        return { stream: asyncIterator };
    }

    /**
     * Returns the request extended with the memory tool if it is activated (see {@link memoryToolFolder}), so that memory tool
     * calls are dispatched like any other tool call. Request tools with a conflicting name are replaced.
     */
    protected withMemoryTool<T extends LanguageModelRequest>(request: T): T {
        const memoryTool = this.createMemoryTool();
        if (!memoryTool) {
            return request;
        }
        const memoryToolRequest: ToolRequest = {
            id: MEMORY_TOOL_NAME,
            name: MEMORY_TOOL_NAME,
            description: 'Anthropic\'s built-in memory tool, executed against the configured memory folder.',
            parameters: { type: 'object', properties: {} },
            handler: argsJson => memoryTool.execute(argsJson)
        };
        return {
            ...request,
            tools: [memoryToolRequest, ...(request.tools?.filter(tool => tool.name !== MEMORY_TOOL_NAME) ?? [])]
        };
    }

    /**
     * Maps the request tools to Anthropic tool parameters. The activated memory tool (see {@link withMemoryTool}) is mapped
     * to Anthropic's built-in `memory_20250818` tool type instead of a custom schema tool, so that the model uses its native
     * memory behavior and the memory protocol system prompt is injected automatically by the API.
     */
    protected createTools(request: LanguageModelRequest): Anthropic.Messages.ToolUnion[] | undefined {
        const deferred = new Set(request.deferredToolIds ?? []);
        const tools: Anthropic.Messages.ToolUnion[] = (request.tools ?? []).map(tool =>
            this.memoryToolFolder && tool.name === MEMORY_TOOL_NAME
                ? { type: MEMORY_TOOL_TYPE, name: MEMORY_TOOL_NAME } as Anthropic.Messages.MemoryTool20250818
                : {
                    name: tool.name,
                    description: tool.description,
                    input_schema: { ...tool.parameters, type: 'object' },
                    defer_loading: deferred.has(tool.id) ? true : undefined
                } as Anthropic.Messages.Tool);
        if (deferred.size > 0) {
            tools.push({
                type: 'tool_search_tool_bm25',
                name: 'tool_search_tool_bm25'
            });
        }
        // Cache the client tools as before; server tools are appended afterwards.
        if (this.useCaching && tools.length) {
            tools[tools.length - 1].cache_control = { type: 'ephemeral' };
        }
        tools.push(...this.createServerTools(request));
        return tools.length > 0 ? tools : undefined;
    }

    /** Translates the enabled server tool ids on the request into native Anthropic server tool params. */
    protected createServerTools(request: LanguageModelRequest): Anthropic.Messages.ToolUnion[] {
        const enabled = request.serverTools ?? [];
        const serverTools: Anthropic.Messages.ToolUnion[] = [];
        if (enabled.includes(ANTHROPIC_WEB_FETCH)) {
            serverTools.push({ type: 'web_fetch_20250910', name: 'web_fetch' });
        }
        if (enabled.includes(ANTHROPIC_WEB_SEARCH)) {
            serverTools.push({ type: 'web_search_20250305', name: 'web_search' });
        }
        return serverTools;
    }

    protected createMemoryTool(): AnthropicMemoryTool | undefined {
        return this.memoryToolFolder ? new AnthropicMemoryTool(this.memoryToolFolder) : undefined;
    }

    /**
     * Appends session-scoped memory guidance to the system prompt when the memory tool is active. The guidance is added as a
     * separate trailing block (after the cached prompt) because it varies per session and must not become part of the cached prefix.
     */
    protected appendMemoryGuidance(
        systemMessage: Anthropic.Messages.TextBlockParam[] | undefined,
        request: UserRequest
    ): Anthropic.Messages.TextBlockParam[] | undefined {
        if (!this.hasMemoryTool(request)) {
            return systemMessage;
        }
        const guidance: Anthropic.Messages.TextBlockParam = { type: 'text', text: this.buildMemoryGuidance(request.sessionId) };
        return systemMessage ? [...systemMessage, guidance] : [guidance];
    }

    /** Builds the session-scoped memory guidance, deriving a short per-session file suffix from the session id. */
    protected buildMemoryGuidance(sessionId: string): string {
        const suffix = sessionId.replace(/-/g, '').slice(0, 8) || 'default';
        const sessionFile = `/memories/sessions/<short-task-name>-${suffix}.md`;
        return [
            'You have a persistent memory directory at `/memories`. Maintain two kinds of memory there:',
            '',
            '- General knowledge: durable, cross-session information (user preferences, project facts, conventions, and anything',
            '  likely useful in future sessions). Organize it across multiple topic files under `/memories/` (roughly one file per',
            '  topic or area) rather than a single file. Create and update these files whenever you learn something durable.',
            '- Session memory: information specific to the current chat session (its goal, key decisions, and progress). Store it in',
            `  \`${sessionFile}\`, where \`<short-task-name>\` is a short, descriptive slug for this session's task. Create it if it does not exist.`,
            '- Cross-link both directions so navigation works either way: from the relevant general topic file(s) add a link to the',
            '  session file, and from the session file add a link back to the relevant general topic file(s). Both must link to each other.'
        ].join('\n');
    }

    protected async handleNonStreamingRequest(
        anthropic: Anthropic,
        request: UserRequest
    ): Promise<LanguageModelTextResponse> {
        const settings = this.getSettings(request);
        const useCompaction = this.useServerSideCompaction(request);
        const useBeta = this.useBetaMessages(request);
        const { messages, systemMessage: baseSystemMessage } = transformToAnthropicParams(request.messages, true, useCompaction);
        const systemMessage = this.appendMemoryGuidance(baseSystemMessage, request);

        const params: Anthropic.MessageCreateParams = this.applyBetaParams({
            max_tokens: this.maxTokens,
            messages,
            model: this.model,
            ...(systemMessage && { system: systemMessage }),
            ...settings,
        }, request);

        try {
            // The beta message params are a structural superset of the stable ones, so the cast at the beta call boundary is safe.
            const response = useBeta
                ? await anthropic.beta.messages.create(params as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming)
                : await anthropic.messages.create(params);
            const textContent = response.content[0];

            const usage = response.usage ? {
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
                cache_creation_input_tokens: response.usage.cache_creation_input_tokens || undefined,
                cache_read_input_tokens: response.usage.cache_read_input_tokens || undefined,
            } : undefined;

            if (textContent?.type === 'text') {
                return { text: textContent.text, usage };
            }

            return { text: '', usage };
        } catch (error) {
            throw new Error(`Failed to get response from Anthropic API: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected initializeAnthropic(): Anthropic {
        const apiKey = this.apiKey();
        if (!apiKey && !(this.url)) {
            throw new Error('Please provide ANTHROPIC_API_KEY in preferences or via environment variable');
        }

        // We need to hand over "some" key, even if a custom url is not key protected as otherwise the Anthropic client will throw an error
        const key = apiKey ?? 'no-key';

        return new Anthropic({ apiKey: key, baseURL: this.url, fetch: createProxyFetch(this.proxy) });
    }
}
