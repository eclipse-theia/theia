// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    QaapAgentConversation,
    QaapAgentConversationCwdGroup,
    QaapAgentConversationEvent,
    QaapAgentConversationSummary,
    QaapAgentMessage,
    QaapCreateAgentConversationRequest,
    QaapRenameAgentConversationRequest,
    QaapUpdateAgentConversationRequest,
    toConversationSummary,
} from '../common/qaap-agent-conversation';
import { resolveQaapAgentMentionToken } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import { QaapQaiqStreamAccumulator } from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-stream';
import { filterAgentProcessLogChunk } from '../common/qaap-agent-log-filter';
import { QaapAgentTaskRunner, QAIQ_AGENT_ID } from './qaap-agent-task-runner';
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
    protected readonly taskToConversation = new Map<string, { conversationId: string; userMessageId: string; agentMessageId?: string }>();
    /** Per-task parsers for QAIQ stream-json stdout. */
    protected readonly qaiqStreamByTaskId = new Map<string, QaapQaiqStreamAccumulator>();

    protected readonly onDidChangeEmitter = new Emitter<QaapAgentConversationEvent>();
    readonly onDidChange: Event<QaapAgentConversationEvent> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        void this.restoreFromDisk();
        this.taskRunner.onDidChangeTask(event => this.onTaskChanged(event));
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
        };
        this.conversations.set(id, conversation);
        this.fire({ type: 'created', conversation: toConversationSummary(conversation) });
        void this.persist();
        if (request.message?.trim()) {
            this.postUserMessage(id, request.message.trim());
        }
        return this.conversations.get(id)!;
    }

    postUserMessage(id: string, content: string, agentOverride?: string): QaapAgentConversation {
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
            agentId: turnAgentId,
            title: conv.messages.length === 0 ? this.deriveTitle(content) : conv.title,
            status: 'streaming',
            updatedAt: Date.now(),
            messages,
            // Posting a new turn implicitly resumes a paused chat.
            paused: undefined,
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
        this.conversations.set(id, next);
        this.taskToConversation.set(task.id, { conversationId: id, userMessageId: userMessage.id });
        void this.persist();
        return next;
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
        if (!ref) {
            return;
        }
        if (event.type === 'output') {
            this.applyTaskOutput(event.task.id, ref, event.chunk);
            return;
        }
        const task = event.task;
        if (task.state === 'running') {
            return; // only react when the turn settles
        }
        this.taskToConversation.delete(task.id);
        void this.applyTaskOutcome(ref.conversationId, ref.userMessageId, ref.agentMessageId, task);
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
        const useQaiqStream = this.isQaiqConversation(conv);
        const { content, segments } = useQaiqStream
            ? this.appendQaiqStreamChunk(taskId, filtered)
            : { content: filtered, segments: undefined as QaapAgentMessage['segments'] };
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
                    content: useQaiqStream ? (content || message.content) : `${message.content}${filtered}`,
                    segments: segments ?? message.segments,
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

    protected isQaiqConversation(conv: QaapAgentConversation): boolean {
        const agent = conv.agentId?.trim().toLowerCase();
        return agent === QAIQ_AGENT_ID || agent === 'openclaude';
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

    protected parseQaiqLog(log: string): { content: string; segments: QaapAgentMessage['segments'] } {
        const accumulator = new QaapQaiqStreamAccumulator();
        accumulator.push(log);
        const segments = [...accumulator.getSegments()];
        return { content: accumulator.getDisplayText() || log, segments };
    }

    protected async applyTaskOutcome(
        conversationId: string,
        userMessageId: string,
        agentMessageId: string | undefined,
        task: QaapAgentTask,
    ): Promise<void> {
        this.qaiqStreamByTaskId.delete(task.id);
        const conv = this.conversations.get(conversationId);
        if (!conv) {
            return;
        }
        if (task.state === 'cancelled') {
            const next: QaapAgentConversation = { ...conv, status: 'idle', updatedAt: Date.now() };
            this.conversations.set(conversationId, next);
            this.fire({ type: 'updated', conversation: toConversationSummary(next) });
            void this.persist();
            return;
        }
        const detail = await this.taskRunner.detail(task.id);
        const log = this.filterAgentLogChunk((detail?.log ?? '').trim());
        const qaiqParsed = this.isQaiqConversation(conv) && log
            ? this.parseQaiqLog(log)
            : undefined;
        if (task.state !== 'completed') {
            const reason = `Agent ${task.state}${task.exitCode !== undefined ? ` (exit ${task.exitCode})` : ''}.`;
            const errored = this.markUserMessageFailed(conv, userMessageId, reason);
            const withReply = log && !agentMessageId
                ? this.appendAgentReply(errored, log)
                : errored;
            this.conversations.set(conversationId, withReply);
            this.fire({ type: 'updated', conversation: toConversationSummary(withReply) });
            void this.persist();
            return;
        }
        let withReply: QaapAgentConversation;
        if (agentMessageId && qaiqParsed) {
            const messages = conv.messages.map(message => message.id === agentMessageId
                ? {
                    ...message,
                    content: qaiqParsed.content || message.content,
                    segments: qaiqParsed.segments,
                }
                : message
            );
            withReply = { ...conv, status: 'idle', updatedAt: Date.now(), messages };
        } else if (agentMessageId) {
            withReply = { ...conv, status: 'idle' as const, updatedAt: Date.now() };
        } else {
            const body = qaiqParsed?.content || log || '(agent produced no output)';
            const reply = this.appendAgentReply({ ...conv, status: 'idle' }, body);
            if (qaiqParsed?.segments?.length) {
                const messages = reply.messages.map((message, index, all) => {
                    if (index === all.length - 1 && message.role === 'agent') {
                        return { ...message, segments: qaiqParsed.segments };
                    }
                    return message;
                });
                withReply = { ...reply, messages };
            } else {
                withReply = reply;
            }
        }
        this.conversations.set(conversationId, withReply);
        const agentMessage = withReply.messages[withReply.messages.length - 1];
        if (agentMessage) {
            this.fire({ type: 'message', conversationId, cwd: withReply.cwd, message: agentMessage });
        }
        this.fire({ type: 'updated', conversation: toConversationSummary(withReply) });
        void this.persist();
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
            status: 'idle',
            updatedAt: message.createdAt,
            messages: [...conv.messages, message],
        };
    }

    protected markUserMessageFailed(conv: QaapAgentConversation, messageId: string, reason: string): QaapAgentConversation {
        const messages = conv.messages.map(m => m.id === messageId ? { ...m, error: reason } : m);
        return { ...conv, status: 'failed', updatedAt: Date.now(), messages };
    }

    /**
     * Build the agent prompt for the upcoming turn. The chosen format is a plain transcript with
     * role-tagged blocks: every coding-agent CLI we support (`claude -p`, `codex exec`, `aider`)
     * accepts free-form text as a single shell-quoted argument, so an explicit transcript is the
     * most robust way to carry multi-turn context without depending on agent-specific resume APIs.
     */
    /**
     * Agent for the current user turn: `@mention` in this message beats the picker, then stored agent.
     */
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
        };
    }

    protected stripLeadingAgentMention(content: string): string {
        const match = /^@([a-z][\w-]*)\b\s*/i.exec(content);
        if (match && this.taskRunner.normalizeAgentId(resolveQaapAgentMentionToken(match[1]))) {
            return content.slice(match[0].length).trim() || content.trim();
        }
        return content.trim();
    }

    protected buildPrompt(conv: QaapAgentConversation): string {
        const lastUser = conv.messages[conv.messages.length - 1];
        const history = conv.messages.slice(0, -1);
        if (history.length === 0) {
            return this.stripLeadingAgentMention(lastUser.content);
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
        return lines.join('\n');
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

    protected isDirectory(target: string): boolean {
        try {
            return fs.statSync(target).isDirectory();
        } catch {
            return false;
        }
    }
}
