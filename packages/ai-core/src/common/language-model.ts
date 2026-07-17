// *****************************************************************************
// Copyright (C) 2024-2025 EclipseSource GmbH.
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

import { ContributionProvider, ILogger, isFunction, isObject, Event, Emitter, CancellationToken } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

export type MessageActor = 'user' | 'ai' | 'system';

/** Provider-agnostic reasoning level; each provider maps this to its native API. */
export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'auto';

export interface ReasoningSettings {
    level: ReasoningLevel;
}

/**
 * Shape of a model's reasoning parameter in its native API.
 * - `'effort'`: discrete effort enum.
 * - `'budget'`: numeric token budget.
 */
export type ReasoningApi = 'effort' | 'budget';

/**
 * Declares a model's reasoning capabilities. When unset, the chat UI hides the
 * reasoning selector and providers ignore the `reasoning` field on requests.
 */
export interface ReasoningSupport {
    readonly supportedLevels: ReadonlyArray<ReasoningLevel>;
    readonly defaultLevel?: ReasoningLevel;
}

export type LanguageModelMessage =
    TextMessage | ThinkingMessage | ToolUseMessage | ToolResultMessage | ServerToolUseMessage | ImageMessage | CompactionMessage;
export namespace LanguageModelMessage {

    export function isTextMessage(obj: LanguageModelMessage): obj is TextMessage {
        return obj.type === 'text';
    }
    export function isThinkingMessage(obj: LanguageModelMessage): obj is ThinkingMessage {
        return obj.type === 'thinking';
    }
    export function isToolUseMessage(obj: LanguageModelMessage): obj is ToolUseMessage {
        return obj.type === 'tool_use';
    }
    export function isToolResultMessage(obj: LanguageModelMessage): obj is ToolResultMessage {
        return obj.type === 'tool_result';
    }
    export function isServerToolUseMessage(obj: LanguageModelMessage): obj is ServerToolUseMessage {
        return obj.type === 'server_tool_use';
    }
    export function isImageMessage(obj: LanguageModelMessage): obj is ImageMessage {
        return obj.type === 'image';
    }
    export function isCompactionMessage(obj: LanguageModelMessage): obj is CompactionMessage {
        return obj.type === 'compaction';
    }
}
export interface TextMessage {
    actor: MessageActor;
    type: 'text';
    text: string;
}
export interface ThinkingMessage {
    actor: 'ai'
    type: 'thinking';
    thinking: string;
    signature: string;
}

export interface ToolResultMessage {
    actor: 'user';
    tool_use_id: string;
    name: string;
    type: 'tool_result';
    content?: ToolCallResult;
    is_error?: boolean;
}

export interface ToolUseMessage {
    actor: 'ai';
    type: 'tool_use';
    id: string;
    input: unknown;
    name: string;
    data?: Record<string, string>;
}

/**
 * Replay message for a tool the provider executed on its own infrastructure (a server tool).
 * Unlike {@link ToolUseMessage}/{@link ToolResultMessage}, the invocation and its result are
 * carried together because the client never executes the tool. Providers reconstruct their
 * native request blocks from this message on subsequent turns.
 */
export interface ServerToolUseMessage {
    actor: 'ai';
    type: 'server_tool_use';
    id: string;
    name: string;
    input: unknown;
    result?: ToolCallResult;
    /** Provider-specific metadata needed to faithfully reconstruct the server tool blocks on replay. */
    data?: Record<string, string>;
}
export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/svg+xml' | string & {};
export interface UrlImageContent { url: string };
export interface Base64ImageContent {
    base64data: string;
    mimeType: ImageMimeType;
};
export type ImageContent = UrlImageContent | Base64ImageContent;
export namespace ImageContent {
    export const isUrl = (obj: ImageContent): obj is UrlImageContent => 'url' in obj;
    export const isBase64 = (obj: ImageContent): obj is Base64ImageContent => 'base64data' in obj && 'mimeType' in obj;
}
export interface ImageMessage {
    actor: 'ai' | 'user';
    type: 'image';
    image: ImageContent;
}

