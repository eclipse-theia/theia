// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { injectable, inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl, MutableChatRequestModel } from '@theia/ai-chat/lib/common/chat-model';
import { Agent, AgentService } from '@theia/ai-core';
import { QAAP_AGENT_TASK_API_PATH } from '../common/qaap-agent-task-client';
import { applyBackendInteractionModeToPrompt, QAAP_BACKEND_INTERACTION_MODES } from '../common/qaap-sticky-composer-mode';
import { QaapQaiqStreamAccumulator } from '../common/qaap-qaiq-stream';
import { QaapQaiqChatStreamSync } from './qaap-qaiq-chat-stream-sync';

const QAIQ_CHAT_AGENT_ID = 'qaiq';
/** Max time to wait for the task to complete before resolving with a "still running" message. */
const STREAM_TIMEOUT_MS = 90_000;
/** Delay before re-checking task state after an SSE disconnect, giving the browser time to reconnect. */
const RECONNECT_CHECK_DELAY_MS = 2_000;

interface QaapTaskSsePayload {
    readonly id: string;
    readonly state?: string;
    /** Present only on `output` events. */
    readonly chunk?: string;
}

interface QaapTaskDetail {
    readonly id: string;
    readonly state: string;
    readonly log?: string;
}

@injectable()
export class QaapQaiqChatAgentContribution implements FrontendApplicationContribution {

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected registered = false;
    /** Shared SSE connection reused across concurrent task streams. */
    protected sharedSource: EventSource | undefined;
    /** Number of active streamTask() calls currently listening on sharedSource. */
    protected activeStreamCount = 0;

    onStart(): void {
        if (this.registered) {
            return;
        }
        this.agentService.registerAgent(this.createAgentDescriptor());
        this.chatAgentService.registerChatAgent(this.createAgent());
        this.registered = true;
    }

    onStop(): void {
        if (!this.registered) {
            return;
        }
        this.chatAgentService.unregisterChatAgent(QAIQ_CHAT_AGENT_ID);
        this.agentService.unregisterAgent(QAIQ_CHAT_AGENT_ID);
        this.registered = false;
        this.sharedSource?.close();
        this.sharedSource = undefined;
        this.activeStreamCount = 0;
    }

    protected createAgentDescriptor(): Agent {
        return {
            id: QAIQ_CHAT_AGENT_ID,
            name: QAIQ_CHAT_AGENT_ID,
            description: 'Runs prompts via QAIQ background tasks with live tool/thinking output.',
            variables: [],
            prompts: [],
            languageModelRequirements: [],
            agentSpecificVariables: [],
            functions: [],
            tags: ['Chat', 'QAAP'],
        };
    }

    protected createAgent(): ChatAgent {
        return {
            id: QAIQ_CHAT_AGENT_ID,
            name: QAIQ_CHAT_AGENT_ID,
            description: 'Runs the prompt as a QAAP background task using the QAIQ runner and streams thinking, tools, and replies into chat.',
            variables: [],
            prompts: [],
            languageModelRequirements: [],
            agentSpecificVariables: [],
            functions: [],
            tags: ['Chat', 'QAAP'],
            locations: [ChatAgentLocation.Panel],
            iconClass: 'codicon codicon-server-process',
            modes: [...QAAP_BACKEND_INTERACTION_MODES],
            invoke: request => this.invoke(request),
        };
    }

