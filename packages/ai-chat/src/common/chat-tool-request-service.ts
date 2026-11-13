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

import { ToolInvocationContext, ToolRequest, ToolCallResult, createToolCallError, formatToolCallContentForModel, hasToolCallError } from '@theia/ai-core';
import { injectable, optional, inject } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { MutableChatRequestModel, MutableChatResponseModel } from './chat-model.js';
import { FileReadTracker } from './file-read-tracker.js';

/**
 * Checks if the given arguments string represents empty tool arguments.
 * Handles different representations: '', undefined, '{}', '{ }', etc.
 */
export function isEmptyToolArgs(args: string | undefined): boolean {
    if (!args) {
        return true;
    }
    try {
        const parsed = JSON.parse(args);
        return typeof parsed === 'object' && !!parsed && !Array.isArray(parsed) && Object.keys(parsed).length === 0;
    } catch {
        return false;
    }
}

/**
 * Normalizes tool arguments for comparison purposes.
 * Empty arguments (undefined, '', '{}') are normalized to '' for consistent comparison.
 */
export function normalizeToolArgs(args: string | undefined): string {
    return isEmptyToolArgs(args) ? '' : args!;
}

/**
 * Context object passed to tool handlers when invoked within a chat session.
 * Extends ToolInvocationContext to include chat-specific information.
 */
export interface ChatToolContext extends ToolInvocationContext {
    readonly request: MutableChatRequestModel;
    readonly response: MutableChatResponseModel;
    readonly rootSessionId?: string;
}

export namespace ChatToolContext {
    export function is(obj: unknown): obj is ChatToolContext {
        return !!obj && typeof obj === 'object' && 'request' in obj && 'response' in obj;
    }
}

/**
 * Asserts that the given context is a ChatToolContext.
 * Use this in tool handlers that require chat context to get type narrowing and runtime validation.
 * @throws Error if the context is not a valid ChatToolContext
 */
export function assertChatContext(ctx: unknown): asserts ctx is ChatToolContext {
    if (!ChatToolContext.is(ctx)) {
        throw new Error('This tool requires a chat context. It can only be used within a chat session.');
    }
}

/**
 * A ToolRequest that expects a ChatToolContext.
 */
export type ChatToolRequest = ToolRequest<ChatToolContext>;

/**
 * Resolved configuration for the tool-call loop guard. Supplied per invocation so the guard picks up
 * preference changes without restarting, and so the common service does not depend on the preference API.
 */
export interface ToolLoopGuardConfig {
    /** Whether the guard is active at all. */
    readonly enabled: boolean;
    /** Consecutive identical errors after which a {@link FileReadTracker} refresh is forced. */
    readonly refreshThreshold: number;
    /**
     * Consecutive identical errors after which the user is asked whether to keep retrying.
     * `0` disables the prompt. When enabled it must be greater than {@link refreshThreshold} and
     * less than {@link failThreshold}.
     */
    readonly promptThreshold: number;
    /** Consecutive identical errors after which the request is failed. Must exceed {@link refreshThreshold}. */
    readonly failThreshold: number;
}

export const DEFAULT_TOOL_LOOP_GUARD_CONFIG: ToolLoopGuardConfig = {
    enabled: true,
    refreshThreshold: 3,
    promptThreshold: 4,
    failThreshold: 5
};

/**
 * A user's decision when asked whether the agent should keep retrying a looping tool call.
 * - `continue`: let the agent try again.
 * - `stop`: abort the loop now with a terminal error.
 */
export type LoopContinueDecision = 'continue' | 'stop';

/**
 * How long a {@link LoopContinueDecision} should be remembered, so the user is not asked again.
 * - `once`: applies only to this prompt.
 * - `session`: remembered for the rest of the current chat session.
 * - `forever`: remembered across sessions (persisted).
 */
export type LoopDecisionScope = 'once' | 'session' | 'forever';

/** A {@link LoopContinueDecision} together with how long the user asked us to remember it. */
export interface RememberedLoopDecision {
    readonly decision: LoopContinueDecision;
    readonly scope: LoopDecisionScope;
}

/** Tracks the most recent tool-call outcome per session so consecutive identical failures can be counted. */
interface LoopGuardState {
    /** Signature of the last handled (tool, args, result) triple; `undefined` before the first call. */
    signature?: string;
    /** How many times that exact signature has now occurred in a row. */
    count: number;
    /** Whether a refresh has already been forced for the current run of identical errors. */
    refreshed: boolean;
    /** Whether the user has already been prompted to continue for the current run of identical errors. */
    prompted: boolean;
}

/**
 * Extracts a `path`-like field from a tool argument string, so the guard can target the offending file
 * when forcing a refresh. Returns `undefined` when no such field is present or the args are not JSON.
 */