export interface CompactionMessage {
    actor: 'ai';
    type: 'compaction';
    /** Originating provider tag; a backend replays the payload only when this matches its own provider. */
    provider: string;
    /** Opaque provider payload to replay. */
    data: unknown;
    /** Human-readable summary, when the provider exposes one. */
    summary?: string;
}

export const isLanguageModelRequestMessage = (obj: unknown): obj is LanguageModelMessage =>
    !!(obj && typeof obj === 'object' &&
        'type' in obj &&
        typeof (obj as { type: unknown }).type === 'string' &&
        (obj as { type: unknown }).type === 'text' &&
        'query' in obj &&
        typeof (obj as { query: unknown }).query === 'string'
    );

export interface AutoActionResult {
    action: 'allow' | 'deny';
    reason?: string;
}

export interface ToolRequestParameterProperty {
    type?: | 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
    anyOf?: ToolRequestParameterProperty[];
    [key: string]: unknown;
}

export type ToolRequestParametersProperties = Record<string, ToolRequestParameterProperty>;
export interface ToolRequestParameters {
    type?: 'object';
    properties: ToolRequestParametersProperties;
    required?: string[];
}
/**
 * Defines a tool that can be invoked by language models.
 * @typeParam TContext - The context type passed to the handler. Defaults to ToolInvocationContext.
 */
export interface ToolRequest<TContext extends ToolInvocationContext = ToolInvocationContext> {
    id: string;
    name: string;
    parameters: ToolRequestParameters
    description?: string;
    handler: (arg_string: string, ctx?: TContext) => Promise<ToolCallResult>;
    providerName?: string;

    /**
     * If set, this tool requires extra confirmation before auto-approval can be enabled.
     *
     * When a tool has this flag:
     * - It defaults to CONFIRM mode (not ALWAYS_ALLOW) even if global default is ALWAYS_ALLOW
     * - When user selects "Always Allow", an extra confirmation modal is shown
     * - The modal displays a warning about the tool's capabilities
     *
     * If a string is provided, it will be displayed as the custom warning message.
     * If true, a generic warning message will be shown.
     *
     * Use for tools with broad system access (shell execution, file deletion, etc.)
     */
    confirmAlwaysAllow?: boolean | string;

    /**
     * Optional method that returns a short, human-readable label for the tool's arguments
     * to display in the chat UI summary.
     *
     * @param args - The raw arguments JSON string passed to the tool.
     * @returns An object with:
     *  - `label`: A short text to display (e.g. the most important argument value).
     *  - `hasMore`: Whether there are additional arguments not shown in the label (renders as `...` suffix).
     *  Returns `undefined` if no short label can be determined.
     *  If this method is not provided, a generic condensed rendering of the arguments JSON is used as fallback.
     */
    getArgumentsShortLabel?(args: string): { label: string; hasMore: boolean } | undefined;

    /**
     * Optional hook to determine automatic action for this tool invocation.
     * @param argString - The JSON argument string passed to the tool
     * @returns
     *   - { action: 'allow' } - Auto-approve without confirmation
     *   - { action: 'deny', reason } - Auto-deny without confirmation
     *   - undefined - Show confirmation UI (default behavior)
     */
    checkAutoAction?: (argString: string) => AutoActionResult | undefined;
}

/**
 * Context passed to tool handlers during invocation by language models.
 * Language models should pass this context when invoking tool handlers to enable
 * proper tracking and correlation of tool calls.
 */
export interface ToolInvocationContext {
    /**
     * The unique identifier for this specific tool call invocation.
     * This ID is assigned by the language model and used to correlate
     * the tool call with its response.
     */
    toolCallId?: string;
    /**
     * Optional cancellation token to support cancelling tool execution.
     */
    cancellationToken?: CancellationToken;
}

