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
import { MutableChatRequestModel, MutableChatResponseModel } from './chat-model';
import { FileReadTracker } from './file-read-tracker';

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
    /** Consecutive identical errors after which the request is failed. Must exceed {@link refreshThreshold}. */
    readonly failThreshold: number;
}

export const DEFAULT_TOOL_LOOP_GUARD_CONFIG: ToolLoopGuardConfig = {
    enabled: true,
    refreshThreshold: 3,
    failThreshold: 5
};

/** Tracks the most recent tool-call outcome per session so consecutive identical failures can be counted. */
interface LoopGuardState {
    /** Signature of the last handled (tool, args, result) triple; `undefined` before the first call. */
    signature?: string;
    /** How many times that exact signature has now occurred in a row. */
    count: number;
    /** Whether a refresh has already been forced for the current run of identical errors. */
    refreshed: boolean;
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
     * - at the refresh threshold, the {@link FileReadTracker} is asked to re-snapshot the targeted (or whole
     *   session's) file state, so a stale "file changed since you last read it" guard stops firing;
     * - at the fail threshold, a terminal `tool-loop-detected` error is returned so the provider's tool loop
     *   stops re-prompting and the request ends instead of spinning forever.
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

        const result = await invoke();
        if (!this.isErrorResult(result)) {
            // A non-error outcome breaks any ongoing run of identical failures.
            this.loopGuardStates.delete(this.loopGuardSessionKey(request));
            return result;
        }

        const sessionKey = this.loopGuardSessionKey(request);
        const signature = this.signatureOf(toolRequest, arg_string, result);
        const state = this.loopGuardStates.get(sessionKey);
        if (!state || state.signature !== signature) {
            this.loopGuardStates.set(sessionKey, { signature, count: 1, refreshed: false });
            return result;
        }

        state.count++;

        if (state.count >= config.failThreshold) {
            // The refresh did not break the loop (or there was nothing to refresh): stop the tool loop.
            this.loopGuardStates.delete(sessionKey);
            return createToolCallError(
                `Aborting: tool '${toolRequest.name ?? toolRequest.id}' returned the same error ${state.count} times in a row and the ` +
                'loop could not be broken by refreshing file state. Stop retrying this call; re-read the relevant files, reconsider the ' +
                `approach, or ask the user for guidance. Last error was: ${formatToolCallContentForModel(result)}\n\n` +
                this.buildLoopBreakingHints(),
                'tool-loop-detected'
            );
        }

        if (state.count >= config.refreshThreshold && !state.refreshed) {
            state.refreshed = true;
            const refreshed = await this.forceFileRefresh(request, arg_string);
            const refreshedNote = refreshed.length
                ? ` I refreshed the tracked state of: ${refreshed.join(', ')}.`
                : '';
            return createToolCallError(
                `This is attempt ${state.count} with the same arguments and the same error.${refreshedNote} ` +
                'The file state has been refreshed, so read the file again to get its current content before retrying, ' +
                'and change your approach if the error persists. Original error: ' +
                formatToolCallContentForModel(result),
                'tool-loop-detected'
            );
        }

        return result;
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
     * Forces the {@link FileReadTracker} to re-snapshot file state so a stale-file guard stops firing.
     * Targets the file named by the tool's `path` argument when present, otherwise the whole session.
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
