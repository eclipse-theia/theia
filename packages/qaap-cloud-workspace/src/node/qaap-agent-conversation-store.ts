// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    QaapAgentConversation,
    QaapAgentConversationCwdGroup,
    QaapAgentConversationEvent,
    QaapAgentConversationSummary,
    QaapAgentMessage,
    QaapConversationCheckpoint,
    QaapCreateAgentConversationRequest,
    QaapLinkConversationsByBranchRequest,
    QaapRenameAgentConversationRequest,
    QaapUpdateAgentConversationRequest,
    toConversationSummary,
} from '../common/qaap-agent-conversation';
import {
    agentSupportsModelPicker,
    isOpencodeAgent,
    isQaiqAgent,
    resolveQaapAgentMentionToken,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import { parseOpencodeLog, QaapOpencodeStreamAccumulator } from '@theia/qaap-mobile-shell/lib/common/qaap-opencode-stream';
import { QaapQaiqStreamAccumulator } from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-stream';
import { patchConversationAutoApprove } from '../common/qaap-agent-conversation-auto-approve';
import { filterAgentProcessLogChunk } from '../common/qaap-agent-log-filter';
import { appendTeamDelegationToPrompt } from '../common/qaap-team-delegation';
import {
    areAllSubtasksSettled,
    buildTeamSynthesisUserMessage,
    collectSubtasksForLeader,
    countFailedSubtasks,
    formatSubtaskMailboxMessage,
    isTeamSynthesisUserMessage,
} from '../common/qaap-team-mailbox';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';
import type { QaapAgentTask, QaapAgentTaskEvent, QaapCreateAgentTaskRequest } from '../common/qaap-agent-task';

const STORE_DIR = path.join(os.homedir(), '.qaap', 'agent-conversations');
const INDEX_PATH = path.join(STORE_DIR, 'index.json');

/**
 * Persistent multi-turn conversations with the coding agent. Each user message spawns a one-shot
 * task on {@link QaapAgentTaskRunner} with the full transcript embedded in the prompt; when the
 * task finishes, its stdout is appended as the next agent message. The store survives backend
 * restarts and workspace switches: state lives entirely on the VPS.
 */
@injectable()
export class QaapAgentConversationStore {

    @inject(QaapAgentTaskRunner)
    protected readonly taskRunner: QaapAgentTaskRunner;

    protected readonly conversations = new Map<string, QaapAgentConversation>();
    /** Reverse index: task id → conversation turn metadata so we can route output/completion. */
    protected readonly taskToConversation = new Map<string, { conversationId: string; userMessageId: string; agentMessageId?: string; startSha?: string }>();
    /** Subtask ids whose completion was already appended to a leader conversation (passive mailbox). */
    protected readonly subtaskMailboxDelivered = new Set<string>();
    /** Leader turn task ids for which an auto-synthesis user message was already posted. */
    protected readonly teamSynthesisTriggeredForLeader = new Set<string>();
    /** Leader turns waiting for the in-flight agent reply before auto-synthesis can run. */
    protected readonly pendingTeamSynthesisForLeader = new Set<string>();
    /** Per-task parsers for QAIQ stream-json stdout. */
    protected readonly qaiqStreamByTaskId = new Map<string, QaapQaiqStreamAccumulator>();
    /** Per-task parsers for OpenCode {@code --format json} stdout. */
    protected readonly opencodeStreamByTaskId = new Map<string, QaapOpencodeStreamAccumulator>();

    protected readonly onDidChangeEmitter = new Emitter<QaapAgentConversationEvent>();
    readonly onDidChange: Event<QaapAgentConversationEvent> = this.onDidChangeEmitter.event;
    /** Resolves once {@link restoreFromDisk} finishes — consumers that reconcile against conversations should await this. */
    protected restoreReady!: Promise<void>;

    @postConstruct()
    protected init(): void {
        this.restoreReady = this.restoreFromDisk();
        this.taskRunner.onDidChangeTask(event => this.onTaskChanged(event));
    }

    whenReady(): Promise<void> {
        return this.restoreReady;
    }

    list(cwd: string | undefined): QaapAgentConversationSummary[] {
        const all = [...this.conversations.values()];
        const filtered = cwd ? all.filter(c => c.cwd === path.resolve(cwd)) : all;
        return filtered
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(toConversationSummary);
    }

    listAllGroupedByCwd(): QaapAgentConversationCwdGroup[] {
        const buckets = new Map<string, QaapAgentConversation[]>();
        for (const conv of this.conversations.values()) {
            const list = buckets.get(conv.cwd);
            if (list) {
                list.push(conv);
            } else {
                buckets.set(conv.cwd, [conv]);
            }
        }
        const groups: QaapAgentConversationCwdGroup[] = [];
        for (const [cwd, list] of buckets) {
            list.sort((a, b) => b.updatedAt - a.updatedAt);
            groups.push({
                cwd,
                projectName: path.basename(cwd) || cwd,
                streamingCount: list.reduce((n, c) => n + (c.status === 'streaming' ? 1 : 0), 0),
                conversations: list.map(toConversationSummary),
            });
        }
        groups.sort((a, b) => (b.conversations[0]?.updatedAt ?? 0) - (a.conversations[0]?.updatedAt ?? 0));
        return groups;
    }

    get(id: string): QaapAgentConversation | undefined {
        return this.conversations.get(id);
    }

    /** Running turn task id for a conversation, if any. */
    getActiveTaskIdForConversation(conversationId: string): string | undefined {
        for (const [taskId, ref] of this.taskToConversation) {
            if (ref.conversationId === conversationId) {
                return taskId;
            }
        }
        return undefined;
    }

    create(request: QaapCreateAgentConversationRequest): QaapAgentConversation {
        const cwd = path.resolve(request.cwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        const seedAgent = (request.agent ?? '').trim() || this.taskRunner.defaultAgent();
        const firstMessage = (request.message ?? '').trim();
        const agentId = firstMessage
            ? this.resolveTurnAgent({ id: '', cwd, agentId: seedAgent, title: '', status: 'idle', createdAt: 0, updatedAt: 0, messages: [] }, firstMessage, request.agent)
            : seedAgent;
        const now = Date.now();
        const id = randomUUID();
        const titleSeed = (request.title ?? request.message ?? '').trim();
        const conversation: QaapAgentConversation = {
            id,
            cwd,
            agentId,
            title: this.deriveTitle(titleSeed) || 'New conversation',
            status: 'idle',
            createdAt: now,
            updatedAt: now,
            messages: [],
            ...(request.parallelRunId ? { parallelRunId: request.parallelRunId } : {}),
            ...(request.parallelBaseCwd ? { parallelBaseCwd: request.parallelBaseCwd } : {}),
            ...(request.autoApprove === false ? { autoApprove: false } : {}),
            ...(() => {
                const agentModel = request.agentModel ?? request.qaiqModel;
                return agentModel && agentSupportsModelPicker(agentId)
                    ? { agentModel, qaiqModel: agentModel }
                    : {};
            })(),
        };
        this.conversations.set(id, conversation);
        this.fire({ type: 'created', conversation: toConversationSummary(conversation) });
        void this.persist();
        if (request.message?.trim()) {
            this.postUserMessage(
                id,
                request.message.trim(),
                undefined,
                undefined,
                request.autoApprove === false ? false : request.autoApprove === true ? true : undefined,
            );
        }
        return this.conversations.get(id)!;
    }

    postUserMessage(
        id: string,
        content: string,
        agentOverride?: string,
        agentModelOverride?: QaapCreateAgentTaskRequest['agentModel'],
        autoApproveOverride?: boolean,
    ): QaapAgentConversation {
        const conv = this.conversations.get(id);
        if (!conv) {
            throw new Error('Conversation not found.');
        }
        if (conv.status === 'streaming') {
            throw new Error('A turn is already in progress for this conversation.');
        }
        const turnAgentId = this.resolveTurnAgent(conv, content, agentOverride);
        const userMessage: QaapAgentMessage = {
            id: randomUUID(),
            role: 'user',
            content,
            createdAt: Date.now(),
        };
        const messages = [...conv.messages, userMessage];
        let next: QaapAgentConversation = {
            ...conv,
            ...patchConversationAutoApprove(conv, autoApproveOverride),
            agentId: turnAgentId,
            title: conv.messages.length === 0 ? this.deriveTitle(content) : conv.title,
            status: 'streaming',
            updatedAt: Date.now(),
            messages,
            // Posting a new turn implicitly resumes a paused chat.
            paused: undefined,
            ...(agentModelOverride && agentSupportsModelPicker(turnAgentId)
                ? { agentModel: agentModelOverride, qaiqModel: agentModelOverride }
                : {}),
        };
        this.conversations.set(id, next);
        this.fire({ type: 'message', conversationId: id, cwd: next.cwd, message: userMessage });
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });

        let task: QaapAgentTask | undefined;
        try {
            task = this.taskRunner.create(this.buildTaskCreateRequest(next, turnAgentId));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            next = this.markUserMessageFailed(next, userMessage.id, message);
            this.conversations.set(id, next);
            this.fire({ type: 'updated', conversation: toConversationSummary(next) });
            void this.persist();
            return next;
        }

        const messagesWithTask = next.messages.map(m => m.id === userMessage.id ? { ...m, taskId: task!.id } : m);
        next = { ...next, messages: messagesWithTask };
        const autoLinked = this.tryAutoLinkConversationToGitBranch(next);
        if (autoLinked) {
            next = autoLinked;
        }
        this.conversations.set(id, next);
        const startSha = this.captureGitSha(conv.cwd);
        this.taskToConversation.set(task.id, { conversationId: id, userMessageId: userMessage.id, startSha });
        void this.persist();
        return next;
    }

    /**
     * Attach open PR metadata to every conversation in the repo whose checked-out branch matches
     * the PR head (used by the GitHub webhook → Work Hub inbox pipeline).
     */
    linkConversationsToPullRequest(input: QaapLinkConversationsByBranchRequest): number {
        const link: QaapLinkedPullRequest = {
            owner: input.owner,
            repo: input.repo,
            number: input.number,
            branch: input.branch,
            title: input.title,
        };
        let linked = 0;
        for (const [conversationId, conv] of this.conversations) {
            const existing = conv.linkedPullRequest;
            if (existing
                && existing.number === link.number
                && existing.owner.toLowerCase() === link.owner.toLowerCase()
                && existing.repo.toLowerCase() === link.repo.toLowerCase()) {
                continue;
            }
            if (!this.cwdMatchesGithubRepo(conv.cwd, link.owner, link.repo)) {
                continue;
            }
            const head = this.readGitBranch(conv.cwd);
            if (head && head !== link.branch) {
                continue;
            }
            const next: QaapAgentConversation = {
                ...conv,
                linkedPullRequest: link,
                updatedAt: Date.now(),
            };
            this.conversations.set(conversationId, next);
            this.fire({ type: 'updated', conversation: toConversationSummary(next) });
            linked++;
        }
        if (linked > 0) {
            void this.persist();
        }
        return linked;
    }

    retry(id: string): QaapAgentConversation {
        const conv = this.conversations.get(id);
        if (!conv) {
            throw new Error('Conversation not found.');
        }
        if (conv.status === 'streaming') {
            throw new Error('A turn is already in progress for this conversation.');
        }
        // Prefer the last user message explicitly marked as failed. Older persisted conversations
        // can have status `failed` without the per-message error annotation, so fall back to the
        // last user turn when the conversation itself is failed.
        let failedIndex = conv.messages.reduce<number>((last, m, i) => m.role === 'user' && m.error ? i : last, -1);
        if (failedIndex < 0 && conv.status === 'failed') {
            failedIndex = conv.messages.reduce<number>((last, m, i) => m.role === 'user' ? i : last, -1);
        }
        if (failedIndex < 0) {
            throw new Error('No failed message to retry.');
        }
        const failedMessage = conv.messages[failedIndex];
        // Trim back to just before the failed turn (also removes any partial agent reply that followed)
        const trimmed: QaapAgentConversation = {
            ...conv,
            status: 'idle',
            messages: conv.messages.slice(0, failedIndex),
            updatedAt: Date.now(),
        };
        this.conversations.set(id, trimmed);
        this.fire({ type: 'updated', conversation: toConversationSummary(trimmed) });
        return this.postUserMessage(id, failedMessage.content);
    }

    cancel(id: string): QaapAgentConversation | undefined {
        const conv = this.conversations.get(id);
        if (!conv) {
            return undefined;
        }
        const lastUser = [...conv.messages].reverse().find(m => m.role === 'user' && m.taskId);
        if (lastUser?.taskId) {
            this.taskRunner.cancel(lastUser.taskId);
        }
        const next: QaapAgentConversation = { ...conv, status: 'idle', updatedAt: Date.now() };
        this.conversations.set(id, next);
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });
        void this.persist();
        return next;
    }

    rename(id: string, request: QaapRenameAgentConversationRequest): QaapAgentConversation | undefined {
        return this.update(id, { title: request.title });
    }

    /**
     * Patch a conversation's mutable flags (title, priority, paused). Pausing a streaming
     * conversation also cancels the in-flight task so it doesn't keep burning compute.
     */
    update(id: string, request: QaapUpdateAgentConversationRequest): QaapAgentConversation | undefined {
        const conv = this.conversations.get(id);
        if (!conv) {
            return undefined;
        }
        const patch: { -readonly [K in keyof QaapAgentConversation]?: QaapAgentConversation[K] } = {};
        if (request.title !== undefined) {
            const title = request.title.trim();
            if (!title) {
                return undefined;
            }
            patch.title = title;
        }
        if (request.priority !== undefined) {
            patch.priority = request.priority || undefined;
        }
        if (request.paused !== undefined) {
            patch.paused = request.paused || undefined;
            if (request.paused && conv.status === 'streaming') {
                const lastUser = [...conv.messages].reverse().find(m => m.role === 'user' && m.taskId);
                if (lastUser?.taskId) {
                    this.taskRunner.cancel(lastUser.taskId);
                }
                patch.status = 'idle';
            }
        }
        if (request.autoApprove !== undefined) {
            patch.autoApprove = request.autoApprove ? undefined : false;
        }
        if (request.linkedPullRequest !== undefined) {
            patch.linkedPullRequest = request.linkedPullRequest ?? undefined;
        }
        if (Object.keys(patch).length === 0) {
            return conv;
        }
        const next: QaapAgentConversation = { ...conv, ...patch, updatedAt: Date.now() };
        this.conversations.set(id, next);
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });
        void this.persist();
        return next;
    }

    fork(id: string): QaapAgentConversation | undefined {
        const conv = this.conversations.get(id);
        if (!conv) {
            return undefined;
        }
        const now = Date.now();
        const forked: QaapAgentConversation = {
            ...conv,
            id: randomUUID(),
            title: `${conv.title} fork`,
            status: 'idle',
            createdAt: now,
            updatedAt: now,
            forkedFromId: conv.id,
            messages: conv.messages.map(message => ({
                ...message,
                id: randomUUID(),
                taskId: undefined,
                error: undefined,
            })),
        };
        this.conversations.set(forked.id, forked);
        this.fire({ type: 'created', conversation: toConversationSummary(forked) });
        void this.persist();
        return forked;
    }

    delete(id: string): boolean {
        const conv = this.conversations.get(id);
        if (!conv) {
            return false;
        }
        this.conversations.delete(id);
        for (const [taskId, ref] of this.taskToConversation) {
            if (ref.conversationId === id) {
                this.taskToConversation.delete(taskId);
            }
        }
        this.fire({ type: 'deleted', conversationId: id, cwd: conv.cwd });
        void this.persist();
        return true;
    }

    /**
     * Wire the spawned task's lifecycle to its conversation: on completion we read the task log
     * and append it as the agent reply; on failure/cancel we mark the turn as failed.
     */
    protected onTaskChanged(event: QaapAgentTaskEvent): void {
        const ref = this.taskToConversation.get(event.task.id);
        if (ref) {
            if (event.type === 'output') {
                this.applyTaskOutput(event.task.id, ref, event.chunk);
                return;
            }
            const task = event.task;
            if (task.state === 'running') {
                return; // only react when the turn settles
            }
            this.taskToConversation.delete(task.id);
            void this.applyTaskOutcome(ref.conversationId, ref.userMessageId, ref.agentMessageId, task, ref.startSha);
            return;
        }
        if (event.type === 'output' || event.type === 'created') {
            return;
        }
        const task = event.task;
        if (!task.parentId || task.state === 'running') {
            return;
        }
        void this.deliverSubtaskMailbox(task);
    }

    /**
     * When a delegated subtask (qaap-task with parentId) finishes, append its log to the leader
     * conversation so the next turn can synthesize results without polling task ids manually.
     */
    protected async deliverSubtaskMailbox(task: QaapAgentTask): Promise<void> {
        if (this.subtaskMailboxDelivered.has(task.id)) {
            return;
        }
        const leaderTaskId = this.resolveLeaderTaskId(task);
        const conversationId = leaderTaskId ? this.findConversationIdForLeaderTask(leaderTaskId) : undefined;
        if (!conversationId) {
            return;
        }
        const conv = this.conversations.get(conversationId);
        if (!conv) {
            return;
        }
        this.subtaskMailboxDelivered.add(task.id);
        const detail = await this.taskRunner.detail(task.id);
        const log = this.filterAgentLogChunk((detail?.log ?? '').trim());
        const message: QaapAgentMessage = {
            id: randomUUID(),
            role: 'agent',
            content: formatSubtaskMailboxMessage(task, log),
            createdAt: Date.now(),
        };
        const next: QaapAgentConversation = {
            ...conv,
            messages: [...conv.messages, message],
            updatedAt: Date.now(),
        };
        this.conversations.set(conversationId, next);
        this.fire({ type: 'message', conversationId, cwd: next.cwd, message });
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });
        void this.persist();
        if (leaderTaskId) {
            this.maybeTriggerTeamSynthesis(leaderTaskId, conversationId);
        }
    }

    /** Walk parentId links until the leader turn task spawned for a user message. */
    protected resolveLeaderTaskId(task: QaapAgentTask): string | undefined {
        let leaderId = task.parentId;
        if (!leaderId) {
            return undefined;
        }
        const visited = new Set<string>();
        while (leaderId && !visited.has(leaderId)) {
            visited.add(leaderId);
            const parent = this.findTaskById(leaderId);
            if (parent?.parentId) {
                leaderId = parent.parentId;
            } else {
                return leaderId;
            }
        }
        return undefined;
    }

    protected findConversationIdForLeaderTask(leaderTaskId: string): string | undefined {
        const active = this.taskToConversation.get(leaderTaskId);
        if (active) {
            return active.conversationId;
        }
        for (const conv of this.conversations.values()) {
            if (conv.messages.some(message => message.role === 'user' && message.taskId === leaderTaskId)) {
                return conv.id;
            }
        }
        return undefined;
    }

    protected findTaskById(id: string): QaapAgentTask | undefined {
        return this.taskRunner.list().find(candidate => candidate.id === id);
    }

    /**
     * When every delegated subtask for a leader turn has settled (and mailbox entries were
     * appended), post an auto-synthesis user turn so the leader integrates results.
     */
    protected maybeTriggerTeamSynthesis(leaderTaskId: string, conversationId: string): void {
        if (this.teamSynthesisTriggeredForLeader.has(leaderTaskId)) {
            return;
        }
        const conv = this.conversations.get(conversationId);
        if (!conv || conv.paused) {
            return;
        }
        const subtasks = collectSubtasksForLeader(leaderTaskId, this.taskRunner.list());
        if (!areAllSubtasksSettled(subtasks)) {
            return;
        }
        if (!subtasks.every(subtask => this.subtaskMailboxDelivered.has(subtask.id))) {
            return;
        }
        if (conv.status === 'streaming') {
            this.pendingTeamSynthesisForLeader.add(leaderTaskId);
            return;
        }
        this.pendingTeamSynthesisForLeader.delete(leaderTaskId);
        this.teamSynthesisTriggeredForLeader.add(leaderTaskId);
        const synthesisMessage = buildTeamSynthesisUserMessage(subtasks.length, countFailedSubtasks(subtasks));
        try {
            this.postUserMessage(conversationId, synthesisMessage);
        } catch {
            this.teamSynthesisTriggeredForLeader.delete(leaderTaskId);
        }
    }

    protected finishLeaderTurnAndMaybeSynthesize(
        conversationId: string,
        leaderTaskId: string,
        next: QaapAgentConversation,
    ): void {
        this.conversations.set(conversationId, next);
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });
        void this.persist();
        this.pendingTeamSynthesisForLeader.delete(leaderTaskId);
        this.maybeTriggerTeamSynthesis(leaderTaskId, conversationId);
    }

    protected applyTaskOutput(
        taskId: string,
        ref: { conversationId: string; userMessageId: string; agentMessageId?: string },
        chunk: string,
    ): void {
        const conv = this.conversations.get(ref.conversationId);
        const filtered = this.filterAgentLogChunk(chunk);
        if (!conv || !filtered) {
            return;
        }
        const now = Date.now();
        const agentId = conv.agentId;
        const usesSegmentStream = isQaiqAgent(agentId) || isOpencodeAgent(agentId);
        let content: string;
        let segments: QaapAgentMessage['segments'];
        if (isQaiqAgent(agentId)) {
            ({ content, segments } = this.appendQaiqStreamChunk(taskId, filtered));
        } else if (isOpencodeAgent(agentId)) {
            ({ content, segments } = this.appendOpencodeStreamChunk(taskId, filtered));
        } else {
            content = filtered;
            segments = undefined;
        }
        if (!content && (!segments || segments.length === 0)) {
            return;
        }
        let agentMessageId = ref.agentMessageId;
        let messages: QaapAgentMessage[];
        if (!agentMessageId) {
            agentMessageId = randomUUID();
            ref.agentMessageId = agentMessageId;
            this.taskToConversation.set(taskId, ref);
            const message: QaapAgentMessage = {
                id: agentMessageId,
                role: 'agent',
                content: content || '…',
                segments,
                createdAt: now,
            };
            messages = [...conv.messages, message];
            this.fire({ type: 'message', conversationId: conv.id, cwd: conv.cwd, message });
        } else {
            messages = conv.messages.map(message => message.id === agentMessageId
                ? {
                    ...message,
                    content: usesSegmentStream ? (content || message.content) : `${message.content}${filtered}`,
                    segments: usesSegmentStream ? (segments ?? message.segments) : undefined,
                }
                : message
            );
            const updated = messages.find(message => message.id === agentMessageId);
            if (updated) {
                this.fire({ type: 'message', conversationId: conv.id, cwd: conv.cwd, message: updated });
            }
        }
        const next: QaapAgentConversation = { ...conv, status: 'streaming', updatedAt: now, messages };
        this.conversations.set(conv.id, next);
        this.fire({ type: 'updated', conversation: toConversationSummary(next) });
        void this.persist();
    }

    protected appendQaiqStreamChunk(
        taskId: string,
        chunk: string,
    ): { content: string; segments: QaapAgentMessage['segments'] } {
        let accumulator = this.qaiqStreamByTaskId.get(taskId);
        if (!accumulator) {
            accumulator = new QaapQaiqStreamAccumulator();
            this.qaiqStreamByTaskId.set(taskId, accumulator);
        }
        accumulator.push(chunk);
        const segments = [...accumulator.getSegments()];
        return { content: accumulator.getDisplayText(), segments };
    }

    protected appendOpencodeStreamChunk(
        taskId: string,
        chunk: string,
    ): { content: string; segments: QaapAgentMessage['segments'] } {
        let accumulator = this.opencodeStreamByTaskId.get(taskId);
        if (!accumulator) {
            accumulator = new QaapOpencodeStreamAccumulator();
            this.opencodeStreamByTaskId.set(taskId, accumulator);
        }
        accumulator.push(chunk);
        const segments = [...accumulator.getSegments()];
        return { content: accumulator.getDisplayText(), segments };
    }

    protected parseQaiqLog(log: string): { content: string; segments: QaapAgentMessage['segments'] } {
        const accumulator = new QaapQaiqStreamAccumulator();
        accumulator.push(log);
        const segments = [...accumulator.getSegments()];
        return { content: accumulator.getDisplayText() || log, segments };
    }

    protected parseStructuredLog(
        agentId: string,
        log: string,
    ): { content: string; segments: QaapAgentMessage['segments'] } | undefined {
        if (isQaiqAgent(agentId)) {
            return this.parseQaiqLog(log);
        }
        if (isOpencodeAgent(agentId)) {
            return parseOpencodeLog(log);
        }
        return undefined;
    }

    protected async applyTaskOutcome(
        conversationId: string,
        userMessageId: string,
        agentMessageId: string | undefined,
        task: QaapAgentTask,
        startSha?: string,
    ): Promise<void> {
        this.qaiqStreamByTaskId.delete(task.id);
        this.opencodeStreamByTaskId.delete(task.id);
        const conv = this.conversations.get(conversationId);
        if (!conv) {
            return;
        }
        if (task.state === 'cancelled') {
            const next: QaapAgentConversation = { ...conv, status: 'idle', updatedAt: Date.now() };
            this.finishLeaderTurnAndMaybeSynthesize(conversationId, task.id, next);
            return;
        }
        const detail = await this.taskRunner.detail(task.id);
        const log = this.filterAgentLogChunk((detail?.log ?? '').trim());
        const structuredParsed = log ? this.parseStructuredLog(conv.agentId, log) : undefined;
        if (task.state !== 'completed') {
            const reason = `Agent ${task.state}${task.exitCode !== undefined ? ` (exit ${task.exitCode})` : ''}.`;
            const errored = this.markUserMessageFailed(conv, userMessageId, reason);
            const withReply = log && !agentMessageId
                ? this.appendAgentReply(errored, log)
                : errored;
            this.finishLeaderTurnAndMaybeSynthesize(conversationId, task.id, withReply);
            return;
        }
        let withReply: QaapAgentConversation;
        if (agentMessageId && structuredParsed) {
            const messages = conv.messages.map(message => message.id === agentMessageId
                ? {
                    ...message,
                    content: structuredParsed.content || message.content,
                    segments: structuredParsed.segments,
                }
                : message
            );
            withReply = { ...conv, status: 'idle', updatedAt: Date.now(), messages };
        } else if (agentMessageId) {
            withReply = { ...conv, status: 'idle' as const, updatedAt: Date.now() };
        } else {
            const body = structuredParsed?.content || log || '(agent produced no output)';
            const reply = this.appendAgentReply({ ...conv, status: 'idle' }, body);
            if (structuredParsed?.segments?.length) {
                const messages = reply.messages.map((message, index, all) => {
                    if (index === all.length - 1 && message.role === 'agent') {
                        return { ...message, segments: structuredParsed.segments };
                    }
                    return message;
                });
                withReply = { ...reply, messages };
            } else {
                withReply = reply;
            }
        }
        const gitStats = this.computeGitDiffStats(conv.cwd, startSha);
        if (gitStats) {
            withReply = { ...withReply, gitDiffAdded: gitStats.added, gitDiffRemoved: gitStats.removed };
        }
        const userMessage = withReply.messages.find(m => m.id === userMessageId);
        const checkpoint = this.captureCheckpoint(
            withReply.cwd,
            conversationId,
            userMessageId,
            userMessage ? this.checkpointLabel(userMessage.content) : 'Turn',
            gitStats,
        );
        if (checkpoint) {
            withReply = { ...withReply, checkpoints: [...(withReply.checkpoints ?? []), checkpoint] };
        }
        this.conversations.set(conversationId, withReply);
        const agentMessage = withReply.messages[withReply.messages.length - 1];
        if (agentMessage) {
            this.fire({ type: 'message', conversationId, cwd: withReply.cwd, message: agentMessage });
        }
        this.finishLeaderTurnAndMaybeSynthesize(conversationId, task.id, withReply);
    }

    protected appendAgentReply(conv: QaapAgentConversation, content: string): QaapAgentConversation {
        const message: QaapAgentMessage = {
            id: randomUUID(),
            role: 'agent',
            content,
            createdAt: Date.now(),
        };
        return {
            ...conv,
            status: conv.status === 'failed' ? 'failed' : 'idle',
            updatedAt: message.createdAt,
            messages: [...conv.messages, message],
        };
    }

    protected markUserMessageFailed(conv: QaapAgentConversation, messageId: string, reason: string): QaapAgentConversation {
        const messages = conv.messages.map(m => m.id === messageId ? { ...m, error: reason } : m);
        return { ...conv, status: 'failed', updatedAt: Date.now(), messages };
    }

    /** Agent for the current user turn: `@mention` in this message beats the picker, then stored agent. */
    protected resolveTurnAgent(conv: QaapAgentConversation, userContent: string, explicit?: string): string {
        const fromMention = this.extractAgentMentionFromUserMessage(userContent);
        if (fromMention) {
            return fromMention;
        }
        const explicitId = explicit?.trim();
        if (explicitId && this.isKnownAgentId(explicitId)) {
            return explicitId;
        }
        if (this.isKnownAgentId(conv.agentId)) {
            return conv.agentId;
        }
        return this.taskRunner.defaultAgent();
    }

    protected isKnownAgentId(agentId: string): boolean {
        return !!this.taskRunner.normalizeAgentId(agentId);
    }

    protected extractAgentMentionFromUserMessage(content: string): string | undefined {
        const regex = /@([a-z][\w-]*)/gi;
        let last: string | undefined;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const token = this.taskRunner.normalizeAgentId(match[1]);
            if (token) {
                last = token;
            }
        }
        return last;
    }

    protected buildTaskCreateRequest(
        conv: QaapAgentConversation,
        turnAgentId: string,
    ): QaapCreateAgentTaskRequest {
        const lastUser = conv.messages[conv.messages.length - 1];
        if (turnAgentId === 'shell') {
            return {
                command: this.stripLeadingAgentMention(lastUser.content),
                cwd: conv.cwd,
                title: conv.title,
            };
        }
        return {
            prompt: this.buildPrompt(conv),
            agent: turnAgentId,
            cwd: conv.cwd,
            title: conv.title,
            ...(conv.autoApprove === false ? { autoApprove: false } : {}),
            ...(() => {
                const agentModel = conv.agentModel ?? conv.qaiqModel;
                return agentSupportsModelPicker(turnAgentId) && agentModel
                    ? { agentModel, qaiqModel: agentModel }
                    : {};
            })(),
        };
    }

    protected stripLeadingAgentMention(content: string): string {
        const match = /^@([a-z][\w-]*)\b\s*/i.exec(content);
        if (match && this.taskRunner.normalizeAgentId(resolveQaapAgentMentionToken(match[1]))) {
            return content.slice(match[0].length).trim() || content.trim();
        }
        return content.trim();
    }

    /**
     * Build the agent prompt for the upcoming turn. The chosen format is a plain transcript with
     * role-tagged blocks: every coding-agent CLI we support (`claude -p`, `codex exec`, `aider`)
     * accepts free-form text as a single shell-quoted argument, so an explicit transcript is the
     * most robust way to carry multi-turn context without depending on agent-specific resume APIs.
     */
    protected buildPrompt(conv: QaapAgentConversation): string {
        const lastUser = conv.messages[conv.messages.length - 1];
        const skipDelegation = isTeamSynthesisUserMessage(lastUser.content);
        const history = conv.messages.slice(0, -1);
        if (history.length === 0) {
            const seed = this.stripLeadingAgentMention(lastUser.content);
            return skipDelegation ? seed : this.appendTeamDelegation(seed, conv.agentId);
        }
        const lines: string[] = [
            'You are continuing an ongoing conversation. The transcript so far:',
            '',
        ];
        for (const m of history) {
            lines.push(`${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`);
            lines.push('');
        }
        lines.push('Now respond to the latest user message:');
        lines.push('');
        lines.push(`USER: ${this.stripLeadingAgentMention(lastUser.content)}`);
        const transcript = lines.join('\n');
        return skipDelegation ? transcript : this.appendTeamDelegation(transcript, conv.agentId);
    }

    /** Inject lightweight team-delegation instructions so the leader can spawn sub-tasks via `qaap-task`. */
    protected appendTeamDelegation(prompt: string, turnAgentId: string): string {
        const agentIds = this.taskRunner.listAgents().map(agent => agent.id);
        return appendTeamDelegationToPrompt(prompt, turnAgentId, agentIds);
    }

    /** Drop repetitive QAIQ/OpenClaude metadata noise from chat transcripts (still kept in task logs). */
    protected filterAgentLogChunk(chunk: string): string {
        return filterAgentProcessLogChunk(chunk);
    }

    protected deriveTitle(seed: string): string {
        const clean = seed.replace(/\s+/g, ' ').trim();
        if (!clean) {
            return '';
        }
        return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
    }

    protected fire(event: QaapAgentConversationEvent): void {
        this.onDidChangeEmitter.fire(event);
    }

    protected tryAutoLinkConversationToGitBranch(conv: QaapAgentConversation): QaapAgentConversation | undefined {
        if (conv.linkedPullRequest?.number) {
            return undefined;
        }
        const repo = this.parseGithubRepoFromCwd(conv.cwd);
        const branch = this.readGitBranch(conv.cwd);
        if (!repo || !branch) {
            return undefined;
        }
        const link: QaapLinkedPullRequest = {
            owner: repo.owner,
            repo: repo.name,
            branch,
            number: conv.linkedPullRequest?.number,
            title: conv.linkedPullRequest?.title,
        };
        if (conv.linkedPullRequest
            && conv.linkedPullRequest.owner === link.owner
            && conv.linkedPullRequest.repo === link.repo
            && conv.linkedPullRequest.branch === link.branch) {
            return undefined;
        }
        return { ...conv, linkedPullRequest: link, updatedAt: Date.now() };
    }

    protected cwdMatchesGithubRepo(cwd: string, owner: string, repo: string): boolean {
        const parsed = this.parseGithubRepoFromCwd(cwd);
        if (!parsed) {
            return false;
        }
        return parsed.owner.toLowerCase() === owner.toLowerCase()
            && parsed.name.toLowerCase() === repo.toLowerCase();
    }

    protected parseGithubRepoFromCwd(cwd: string): { owner: string; name: string } | undefined {
        try {
            const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' });
            if (result.status !== 0) {
                return undefined;
            }
            const url = result.stdout.trim();
            const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(url);
            if (ssh) {
                return { owner: ssh[1], name: ssh[2].replace(/\.git$/, '') };
            }
            const https = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?/i.exec(url);
            if (https) {
                return { owner: https[1], name: https[2].replace(/\.git$/, '') };
            }
        } catch { /* not a git repo */ }
        return undefined;
    }

    protected readGitBranch(cwd: string): string | undefined {
        try {
            const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' });
            if (result.status === 0) {
                const branch = result.stdout.trim();
                return branch && branch !== 'HEAD' ? branch : undefined;
            }
        } catch { /* not a git repo */ }
        return undefined;
    }

    protected async restoreFromDisk(): Promise<void> {
        try {
            const raw = await fsp.readFile(INDEX_PATH, 'utf8');
            const stored = JSON.parse(raw) as QaapAgentConversation[];
            for (const conv of stored) {
                const recovered: QaapAgentConversation = conv.status === 'streaming' ? { ...conv, status: 'idle' } : conv;
                this.conversations.set(recovered.id, recovered);
            }
            await this.persist();
        } catch {
            /* no prior conversations */
        }
    }

    protected async persist(): Promise<void> {
        try {
            await fsp.mkdir(STORE_DIR, { recursive: true });
            await fsp.writeFile(INDEX_PATH, JSON.stringify([...this.conversations.values()], undefined, 2), 'utf8');
        } catch {
            /* persistence is best-effort */
        }
    }

    protected captureGitSha(cwd: string): string | undefined {
        try {
            const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
            if (result.status === 0) {
                return result.stdout.trim();
            }
        } catch { /* not a git repo */ }
        return undefined;
    }

    protected computeGitDiffStats(cwd: string, startSha?: string): { added: number; removed: number } | undefined {
        try {
            let added = 0;
            let removed = 0;
            if (startSha) {
                const committed = spawnSync('git', ['diff', '--numstat', `${startSha}..HEAD`], { cwd, encoding: 'utf8' });
                if (committed.status === 0 && committed.stdout) {
                    const stats = parseGitNumstat(committed.stdout);
                    added += stats.added;
                    removed += stats.removed;
                }
            }
            const uncommitted = spawnSync('git', ['diff', '--numstat', 'HEAD'], { cwd, encoding: 'utf8' });
            if (uncommitted.status === 0 && uncommitted.stdout) {
                const stats = parseGitNumstat(uncommitted.stdout);
                added += stats.added;
                removed += stats.removed;
            }
            if (added === 0 && removed === 0) {
                return undefined;
            }
            return { added, removed };
        } catch {
            return undefined;
        }
    }

    /**
     * Capture a snapshot of the full working tree as a git commit object, kept alive by a ref under
     * `refs/qaap/checkpoints/*`. Uses a throwaway `GIT_INDEX_FILE` so the user's index/branch/HEAD
     * are never touched. Returns undefined when not a git repo or git plumbing fails.
     */
    protected captureCheckpoint(
        cwd: string,
        conversationId: string,
        messageId: string,
        label: string,
        stats?: { added: number; removed: number },
    ): QaapConversationCheckpoint | undefined {
        const tmpIndex = path.join(os.tmpdir(), `qaap-ckpt-${randomUUID()}.index`);
        const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
        try {
            // Seed the throwaway index from HEAD when a commit exists (best-effort; empty repo is fine).
            spawnSync('git', ['read-tree', 'HEAD'], { cwd, env, encoding: 'utf8' });
            if (spawnSync('git', ['add', '-A'], { cwd, env, encoding: 'utf8' }).status !== 0) {
                return undefined;
            }
            const tree = spawnSync('git', ['write-tree'], { cwd, env, encoding: 'utf8' });
            const treeId = tree.status === 0 ? tree.stdout.trim() : '';
            if (!treeId) {
                return undefined;
            }
            const commitRes = spawnSync(
                'git',
                ['-c', 'user.email=qaap@local', '-c', 'user.name=qaap', 'commit-tree', treeId, '-m', `qaap checkpoint: ${label}`],
                { cwd, env, encoding: 'utf8' },
            );
            const commit = commitRes.status === 0 ? commitRes.stdout.trim() : '';
            if (!commit) {
                return undefined;
            }
            const ref = `refs/qaap/checkpoints/${conversationId}/${messageId}-${Date.now()}`;
            spawnSync('git', ['update-ref', ref, commit], { cwd, encoding: 'utf8' });
            return { id: randomUUID(), messageId, label, commit, ref, capturedAt: Date.now(), added: stats?.added, removed: stats?.removed };
        } catch {
            return undefined;
        } finally {
            try {
                fs.rmSync(tmpIndex, { force: true });
            } catch { /* ignore */ }
        }
    }

    protected checkpointLabel(content: string): string {
        const clean = content.replace(/\s+/g, ' ').trim();
        return clean.length > 60 ? `${clean.slice(0, 57)}…` : (clean || 'Turn');
    }

    /**
     * Restore the working tree to a checkpoint's snapshot. Captures an "undo" checkpoint of the
     * current state first, so the restore is reversible. Only touches the working tree (never the
     * index, branch or commit history). Files created AFTER the checkpoint are left as-is.
     */
    async restoreCheckpoint(conversationId: string, checkpointId: string): Promise<QaapAgentConversation | undefined> {
        const conv = this.conversations.get(conversationId);
        if (!conv) {
            return undefined;
        }
        const checkpoint = conv.checkpoints?.find(c => c.id === checkpointId);
        if (!checkpoint) {
            throw new Error('Checkpoint not found.');
        }
        if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: conv.cwd, encoding: 'utf8' }).status !== 0) {
            throw new Error('The conversation workspace is not a git repository.');
        }
        const undo = this.captureCheckpoint(conv.cwd, conversationId, checkpoint.messageId, 'Before restore');
        const restore = spawnSync('git', ['restore', '--source', checkpoint.commit, '--worktree', '--', '.'], { cwd: conv.cwd, encoding: 'utf8' });
        if (restore.status !== 0) {
            throw new Error(`Restore failed: ${(restore.stderr || '').trim() || 'git restore error'}`);
        }
        let next = conv;
        if (undo) {
            next = { ...conv, checkpoints: [...(conv.checkpoints ?? []), undo], updatedAt: Date.now() };
            this.conversations.set(conversationId, next);
            this.fire({ type: 'updated', conversation: toConversationSummary(next) });
            void this.persist();
        }
        return next;
    }

    protected isDirectory(target: string): boolean {
        try {
            return fs.statSync(target).isDirectory();
        } catch {
            return false;
        }
    }
}

function parseGitNumstat(output: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const line of output.split('\n')) {
        const parts = line.trim().split('\t');
        if (parts.length >= 2) {
            const a = parseInt(parts[0], 10);
            const r = parseInt(parts[1], 10);
            if (!isNaN(a)) { added += a; }
            if (!isNaN(r)) { removed += r; }
        }
    }
    return { added, removed };
}