export namespace ToolInvocationContext {
    export function is(obj: unknown): obj is ToolInvocationContext {
        return !!obj && typeof obj === 'object';
    }

    /**
     * Creates a new ToolInvocationContext with the given tool call ID and optional cancellation token.
     */
    export function create(toolCallId?: string, cancellationToken?: CancellationToken): ToolInvocationContext {
        return { toolCallId, cancellationToken };
    }

    /**
     * Extracts the tool call ID from an unknown context object.
     * Returns undefined if the context is not a valid ToolInvocationContext or has no toolCallId.
     */
    export function getToolCallId(ctx: unknown): string | undefined {
        if (is(ctx) && 'toolCallId' in ctx && typeof ctx.toolCallId === 'string') {
            return ctx.toolCallId;
        }
        return undefined;
    }

    /**
     * Extracts the cancellation token from an unknown context object.
     */
    export function getCancellationToken(ctx: unknown): CancellationToken | undefined {
        if (is(ctx) && 'cancellationToken' in ctx) {
            return ctx.cancellationToken as CancellationToken | undefined;
        }
        return undefined;
    }
}

export namespace ToolRequest {
    function isToolRequestParameterProperty(obj: unknown): obj is ToolRequestParameterProperty {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        const record = obj as Record<string, unknown>;

        // Check that at least one of "type" or "anyOf" exists
        if (!('type' in record) && !('anyOf' in record)) {
            return false;
        }

        // If an "anyOf" field is present, it must be an array where each item is also a valid property.
        if ('anyOf' in record) {
            if (!Array.isArray(record.anyOf)) {
                return false;
            }
            for (const item of record.anyOf) {
                if (!isToolRequestParameterProperty(item)) {
                    return false;
                }
            }
        }
        if ('type' in record && typeof record.type !== 'string') {
            return false;
        }

        // No further checks required for additional properties.
        return true;
    }
    export function isToolRequestParametersProperties(obj: unknown): obj is ToolRequestParametersProperties {
        if (!obj || typeof obj !== 'object') {
            return false;
        }
        return Object.entries(obj).every(([key, value]) => {
            if (typeof key !== 'string') {
                return false;
            }
            return isToolRequestParameterProperty(value);
        });
    }
    export function isToolRequestParameters(obj: unknown): obj is ToolRequestParameters {
        return !!obj && typeof obj === 'object' &&
            (!('type' in obj) || obj.type === 'object') &&
            'properties' in obj && isToolRequestParametersProperties(obj.properties) &&
            (!('required' in obj) || (Array.isArray(obj.required) && obj.required.every(prop => typeof prop === 'string')));
    }
}
/**
 * Per-session/per-request server-side compaction settings, carried verbatim from the chat
 * session's common settings to the request. Kept as an object so further parameters can be
 * added later.
 */
export interface CompactionSettings {
    /** Explicit enablement for this session; when set it wins over the model's default. `undefined` means "no explicit choice". */
    enabled?: boolean;
}

/** Per-provider override for server-side compaction; combined with the global preference by {@link resolveCompactionDefault}. */
export type ServerSideCompactionSetting = 'default' | 'enabled' | 'disabled';

/**
 * Resolves a model's default server-side compaction enablement from the global preference and
 * the per-provider override. `'enabled'`/`'disabled'` force the result; `'default'` defers to
 * the global preference. Intended to be called where the preferences are read (the provider's
 * frontend contribution) and stored on the model.
 */
export function resolveCompactionDefault(globalEnabled: boolean, perProviderOverride: ServerSideCompactionSetting): boolean {
    if (perProviderOverride === 'enabled') {
        return true;
    }
    if (perProviderOverride === 'disabled') {
        return false;
    }
    return globalEnabled;
}

/**
 * Resolves whether server-side compaction is effective for a request: the model must support it
 * (capability), then an explicit per-session setting wins, otherwise the model's resolved default applies.
 */
