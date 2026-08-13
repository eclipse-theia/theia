// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
    formatToolCallContentForModel,
    LanguageModel,
    LanguageModelResponse,
    LanguageModelStatus,
    LanguageModelStreamResponsePart,
    ToolRequest,
    UserRequest
} from '@theia/ai-core';
import { CancellationToken, ILogger } from '@theia/core';
import type { CopilotClient, CopilotSession, PermissionHandler, Tool } from './copilot-sdk-types';
import { buildSdkPrompt, buildSdkSystemMessage } from './copilot-sdk-mappers';

/**
 * Answers the permission requests of the CLI for the tools of a request.
 *
 * Only Theia's own tools are declared to the CLI, and those are gated by Theia's tool confirmation
 * already, so a second confirmation by the CLI would ask the user the same question twice. This is
 * the behaviour of the SDK's own `approveAll`, which cannot be used here because it is not imported
 * at runtime.
 *
 * A request that managed policy reserves for an explicit decision is not approved on the user's
 * behalf but denied as unconfirmable. Leaving it unanswered is what the SDK's `no-result` does, and
 * it is only correct when another client is connected that can answer it; here it would leave the
 * turn pending until the request is cancelled.
 */
export const approveTheiaTools: PermissionHandler = (request, invocation) => {
    if (invocation.managedSettingsEnabled || ('managedApprovalRequired' in request && request.managedApprovalRequired)) {
        return { kind: 'user-not-available' };
    }
    return { kind: 'approve-once' };
};

/**
 * Upper bound for awaiting that a reported tool call has been consumed before the tool is run.
 */
const TOOL_CALL_FLUSH_TIMEOUT_MS = 2000;

/**
 * Collects the stream parts produced by the session events and by the tool handlers, and hands them
 * to the consuming generator as they arrive.
 *
 * A buffer is needed because the parts originate from callbacks rather than from a stream we can
 * await, and because the tool handlers of a turn run while its response is still being produced.
 */
export class CopilotStreamSink {

    protected readonly queue: LanguageModelStreamResponsePart[] = [];
    protected readonly flushWaiters: Array<() => void> = [];
    protected notify: (() => void) | undefined;
    protected done = false;
    protected failure: unknown;

    push(part: LanguageModelStreamResponsePart): void {
        this.queue.push(part);
        this.wake();
    }

    /**
     * Resolves once everything pushed so far has been taken by the consumer.
     *
     * Needed because a tool call has to be reported before the tool runs: the caller creates the
     * record of the call from the stream, and the tool handler then completes that record. Handing the
     * part over and invoking the handler in the same turn would leave the handler with nothing to
     * complete.
     */
    flush(): Promise<void> {
        if (this.queue.length === 0 || this.done) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => this.flushWaiters.push(resolve));
    }

    /**
     * Ends the stream. A given error is raised to the consumer once the buffered parts are drained.
     */
    finish(error?: unknown): void {
        if (error !== undefined) {
            this.failure = error;
        }
        this.done = true;
        this.wake();
    }

    async *drain(): AsyncIterable<LanguageModelStreamResponsePart> {
        while (true) {
            while (this.queue.length > 0) {
                yield this.queue.shift()!;
            }
            // Asking for the next part means the consumer is done with the previous ones.
            this.releaseFlushWaiters();
            if (this.done) {
                break;
            }
            await new Promise<void>(resolve => { this.notify = resolve; });
        }
        this.releaseFlushWaiters();
        if (this.failure !== undefined) {
            throw this.failure;
        }
    }

    protected wake(): void {
        const resolve = this.notify;
        this.notify = undefined;
        resolve?.();
    }

    protected releaseFlushWaiters(): void {
        const waiters = this.flushWaiters.splice(0, this.flushWaiters.length);
        for (const resolve of waiters) {
            resolve();
        }
    }
}

/**
 * Language model implementation for GitHub Copilot backed by the official Copilot
 * CLI via `@github/copilot-sdk`.
 *
 * The CLI is an agent that owns the tool-calling loop, whereas Theia's language model contract
 * expects the caller to drive it. The two are reconciled by handing the tools of the request to the
 * CLI as custom tools whose handlers delegate back to Theia, and by reporting every invocation as a
 * tool call part, so that the conversation and its tool calls are recorded and rendered as usual.
 * None of the CLI's own tools are exposed, so only what Theia provides can run.
 *
 * Structured output is not supported on this path.
 */
