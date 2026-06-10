// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    type QaapAgentApprovalActionResponse,
    type QaapAgentApprovalRequest,
    extractPendingPromptApproval,
    extractPendingToolApprovals,
} from '../common/qaap-agent-approval';
import { QaapAgentConversationStore } from './qaap-agent-conversation-store';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';

interface ParsedApprovalId {
    readonly conversationId: string;
    readonly kind: 'tool' | 'prompt';
    readonly taskId?: string;
    readonly toolUseId?: string;
}

/** Aggregates pending VPS permission prompts from conversations and task logs. */
@injectable()
export class QaapAgentApprovalStore {

    @inject(QaapAgentConversationStore)
    protected readonly conversationStore: QaapAgentConversationStore;

    @inject(QaapAgentTaskRunner)
    protected readonly taskRunner: QaapAgentTaskRunner;

    async list(cwd: string | undefined): Promise<QaapAgentApprovalRequest[]> {
        await this.conversationStore.whenReady();
        const resolvedCwd = cwd?.trim() ? cwd : undefined;
        const byId = new Map<string, QaapAgentApprovalRequest>();
        for (const group of this.conversationStore.listAllGroupedByCwd()) {
            if (resolvedCwd && group.cwd !== resolvedCwd) {
                continue;
            }
            for (const summary of group.conversations) {
                const conv = this.conversationStore.get(summary.id);
                if (!conv) {
                    continue;
                }
                const taskId = this.conversationStore.getActiveTaskIdForConversation(conv.id);
                for (const item of extractPendingToolApprovals(conv, taskId)) {
                    byId.set(item.id, item);
                }
                if (taskId) {
                    const detail = await this.taskRunner.detail(taskId);
                    const prompt = extractPendingPromptApproval(conv, taskId, detail?.log);
                    if (prompt && !byId.has(prompt.id)) {
                        byId.set(prompt.id, prompt);
                    }
                }
            }
        }
        return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
    }

    async approve(id: string): Promise<QaapAgentApprovalActionResponse> {
        return this.respond(id, 'approve');
    }

    async reject(id: string): Promise<QaapAgentApprovalActionResponse> {
        return this.respond(id, 'reject');
    }

    protected async respond(id: string, action: 'approve' | 'reject'): Promise<QaapAgentApprovalActionResponse> {
        const parsed = this.parseApprovalId(id);
        if (!parsed) {
            return { ok: false, error: 'Invalid approval id.' };
        }
        const conv = this.conversationStore.get(parsed.conversationId);
        if (!conv) {
            return { ok: false, error: 'Conversation not found.' };
        }
        const taskId = parsed.taskId ?? this.conversationStore.getActiveTaskIdForConversation(parsed.conversationId);
        if (!taskId) {
            return { ok: false, error: 'No active task for this approval.' };
        }
        const task = await this.taskRunner.detail(taskId);
        if (!task || task.state !== 'running') {
            return { ok: false, error: 'Task is not running.' };
        }
        const sent = this.taskRunner.respondToApprovalPrompt(taskId, action, parsed.toolUseId);
        if (!sent) {
            return {
                ok: false,
                error: action === 'approve'
                    ? 'Could not send approval to the agent process.'
                    : 'Could not send rejection to the agent process.',
            };
        }
        return { ok: true };
    }

    protected parseApprovalId(id: string): ParsedApprovalId | undefined {
        const toolMatch = /^([^:]+):tool:(.+)$/.exec(id);
        if (toolMatch) {
            return { conversationId: toolMatch[1], kind: 'tool', toolUseId: toolMatch[2] };
        }
        const promptMatch = /^([^:]+):prompt:(.+)$/.exec(id);
        if (promptMatch) {
            return { conversationId: promptMatch[1], kind: 'prompt', taskId: promptMatch[2] };
        }
        return undefined;
    }
}