export function resolveServerSideCompaction(
    capability: boolean | undefined,
    enabledByDefault: boolean,
    compaction: CompactionSettings | undefined
): boolean {
    if (!capability) {
        return false;
    }
    return compaction?.enabled ?? enabledByDefault;
}

export interface LanguageModelRequest {
    messages: LanguageModelMessage[],
    tools?: ToolRequest[];
    /**
     * Ids of tools whose definitions should be deferred and discovered
     * on-demand via the provider's built-in tool search mechanism.
     * Providers that do not support deferred loading should ignore this field.
     */
    deferredToolIds?: string[];
    /**
     * Ids of the provider's server tools (see {@link ServerToolDescriptor}) that are enabled for this
     * request. Each provider translates the enabled ids into its native server tool configuration.
     */
    serverTools?: string[];
    response_format?: { type: 'text' } | { type: 'json_object' } | ResponseFormatJsonSchema;
    settings?: { [key: string]: unknown };
    clientSettings?: { keepToolCalls: boolean; keepThinking: boolean };
    /** Provider-agnostic reasoning configuration; providers translate it to their native API. */
    reasoning?: ReasoningSettings;
    /** Provider-agnostic server-side compaction settings, copied verbatim from the chat session. Resolved against the model's capability and default in the backend. */
    compaction?: CompactionSettings;
}
export interface ResponseFormatJsonSchema {
    type: 'json_schema';
    json_schema: {
        name: string,
        description?: string,
        schema?: Record<string, unknown>,
        strict?: boolean | null
    };
}

/**
 * The UserRequest extends the "pure" LanguageModelRequest for cancelling support as well as
 * logging metadata.
 * The additional metadata might also be used for other use cases, for example to query default
 * request settings based on the agent id, merging with the request settings handed over.
 */
export interface UserRequest extends LanguageModelRequest {
    /**
     * Identifier of the Ai/ChatSession
     */
    sessionId: string;
    /**
     * Identifier of the request or overall exchange. Corresponds to request id in Chat sessions
     */
    requestId: string;
    /**
     * Id of a request in case a single exchange consists of multiple requests. In this case the requestId corresponds to the overall exchange.
     */
    subRequestId?: string;
    /**
     * Optional agent identifier in case the request was sent by an agent
     */
    agentId?: string;
    /**
     * Optional prompt variant ID used for this request
     */
    promptVariantId?: string;
    /**
     * Indicates whether the prompt variant was customized
     */
    isPromptVariantCustomized?: boolean;
    /**
     * Cancellation support
     */
    cancellationToken?: CancellationToken;
}

export interface LanguageModelTextResponse {
    text: string;
    usage?: UsageResponsePart;
}
export const isLanguageModelTextResponse = (obj: unknown): obj is LanguageModelTextResponse =>
    !!(obj && typeof obj === 'object' && 'text' in obj && typeof (obj as { text: unknown }).text === 'string');

export type LanguageModelStreamResponsePart =
    TextResponsePart | ToolCallResponsePart | ServerToolCallResponsePart | ThinkingResponsePart | UsageResponsePart | CompactionResponsePart;

export const isLanguageModelStreamResponsePart = (part: unknown): part is LanguageModelStreamResponsePart =>
    isUsageResponsePart(part) || isTextResponsePart(part) || isThinkingResponsePart(part) ||
    isToolCallResponsePart(part) || isServerToolCallResponsePart(part) || isCompactionResponsePart(part);

export interface UsageResponsePart {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}
export const isUsageResponsePart = (part: unknown): part is UsageResponsePart =>
    !!(part && typeof part === 'object' &&
        'input_tokens' in part && typeof part.input_tokens === 'number' &&
        'output_tokens' in part && typeof part.output_tokens === 'number');
export interface TextResponsePart {
    content: string;
}
export const isTextResponsePart = (part: unknown): part is TextResponsePart =>
    !!(part && typeof part === 'object' && 'content' in part && typeof part.content === 'string');