function extractPathArg(args: string | undefined): string | undefined {
    if (!args) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object' && typeof (parsed as { path?: unknown }).path === 'string') {
            return (parsed as { path: string }).path;
        }
    } catch {
        // not JSON, or no path field
    }
    return undefined;
}

/**
 * Wraps tool requests in a chat context.
 *
 * This service extracts tool requests from a given chat request model and wraps their
 * handler functions to provide additional context, such as the chat request model.
 */
@injectable()
export class ChatToolRequestService {

    /**
     * Optional in the common service: file-state refreshes are the guard's first remedy, but the guard's
     * fail-safe still works without a tracker (e.g. in containers that do not bind one).
     */
    @inject(FileReadTracker) @optional()
    protected readonly fileReadTracker: FileReadTracker | undefined;

    /** Per-session loop-guard state, keyed by the session id the tool call belongs to. */
    protected readonly loopGuardStates = new Map<string, LoopGuardState>();

    /**
     * Extracts tool requests from a chat request and wraps them to provide chat context.
     * @param request The chat request containing tool requests
     * @returns Tool requests with handlers that receive ChatToolContext
     */
    getChatToolRequests(request: MutableChatRequestModel): ToolRequest[] {
        const toolRequests = request.message.toolRequests.size > 0 ? [...request.message.toolRequests.values()] : undefined;
        if (!toolRequests) {
            return [];
        }
        return this.toChatToolRequests(toolRequests, request);
    }

    /**
     * Wraps multiple tool requests to provide chat context to their handlers.
     * @param toolRequests The original tool requests
     * @param request The chat request to use for context
     * @returns Wrapped tool requests whose handlers receive ChatToolContext
     */
    toChatToolRequests(toolRequests: ToolRequest[] | undefined, request: MutableChatRequestModel): ToolRequest[] {
        if (!toolRequests) {
            return [];
        }
        return toolRequests.map(toolRequest => this.toChatToolRequest(toolRequest, request));
    }

    /**
     * Wraps a single tool request to provide chat context to its handler.
     * The returned tool request accepts ToolInvocationContext but internally
     * enriches it to ChatToolContext before passing to the original handler.
     * @param toolRequest The original tool request
     * @param request The chat request to use for context
     * @returns A wrapped tool request
     */
    protected toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ToolRequest {
        return {
            ...toolRequest,
            handler: async (arg_string: string, ctx?: ToolInvocationContext) =>
                this.invokeWithLoopGuard(toolRequest, arg_string, request,
                    () => toolRequest.handler(arg_string, this.createToolContext(request, ctx)))
        };
    }

    /**
     * The session key the loop guard counts against. Uses the root session so that delegated sub-sessions
     * of the same conversation share a counter, matching how confirmations are keyed.
     */
    protected loopGuardSessionKey(request: MutableChatRequestModel): string {
        return request.session.rootSessionId ?? request.session.id;
    }

    /**
     * Resolves the loop-guard configuration for a request. The common service has no access to the
     * preference API, so it returns the defaults; the frontend service overrides this to read preferences.
     */
    protected getLoopGuardConfig(_request: MutableChatRequestModel): ToolLoopGuardConfig {
        return DEFAULT_TOOL_LOOP_GUARD_CONFIG;
    }