    protected async invoke(request: MutableChatRequestModel): Promise<void> {
        const raw = this.stripMention(request.request.text);
        const prompt = applyBackendInteractionModeToPrompt(raw, request.request.modeId);
        if (!prompt) {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
                'Please provide a prompt after `@qaiq`.'
            ));
            request.response.complete();
            return;
        }
        const roots = await this.workspaceService.roots;
        const cwd = roots[0]?.resource.path.toString();
        if (!cwd) {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
                'No workspace root is open. Open a workspace/folder and retry.'
            ));
            request.response.complete();
            return;
        }
        try {
            const task = await this.startTask(prompt, cwd);
            const accumulator = new QaapQaiqStreamAccumulator();
            const sync = new QaapQaiqChatStreamSync(request);
            await this.streamTask(task.id, accumulator, sync, request);
        } catch (error) {
            request.response.response.addContent(new ErrorChatResponseContentImpl(error));
            request.response.error(error);
        }
    }

    /**
     * Subscribes to the `/stream` SSE feed and drives the chat response in real time.
     * Resolves once the task reaches a terminal state, is cancelled by the user, or times out.
     *
     * Two correctness hazards are handled here:
     * - Race condition: the task may finish between `startTask()` and the SSE connection
     *   being established. The `open` handler fires a one-time state check.
     * - Disconnect: if the SSE connection drops, the `completed` event may be missed.
     *   The `error` handler schedules a delayed state check after each disconnect so the
     *   response resolves correctly instead of hanging until the 90s timeout.
     */
    /**
     * Subscribes to the `/stream` SSE feed and drives the chat response in real time.
     * Resolves once the task reaches a terminal state, is cancelled by the user, or times out.
     *
     * Two correctness hazards are handled here:
     * - Race condition: the task may finish between `startTask()` and the SSE connection
     *   being established. The `open` handler fires a one-time state check.
     * - Disconnect: if the SSE connection drops, the `completed` event may be missed.
     *   The `error` handler schedules a delayed state check after each disconnect so the
     *   response resolves correctly instead of hanging until the 90s timeout.
     */
    protected streamTask(
        taskId: string,
        accumulator: QaapQaiqStreamAccumulator,
        sync: QaapQaiqChatStreamSync,
        request: MutableChatRequestModel,
    ): Promise<void> {
        return new Promise<void>(resolve => {
            let done = false;
            /** Tracks how many bytes of the task log have already been pushed to the accumulator. */
            let logOffset = 0;

            const source = this.acquireSource();
            if (!source) {
                request.response.response.addContent(new ErrorChatResponseContentImpl(
                    new Error('SSE not available.')
                ));
                request.response.complete();
                resolve();
                return;
            }

            /**
             * Fetches the current task detail and applies any log bytes that have not yet
             * been pushed to the accumulator (missed SSE output chunks). Calls finish() if
             * the task has already reached a terminal state.
             */
            const checkTaskState = async (): Promise<void> => {
                if (done) {
                    return;
                }
                try {
                    const detail = await this.fetchTaskDetail(taskId);
                    if (!detail || done) {
                        return;
                    }
                    const log = detail.log ?? '';
                    if (log.length > logOffset) {
                        accumulator.push(log.slice(logOffset));
                        logOffset = log.length;
                        sync.apply(accumulator);
                    }
                    if (detail.state !== 'running') {
                        finish(detail.state);
                    }
                } catch {
                    /* fetch failure — let timeout handle it */
                }
            };

            const outputHandler = (ev: Event): void => {
                if (done) {
                    return;
                }
                try {
                    const data = JSON.parse((ev as MessageEvent).data) as QaapTaskSsePayload;
                    if (data.id !== taskId || !data.chunk) {
                        return;
                    }
                    accumulator.push(data.chunk);
                    logOffset += data.chunk.length;
                    sync.apply(accumulator);
                } catch {
                    /* malformed payload */
                }
            };

            const stateHandler = (ev: Event): void => {
                try {
                    const data = JSON.parse((ev as MessageEvent).data) as QaapTaskSsePayload;
                    if (data.id !== taskId) {
                        return;
                    }
                    finish(data.state ?? 'completed');
                } catch {
                    /* malformed payload */
                }
            };

            const errorHandler = (): void => {
                setTimeout(() => void checkTaskState(), RECONNECT_CHECK_DELAY_MS);
            };

            const openHandler = (): void => void checkTaskState();

            const cleanup = (): void => {
                source.removeEventListener('open', openHandler);
                source.removeEventListener('output', outputHandler);
                source.removeEventListener('completed', stateHandler);
                source.removeEventListener('cancelled', stateHandler);
                source.removeEventListener('error', errorHandler);
                this.releaseSource();
            };

            const finish = (state: string): void => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timeoutHandle);
                cancelListener.dispose();
                cleanup();
                if (state === 'failed') {
                    request.response.response.addContent(new ErrorChatResponseContentImpl(
                        new Error('QAIQ task failed.')
                    ));
                } else if (accumulator.getSegments().length === 0) {
                    request.response.response.addContent(new MarkdownChatResponseContentImpl(
                        'Still running in background. Track it in **Jobs / Background tasks**.'
                    ));
                }
                request.response.complete();
                resolve();
            };

            const timeoutHandle = setTimeout(() => finish('timeout'), STREAM_TIMEOUT_MS);

            const cancelListener = request.response.cancellationToken.onCancellationRequested(() => {
                void this.cancelTask(taskId).finally(() => finish('cancelled'));
            });

            source.addEventListener('output', outputHandler);
            source.addEventListener('completed', stateHandler);
            source.addEventListener('cancelled', stateHandler);
            // Disconnect guard: after the browser auto-reconnects, verify task state in case
            // the terminal event was emitted while the connection was down.
            source.addEventListener('error', errorHandler);

            // Race-condition guard: if the source is already open, check once immediately;
            // otherwise wait for the open event.
            if (source.readyState === EventSource.OPEN) {
                void checkTaskState();
            } else {
                source.addEventListener('open', openHandler);
            }
        });
    }

    /** Returns the shared EventSource, creating it if needed. Returns undefined if unavailable. */
    protected acquireSource(): EventSource | undefined {
        if (typeof EventSource === 'undefined') {
            return undefined;
        }
        if (!this.sharedSource || this.sharedSource.readyState === EventSource.CLOSED) {
            try {
                this.sharedSource = new EventSource(`${QAAP_AGENT_TASK_API_PATH}/stream`);
            } catch {
                return undefined;
            }
        }
        this.activeStreamCount++;
        return this.sharedSource;
    }

    /** Releases one stream's hold on the shared EventSource. Closes it when no streams remain. */
    protected releaseSource(): void {
        this.activeStreamCount = Math.max(0, this.activeStreamCount - 1);
        if (this.activeStreamCount === 0) {
            this.sharedSource?.close();
            this.sharedSource = undefined;
        }
    }

    protected stripMention(text: string): string {
        return text.replace(/^@qaiq\b\s*/i, '').trim();
    }

    protected async startTask(prompt: string, cwd: string): Promise<{ id: string }> {
        const response = await fetch(QAAP_AGENT_TASK_API_PATH, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, agent: QAIQ_CHAT_AGENT_ID, cwd }),
        });
        if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || `QAIQ task start failed (${response.status}).`);
        }
        return response.json() as Promise<{ id: string }>;
    }

    protected async fetchTaskDetail(taskId: string): Promise<QaapTaskDetail | undefined> {
        const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(taskId)}`, { credentials: 'include' });
        if (!response.ok) {
            return undefined;
        }
        return response.json() as Promise<QaapTaskDetail>;
    }

    protected async cancelTask(taskId: string): Promise<void> {
        await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(taskId)}/cancel`, {
            method: 'POST',
            credentials: 'include',
        });
    }
}