export interface ToolCallResponsePart {
    tool_calls: ToolCall[];
}
export const isToolCallResponsePart = (part: unknown): part is ToolCallResponsePart =>
    !!(part && typeof part === 'object' && 'tool_calls' in part && Array.isArray(part.tool_calls));

/**
 * A server tool invocation (and its result) that the provider executed on its own infrastructure.
 * The shape mirrors {@link ToolCall} but flattens name/arguments since there is no client handler.
 */
export interface ServerToolCall {
    id: string;
    name: string;
    arguments?: string;
    result?: ToolCallResult;
    finished?: boolean;
    /** Provider-specific metadata needed to faithfully reconstruct the server tool blocks on replay. */
    data?: Record<string, string>;
}

export interface ServerToolCallResponsePart {
    server_tool_calls: ServerToolCall[];
}
export const isServerToolCallResponsePart = (part: unknown): part is ServerToolCallResponsePart =>
    !!(part && typeof part === 'object' && 'server_tool_calls' in part && Array.isArray((part as ServerToolCallResponsePart).server_tool_calls));

export interface ThinkingResponsePart {
    thought: string;
    signature: string;
}
export const isThinkingResponsePart = (part: unknown): part is ThinkingResponsePart =>
    !!(part && typeof part === 'object' && 'thought' in part && typeof part.thought === 'string');

export interface CompactionResponsePart {
    compaction: {
        /** Originating provider tag, e.g. 'anthropic' or 'openai-responses'. */
        provider: string;
        /** Opaque provider payload (Anthropic compaction block(s) / OpenAI compaction item). Never interpreted outside the originating backend. */
        data: unknown;
        /** Human-readable summary, when the provider exposes one. */
        summary?: string;
    };
}
export const isCompactionResponsePart = (part: unknown): part is CompactionResponsePart =>
    !!(part && typeof part === 'object' && 'compaction' in part &&
        typeof (part as CompactionResponsePart).compaction === 'object' &&
        (part as CompactionResponsePart).compaction &&
        'provider' in (part as CompactionResponsePart).compaction &&
        typeof (part as CompactionResponsePart).compaction.provider === 'string');

export interface ToolCallTextResult { type: 'text', text: string; };
export interface ToolCallImageResult extends Base64ImageContent { type: 'image' };
export interface ToolCallAudioResult { type: 'audio', data: string; mimeType: string };
export type ToolCallErrorKind = 'tool-not-available';
export interface ToolCallErrorResult { type: 'error', data: string; errorKind?: ToolCallErrorKind; };
export type ToolCallContentResult = ToolCallTextResult | ToolCallImageResult | ToolCallAudioResult | ToolCallErrorResult;
export interface ToolCallContent {
    content: ToolCallContentResult[];
}

export const isToolCallContent = (result: unknown): result is ToolCallContent =>
    !!(result && typeof result === 'object' && 'content' in result && Array.isArray((result as ToolCallContent).content));

export const isToolCallErrorResult = (item: unknown): item is ToolCallErrorResult =>
    !!(item && typeof item === 'object' && 'type' in item && (item as ToolCallErrorResult).type === 'error' && 'data' in item);

export const isToolNotAvailableError = (item: unknown): item is ToolCallErrorResult =>
    isToolCallErrorResult(item) && item.errorKind === 'tool-not-available';

export const hasToolCallError = (result: ToolCallResult): boolean =>
    isToolCallContent(result) && result.content.some(isToolCallErrorResult);

export const hasToolNotAvailableError = (result: ToolCallResult): boolean =>
    isToolCallContent(result) && result.content.some(isToolNotAvailableError);

export const createToolCallError = (message: string, errorKind?: ToolCallErrorKind): ToolCallContent => ({
    content: [errorKind ? { type: 'error', data: message, errorKind } : { type: 'error', data: message }]
});

export type ToolCallResult = undefined | object | string | ToolCallContent;
export interface ToolCall {
    id?: string;
    function?: {
        arguments?: string;
        name?: string;
    },
    finished?: boolean;
    result?: ToolCallResult;
    data?: Record<string, string>;
    /**
     * When true, the arguments field contains a delta to be appended
     * to existing arguments rather than a complete replacement.
     */
    argumentsDelta?: boolean;
}

