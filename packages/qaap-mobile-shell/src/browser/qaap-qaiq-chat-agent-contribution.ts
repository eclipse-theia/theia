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
const POLL_INTERVAL_MS = 400;
const WAIT_TIMEOUT_MS = 90_000;

interface QaapAgentTaskDetail {
    readonly id: string;
    readonly state?: string;
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
            let logOffset = 0;
            const started = Date.now();
            while (Date.now() - started < WAIT_TIMEOUT_MS) {
                if (request.response.cancellationToken.isCancellationRequested) {
                    await this.cancelTask(task.id);
                    break;
                }
                const detail = await this.fetchTaskDetail(task.id);
                if (!detail) {
                    break;
                }
                const log = detail.log ?? '';
                if (log.length > logOffset) {
                    accumulator.push(log.slice(logOffset));
                    logOffset = log.length;
                    sync.apply(accumulator);
                }
                const state = detail.state ?? 'running';
                if (state !== 'running') {
                    if (accumulator.getSegments().length === 0 && log.trim()) {
                        request.response.response.addContent(new MarkdownChatResponseContentImpl(this.logTail(log, 4000)));
                    }
                    if (state === 'failed') {
                        request.response.response.addContent(new ErrorChatResponseContentImpl(
                            new Error(`QAIQ task ${state}.`)
                        ));
                    }
                    request.response.complete();
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
            if (accumulator.getSegments().length === 0) {
                request.response.response.addContent(new MarkdownChatResponseContentImpl(
                    'Still running in background. Track it in **Jobs / Background tasks**.'
                ));
            }
            request.response.complete();
        } catch (error) {
            request.response.response.addContent(new ErrorChatResponseContentImpl(error));
            request.response.error(error);
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

    protected async fetchTaskDetail(taskId: string): Promise<QaapAgentTaskDetail | undefined> {
        const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(taskId)}`, { credentials: 'include' });
        if (!response.ok) {
            return undefined;
        }
        return response.json() as Promise<QaapAgentTaskDetail>;
    }

    protected async cancelTask(taskId: string): Promise<void> {
        await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(taskId)}/cancel`, {
            method: 'POST',
            credentials: 'include',
        });
    }

    protected logTail(log: string, maxChars: number): string {
        const text = log.trim();
        if (!text) {
            return '';
        }
        if (text.length <= maxChars) {
            return text;
        }
        return `...(truncated)\n${text.slice(-maxChars)}`;
    }
}