    /**
     * Runs the actual tool invocation under the two-stage loop guard.
     *
     * When the same tool is called with the same arguments and returns the same error N times in a row:
     * - at the refresh threshold, the {@link FileReadTracker} is asked which of the targeted (or whole
     *   session's) files are still stale, and the agent is told to actually re-read them. The tracked state is
     *   deliberately left protected (not silently re-snapshotted), so a stubborn agent that ignores the advice
     *   cannot overwrite the user's edits with a repeated stale write; a genuine re-read is what clears it.
     * - at the prompt threshold, the user is asked whether the agent should keep retrying (see
     *   {@link promptContinueOnLoop}). If the user stops the loop, a terminal error is returned; the decision
     *   can be remembered for the session or permanently so the user is not asked again.
     * - at the fail threshold, a terminal `tool-loop-detected` error is returned. This is only a hint for the
     *   language model's tool loop to stop re-prompting; nothing is broken or cancelled programmatically, so a
     *   provider that chooses to keep going still can.
     *
     * A different tool, different arguments, or a successful/changed result resets the counter.
     */
    protected async invokeWithLoopGuard(
        toolRequest: ToolRequest,
        arg_string: string,
        request: MutableChatRequestModel,
        invoke: () => Promise<ToolCallResult>
    ): Promise<ToolCallResult> {
        const config = this.getLoopGuardConfig(request);
        if (!config.enabled) {
            return invoke();
        }

        const result = await this.invokeCatchingRejection(toolRequest, invoke);
        if (!this.isErrorResult(result)) {
            // A non-error outcome breaks any ongoing run of identical failures.
            this.loopGuardStates.delete(this.loopGuardSessionKey(request));
            return result;
        }

        const sessionKey = this.loopGuardSessionKey(request);
        const signature = this.signatureOf(toolRequest, arg_string, result);
        const state = this.loopGuardStates.get(sessionKey);
        if (!state || state.signature !== signature) {
            // First time we see this exact failure: start counting at 1 but still evaluate the thresholds below,
            // so a refreshThreshold of 1 triggers immediately instead of being skipped by an early return.
            this.loopGuardStates.set(sessionKey, { signature, count: 1, refreshed: false, prompted: false });
        } else {
            state.count++;
        }
        const current = this.loopGuardStates.get(sessionKey)!;

        if (current.count >= config.failThreshold) {
            // The refresh advice did not break the loop (or there was nothing to refresh): hint the tool loop to
            // stop. This only returns an error result; it does not cancel the request or block further calls.
            this.loopGuardStates.delete(sessionKey);
            return createToolCallError(
                `This is only a hint to stop; nothing has been cancelled. Tool '${toolRequest.name ?? toolRequest.id}' returned the same ` +
                `error ${current.count} times in a row and the loop could not be broken. Stop retrying this call; re-read the relevant ` +
                `files, reconsider the approach, or ask the user for guidance. Last error was: ${formatToolCallContentForModel(result)}\n\n` +
                this.buildLoopBreakingHints(),
                'tool-loop-detected'
            );
        }

        if (current.count >= config.refreshThreshold && !current.refreshed) {
            current.refreshed = true;
            const stale = await this.forceFileRefresh(request, arg_string);
            const staleNote = stale.length
                ? ` These files are still out of sync with what you last read: ${stale.join(', ')}.`
                : '';
            return createToolCallError(
                `This is attempt ${current.count} with the same arguments and the same error.${staleNote} ` +
                'Read the affected file(s) again to get their current content before retrying — the stale-file protection stays in ' +
                'place until you actually re-read, so repeating the identical write will keep failing. Change your approach if the ' +
                'error persists. Original error: ' +
                formatToolCallContentForModel(result),
                'tool-loop-detected'
            );
        }

        if (config.promptThreshold > 0 && current.count >= config.promptThreshold && !current.prompted) {
            // Only ask once per run of identical errors; the agent gets one more chance either way.
            current.prompted = true;
            const decision = await this.promptContinueOnLoop(request, toolRequest, current.count, result);
            if (decision === 'stop') {
                this.loopGuardStates.delete(sessionKey);
                return createToolCallError(
                    `Stopped at your request. Tool '${toolRequest.name ?? toolRequest.id}' returned the same error ${current.count} times in a ` +
                    'row and you chose to stop retrying it. Do not call this tool again with these arguments; reconsider the approach or ask ' +
                    `the user how to proceed. Last error was: ${formatToolCallContentForModel(result)}`,
                    'tool-loop-detected'
                );
            }
            // The user chose to continue: surface the original error unchanged and let the agent try again.
            return result;
        }

        return result;
    }

    /**
     * Invokes the tool handler, converting a rejection into a {@link ToolCallResult} error instead of letting
     * it propagate. This has two benefits: the loop guard can count a consistently-rejecting tool the same way
     * it counts a tool that returns an error result, and the language model is handed a concrete error message
     * even when the tool rejects with nothing useful (e.g. `throw undefined` or an `Error` with an empty
     * message), so it has something to react to instead of an opaque failure.
     */
    protected async invokeCatchingRejection(toolRequest: ToolRequest, invoke: () => Promise<ToolCallResult>): Promise<ToolCallResult> {
        try {
            return await invoke();
        } catch (error) {
            const toolName = toolRequest.name ?? toolRequest.id;
            const message = this.describeRejection(error);
            return createToolCallError(`Tool '${toolName}' failed: ${message}`);
        }
    }