export interface LanguageModelStreamResponse {
    stream: AsyncIterable<LanguageModelStreamResponsePart>;
}
export const isLanguageModelStreamResponse = (obj: unknown): obj is LanguageModelStreamResponse =>
    !!(obj && typeof obj === 'object' && 'stream' in obj);

export interface LanguageModelParsedResponse {
    parsed: unknown;
    content: string;
    usage?: UsageResponsePart;
}
export const isLanguageModelParsedResponse = (obj: unknown): obj is LanguageModelParsedResponse =>
    !!(obj && typeof obj === 'object' && 'parsed' in obj && 'content' in obj);

export type LanguageModelResponse = LanguageModelTextResponse | LanguageModelStreamResponse | LanguageModelParsedResponse;

///////////////////////////////////////////
// Language Model Provider
///////////////////////////////////////////

export const LanguageModelProvider = Symbol('LanguageModelProvider');
export type LanguageModelProvider = () => Promise<LanguageModel[]>;

/**
 * Describes a server tool a provider offers (e.g. Anthropic `web_search`, Gemini `url_context`).
 * Server tools are executed by the provider's own infrastructure, not by Theia. Each provider
 * package declares the descriptors it supports and attaches them to its models so that the chat
 * UI can offer them for selection. The `id` is the stable identifier used in
 * {@link LanguageModelRequest.serverTools}.
 */
export interface ServerToolDescriptor {
    id: string;
    name: string;
    description?: string;
}

// See also VS Code `ILanguageModelChatMetadata`
export interface LanguageModelMetaData {
    readonly id: string;
    readonly name?: string;
    readonly vendor?: string;
    readonly version?: string;
    readonly family?: string;
    readonly maxInputTokens?: number;
    readonly maxOutputTokens?: number;
    readonly status: LanguageModelStatus;
    readonly reasoningSupport?: ReasoningSupport;
    /**
     * Server tools this model offers, declared code-level by the provider package.
     * **Note:** If you provide these, you must also provide `vendor` because server tools are vendor-specific.
     */
    readonly serverTools?: ServerToolDescriptor[];
    /** Whether this model supports provider-native server-side compaction (capability, distinct from whether it is activated). */
    readonly serverSideCompactionSupport?: boolean;
}

export namespace LanguageModelMetaData {
    export function is(arg: unknown): arg is LanguageModelMetaData {
        return isObject(arg) && 'id' in arg;
    }
}

export interface LanguageModelStatus {
    status: 'ready' | 'unavailable';
    message?: string;
}

export interface LanguageModel extends LanguageModelMetaData {
    request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse>;
}

export namespace LanguageModel {
    export function is(arg: unknown): arg is LanguageModel {
        return isObject(arg) && 'id' in arg && isFunction(arg.request);
    }
}

// See also VS Code `ILanguageModelChatSelector`
interface VsCodeLanguageModelSelector {
    readonly identifier?: string;
    readonly name?: string;
    readonly vendor?: string;
    readonly version?: string;
    readonly family?: string;
    readonly tokens?: number;
}

export interface LanguageModelSelector extends VsCodeLanguageModelSelector {
    readonly agent: string;
    readonly purpose: string;
}

export type LanguageModelRequirement = Omit<LanguageModelSelector, 'agent'>;

export const LanguageModelRegistry = Symbol('LanguageModelRegistry');

/**
 * Base interface for language model registries (frontend and backend).
 */
export interface LanguageModelRegistry {
    onChange: Event<{ models: LanguageModel[] }>;
    addLanguageModels(models: LanguageModel[]): void;
    getLanguageModels(): Promise<LanguageModel[]>;
    getLanguageModel(id: string): Promise<LanguageModel | undefined>;
    removeLanguageModels(id: string[]): void;
    selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined>;
    selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[] | undefined>;
    patchLanguageModel<T extends LanguageModel = LanguageModel>(id: string, patch: Partial<T>): Promise<void>;
}