export class CopilotSdkLanguageModel implements LanguageModel {

    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public maxRetries: number,
        protected readonly clientProvider: () => Promise<CopilotClient>,
        protected readonly logger: ILogger,
    ) { }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        const client = await this.clientProvider();
        const { systemText, prompt } = buildSdkPrompt(request.messages);
        const sink = new CopilotStreamSink();

        const tools = this.createTools(request.tools ?? [], sink);
        this.logger.debug(`Copilot: request with ${tools.length} tools [${tools.map(tool => tool.name).join(', ')}]`);

        const session = await client.createSession({
            model: this.model,
            streaming: true,
            tools,
            // The prompt of the Theia agent belongs into the system message of the session rather than
            // into its user prompt, so that it takes the place of the agent instructions of the CLI.
            systemMessage: buildSdkSystemMessage(systemText),
            // Enable exactly the tools declared above and nothing else: `custom:*` matches the tools of
            // this request, while the built-in tools of the CLI and any MCP tools stay disabled, so that
            // Theia remains in control of what runs on the host. An empty list would match nothing and
            // would disable the declared tools as well.
            availableTools: ['custom:*'],
            // The declared tools are Theia's own and are already gated by its tool confirmation.
            onPermissionRequest: approveTheiaTools
        });

        return { stream: this.streamResponse(client, session, prompt, sink, cancellationToken) };
    }

    /**
     * Maps the tools of the request onto tools of the CLI, reporting each invocation to the stream.
     */
    protected createTools(tools: ToolRequest[], sink: CopilotStreamSink): Tool[] {
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as unknown as Record<string, unknown>,
            // Theia confirms tool invocations itself, so the CLI must not prompt on top of that.
            skipPermission: true,
            handler: async (args: unknown, invocation: { toolCallId: string }) => {
                // Theia's tool handlers take the raw argument string of the model.
                const argumentsString = JSON.stringify(args ?? {});
                sink.push({
                    tool_calls: [{ id: invocation.toolCallId, function: { name: tool.name, arguments: argumentsString }, finished: false }]
                });
                // The handler completes the record of the call that the caller creates from the part
                // above, so the part has to be consumed before the tool runs. The wait is bounded so
                // that a consumer which stops reading cannot hold the tool call forever.
                await Promise.race([sink.flush(), this.delay(TOOL_CALL_FLUSH_TIMEOUT_MS)]);
                try {
                    // Passing the call id lets the caller correlate the invocation with the part above,
                    // instead of having to fall back to matching on the tool name and its arguments.
                    const result = await tool.handler(argumentsString, { toolCallId: invocation.toolCallId });
                    // The structured result is kept for the stream, so that the UI can render e.g. the
                    // HTML of an MCP app, while the model is handed a readable serialization of it.
                    sink.push({
                        tool_calls: [{ id: invocation.toolCallId, function: { name: tool.name, arguments: argumentsString }, finished: true, result }]
                    });
                    return formatToolCallContentForModel(result);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    sink.push({
                        tool_calls: [{
                            id: invocation.toolCallId,
                            function: { name: tool.name, arguments: argumentsString },
                            finished: true,
                            result: `Error: ${message}`
                        }]
                    });
                    // Report the failure to the agent instead of failing the turn, so that it can react.
                    return { error: message };
                }
            }
        }));
    }

    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    protected async *streamResponse(
        client: CopilotClient,
        session: CopilotSession,
        prompt: string,
        sink: CopilotStreamSink,
        cancellationToken?: CancellationToken
    ): AsyncIterable<LanguageModelStreamResponsePart> {
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;

        const disposables: Array<() => void> = [];
        disposables.push(session.on('assistant.message_delta', event => {
            if (event.data.deltaContent) {
                sink.push({ content: event.data.deltaContent });
            }
        }));
        disposables.push(session.on('assistant.reasoning_delta', event => {
            if (event.data.deltaContent) {
                sink.push({ thought: event.data.deltaContent, signature: '' });
            }
        }));
        disposables.push(session.on('assistant.message', event => {
            if (typeof event.data.outputTokens === 'number') {
                outputTokens = event.data.outputTokens;
            }
        }));
        disposables.push(session.on('assistant.usage', event => {
            if (typeof event.data.inputTokens === 'number') {
                inputTokens = event.data.inputTokens;
            }
            if (typeof event.data.outputTokens === 'number') {
                outputTokens = event.data.outputTokens;
            }
        }));
        disposables.push(session.on('session.idle', () => sink.finish()));
        disposables.push(session.on('session.error', event => {
            // The CLI can report a terminal error (auth, quota, rate limit, context
            // limit, ...) without a following `session.idle`. Surface it as a stream
            // failure so the request rejects instead of hanging forever.
            const data = event.data;
            const detail = data.statusCode !== undefined ? ` (${data.errorType}, status ${data.statusCode})` : ` (${data.errorType})`;
            const error = new Error(`Copilot request failed${detail}: ${data.message}`);
            if (data.stack) {
                error.stack = data.stack;
            }
            sink.finish(error);
        }));

        const cancelListener = cancellationToken?.onCancellationRequested(() => {
            session.abort().catch(() => { /* ignore abort failures */ });
            sink.finish();
        });

        try {
            if (cancellationToken?.isCancellationRequested) {
                // Already cancelled before we started: don't bother sending.
                await session.abort().catch(() => { /* ignore abort failures */ });
                sink.finish();
            } else {
                // Deliberately not awaited: the turn only completes after the tool loop has run, and
                // its parts have to be yielded while that happens.
                session.send({ prompt }).catch(error => sink.finish(error));
            }
            yield* sink.drain();
            if (inputTokens !== undefined || outputTokens !== undefined) {
                yield { input_tokens: inputTokens ?? 0, output_tokens: outputTokens ?? 0 };
            }
        } finally {
            for (const dispose of disposables) {
                dispose();
            }
            cancelListener?.dispose();
            await this.discardSession(client, session);
        }
    }

    /**
     * Ends the session of a request and removes what it persisted.
     *
     * Disconnecting only releases the session in memory and keeps it stored for a later resumption,
     * which Theia never does: it drives the conversation itself and starts a fresh session per
     * request. Without the deletion, every request would leave a session behind in the Copilot home.
     */
    protected async discardSession(client: CopilotClient, session: CopilotSession): Promise<void> {
        try {
            await session.disconnect();
        } catch (error) {
            this.logger.warn('Copilot SDK: failed to disconnect session:', error);
        }
        try {
            await client.deleteSession(session.sessionId);
        } catch (error) {
            this.logger.warn(`Copilot SDK: failed to delete session ${session.sessionId}:`, error);
        }
    }
}