    /**
     * Produces a human-readable description of a tool rejection reason, falling back to a generic message when
     * the tool rejected without one (e.g. `undefined`, an empty string, or an `Error` with an empty message),
     * so the model always has something actionable to work with.
     */
    protected describeRejection(error: unknown): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        if (typeof error === 'string' && error.length > 0) {
            return error;
        }
        if (error) {
            try {
                const serialized = JSON.stringify(error);
                if (serialized && serialized !== '{}' && serialized !== 'null') {
                    return serialized;
                }
            } catch {
                // fall through to the generic message
            }
        }
        return 'the tool rejected without providing an error message.';
    }

    /**
     * Asks the user whether the agent should keep retrying a looping tool call. The common service has no
     * access to a UI, so it defaults to `continue`; the frontend service overrides this to show a
     * "it looks like you're repeating, continue?" confirmation with a remember-my-decision option.
     *
     * @param request the chat request the looping tool call belongs to
     * @param toolRequest the tool being repeatedly called
     * @param count how many times the identical error has now occurred in a row
     * @param result the repeated error result
     */
    protected async promptContinueOnLoop(
        _request: MutableChatRequestModel,
        _toolRequest: ToolRequest,
        _count: number,
        _result: ToolCallResult
    ): Promise<LoopContinueDecision> {
        return 'continue';
    }

    /**
     * Actionable tips shown when a tool call loop could not be broken. Repeated identical failures in an
     * agentic loop are usually one of: a genuinely impossible operation, a mismatch between what the agent
     * believes and the real state, or a model that keeps sampling the same unhelpful continuation. The tips
     * cover both what the agent should do differently and what the user can change in their setup — including
     * the local-model temperature / context-size levers, which the agent cannot change on its own.
     */
    protected buildLoopBreakingHints(): string {
        return [
            'Tips to break the loop:',
            '- Do not repeat the identical call. Change the arguments, use a different tool, or split the task into smaller steps.',
            '- Verify assumptions against reality: re-read the file, list the directory, or run the failing command to see the current state instead of relying on earlier output.',
            '- If the operation is genuinely impossible or a prerequisite is missing, stop and report that to the user rather than retrying.',
            '- If you are running a local model (e.g. via Ollama or llama.cpp), the loop is often the model getting stuck on one sampling path. ' +
            'Raising the model temperature slightly increases variety and can break the repetition, and increasing the context size (if the ' +
            'model and hardware allow) lets it keep more of the conversation and tool output in view, which reduces state mismatches.',
            '- Consider switching to a more capable model for this step, or reducing the amount of context/tools offered so the model is less likely to fixate.',
            '- As a last resort, ask the user to intervene: they may need to fix the environment, adjust the request, or take the action manually.'
        ].join('\n');
    }
    protected isErrorResult(result: ToolCallResult): boolean {
        if (hasToolCallError(result)) {
            return true;
        }
        // Several tools return their failures as a JSON string like `{"error": "..."}` (see the file changeset tools).
        if (typeof result === 'string') {
            try {
                const parsed = JSON.parse(result);
                return !!parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string';
            } catch {
                return false;
            }
        }
        return false;
    }

    /** A stable signature of a (tool, args, result) triple used to detect identical repeated failures. */
    protected signatureOf(toolRequest: ToolRequest, arg_string: string, result: ToolCallResult): string {
        return JSON.stringify({
            id: toolRequest.id,
            args: normalizeToolArgs(arg_string),
            result: formatToolCallContentForModel(result)
        });
    }

    /**
     * Asks the {@link FileReadTracker} which of the session's files are still stale, targeting the file named by
     * the tool's `path` argument when present, otherwise the whole session. Does not clear the stale protection;
     * see {@link FileReadTracker.forceRefresh}.
     */
    protected async forceFileRefresh(request: MutableChatRequestModel, arg_string: string): Promise<string[]> {
        if (!this.fileReadTracker) {
            return [];
        }
        const sessionId = request.session.id;
        const path = extractPathArg(arg_string);
        try {
            const uri = path ? await this.resolveRefreshUri(request, path) : undefined;
            return await this.fileReadTracker.forceRefresh(sessionId, uri);
        } catch {
            // A path we cannot resolve just means a whole-session refresh; never let this throw into the tool loop.
            return this.fileReadTracker.forceRefresh(sessionId);
        }
    }

    /**
     * Resolves a tool `path` argument to the URI the {@link FileReadTracker} tracks. The common service cannot
     * resolve workspace-relative paths, so it only handles absolute / URI forms; the frontend service overrides
     * this to use the workspace scope. Returns `undefined` to fall back to a whole-session refresh.
     */
    protected async resolveRefreshUri(_request: MutableChatRequestModel, path: string): Promise<URI | undefined> {
        if (path.includes('://') || path.startsWith('/')) {
            return new URI(path.includes('://') ? path : `file://${path}`);
        }
        return undefined;
    }

    /**
     * Creates a ChatToolContext by enriching a ToolInvocationContext with chat-specific data.
     * @param request The chat request providing context
     * @param ctx The base tool invocation context
     * @returns A ChatToolContext with request, response, and cancellation token
     */
    protected createToolContext(request: MutableChatRequestModel, ctx?: ToolInvocationContext): ChatToolContext {
        return {
            request,
            toolCallId: ctx?.toolCallId,
            cancellationToken: request.response.cancellationToken,
            rootSessionId: request.session.rootSessionId,
            get response(): MutableChatResponseModel {
                return request.response;
            }
        };
    }

}