export const FrontendLanguageModelRegistry = Symbol('FrontendLanguageModelRegistry');

/**
 * Frontend-specific language model registry interface (supports alias resolution).
 */
export interface FrontendLanguageModelRegistry extends LanguageModelRegistry {
    /**
     * If an id of a language model is provded, returns the LanguageModel if it is `ready`.
     * If an alias is provided, finds the highest-priority ready model from that alias.
     * If none are ready returns undefined.
     */
    getReadyLanguageModel(idOrAlias: string): Promise<LanguageModel | undefined>;
}

@injectable()
export class DefaultLanguageModelRegistryImpl implements LanguageModelRegistry {
    @inject(ILogger)
    protected logger: ILogger;
    @inject(ContributionProvider) @named(LanguageModelProvider)
    protected readonly languageModelContributions: ContributionProvider<LanguageModelProvider>;

    protected languageModels: LanguageModel[] = [];

    protected markInitialized: () => void;
    protected initialized: Promise<void> = new Promise(resolve => { this.markInitialized = resolve; });

    protected changeEmitter = new Emitter<{ models: LanguageModel[] }>();
    onChange = this.changeEmitter.event;

    @postConstruct()
    protected init(): void {
        const contributions = this.languageModelContributions.getContributions();
        const promises = contributions.map(provider => provider());
        Promise.allSettled(promises).then(results => {
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    this.languageModels.push(...result.value);
                } else {
                    this.logger.error('Failed to add some language models:', result.reason);
                }
            }
            this.markInitialized();
        });
    }

    addLanguageModels(models: LanguageModel[]): void {
        models.forEach(model => {
            if (this.languageModels.find(lm => lm.id === model.id)) {
                console.warn(`Tried to add already existing language model with id ${model.id}. The new model will be ignored.`);
                return;
            }
            this.languageModels.push(model);
            this.changeEmitter.fire({ models: this.languageModels });
        });
    }

    async getLanguageModels(): Promise<LanguageModel[]> {
        await this.initialized;
        // Return a fresh array (not the internal, mutated-in-place list) so consumers relying on
        // reference equality - e.g. React memoization in the chat model selector - detect changes.
        return [...this.languageModels];
    }

    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        await this.initialized;
        return this.languageModels.find(model => model.id === id);
    }

    removeLanguageModels(ids: string[]): void {
        ids.forEach(id => {
            const index = this.languageModels.findIndex(model => model.id === id);
            if (index !== -1) {
                this.languageModels.splice(index, 1);
                this.changeEmitter.fire({ models: this.languageModels });
            } else {
                console.warn(`Language model with id ${id} was requested to be removed, however it does not exist`);
            }
        });
    }

    async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[] | undefined> {
        await this.initialized;
        // TODO check for actor and purpose against settings
        return this.languageModels.filter(model => model.status.status === 'ready' && isModelMatching(request, model));
    }

    async selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined> {
        const models = await this.selectLanguageModels(request);
        return models ? models[0] : undefined;
    }

    async patchLanguageModel<T extends LanguageModel = LanguageModel>(id: string, patch: Partial<T>): Promise<void> {
        await this.initialized;
        const model = this.languageModels.find(m => m.id === id);
        if (!model) {
            this.logger.warn(`Language model with id ${id} not found for patch.`);
            return;
        }
        Object.assign(model, patch);
        this.changeEmitter.fire({ models: this.languageModels });
    }

}

export function isModelMatching(request: LanguageModelSelector, model: LanguageModel): boolean {
    return (!request.identifier || model.id === request.identifier) &&
        (!request.name || model.name === request.name) &&
        (!request.vendor || model.vendor === request.vendor) &&
        (!request.version || model.version === request.version) &&
        (!request.family || model.family === request.family);
}
