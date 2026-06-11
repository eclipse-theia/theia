// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    QAAP_AGENT_CONVERSATION_API_PATH,
    QAAP_AGENT_CONVERSATION_WS_PATH,
    cancelConversationHttp,
    listAllConversationGroups,
    registerConversationLiveCancel,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageDTO,
} from '../common/qaap-agent-conversation-client';
import {
    QaapConversationStreamMetricsCollector,
    countCompressedWireFields,
    logQaapStreamMetrics,
} from '../common/qaap-agent-stream-metrics';
import {
    expandAgentMessageForWire,
    expandAgentMessageWireDelta,
} from '../common/qaap-agent-message-wire-compress';
import type { QaapAgentMessageWireDelta } from '../common/qaap-agent-message-wire-delta';
import { normalizeAgentMessageContentForDisplay, resolveMessagePreviewText } from '../common/qaap-agent-message-content';
import { cwdMatchesProject, lookupByCwd, normalizeCwd } from './mobile-projects-active-tasks';

const STREAM_URL = `${QAAP_AGENT_CONVERSATION_API_PATH}/stream`;
const SSE_RECONNECT_DELAY_MS = 5_000;
/** Exponential backoff cap for WebSocket reconnects. */
const WS_RECONNECT_MAX_MS = 30_000;

interface ConversationCreatedEvent {
    readonly type: 'created' | 'updated';
    readonly conversation: QaapAgentConversationSummaryDTO;
}
interface ConversationMessageEvent {
    readonly type: 'message';
    readonly conversationId: string;
    readonly cwd: string;
    readonly message: QaapAgentMessageDTO;
}
interface ConversationMessageDeltaEvent {
    readonly type: 'message_delta';
    readonly conversationId: string;
    readonly cwd: string;
    readonly messageId: string;
    readonly delta: QaapAgentMessageWireDelta;
}
export type ConversationLiveMessageEvent = ConversationMessageEvent | ConversationMessageDeltaEvent;
interface ConversationDeletedEvent {
    readonly type: 'deleted';
    readonly conversationId: string;
    readonly cwd: string;
}
interface ConversationParallelRunEvent {
    readonly type: 'parallel-run';
    readonly runId: string;
    readonly variants: import('../common/qaap-parallel-run-client').QaapParallelRunVariantStatsDTO[];
}
interface ConversationSnapshotEvent {
    readonly type: 'snapshot';
    readonly groups: ReadonlyArray<{
        readonly cwd: string;
        readonly conversations: ReadonlyArray<QaapAgentConversationSummaryDTO>;
    }>;
}
type ConversationServerEvent =
    | ConversationSnapshotEvent
    | ConversationCreatedEvent
    | ConversationMessageEvent
    | ConversationMessageDeltaEvent
    | ConversationDeletedEvent
    | ConversationParallelRunEvent
    | { readonly type: 'pong' };

/**
 * Cross-project live view of agent conversations on the VPS. The Projects panel subscribes to
 * {@link onDidChange} to refresh card listings and streaming dots as turns start and complete on
 * any project, without polling.
 */
@injectable()
export class MobileProjectsConversations {

    protected readonly byCwd = new Map<string, QaapAgentConversationSummaryDTO[]>();
    protected readonly theiaByCwd = new Map<string, QaapAgentConversationSummaryDTO[]>();
    protected readonly theiaSessionFiles = new Map<string, URI>();
    protected source: EventSource | undefined;
    protected socket: WebSocket | undefined;
    protected transport: 'ws' | 'sse' | 'none' = 'none';
    protected sseReconnectHandle: number | undefined;
    protected wsReconnectHandle: number | undefined;
    protected wsReconnectAttempt = 0;
    protected liveCancelDispose: Disposable = Disposable.NULL;
    protected readonly streamMetrics = new QaapConversationStreamMetricsCollector('client');
    protected started = false;
    protected visibilityListenerInstalled = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever conversation state on the server changes (any project). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly onDidReceiveMessageEmitter = new Emitter<ConversationLiveMessageEvent>();
    /** Fires on each live SSE message chunk — includes structured segments for QAIQ/OpenCode. */
    readonly onDidReceiveMessage: Event<ConversationLiveMessageEvent> = this.onDidReceiveMessageEmitter.event;

    protected readonly onDidReceiveParallelRunEmitter = new Emitter<ConversationParallelRunEvent>();
    /** Fires when parallel-run variant diff stats change on the VPS. */
    readonly onDidReceiveParallelRun: Event<ConversationParallelRunEvent> = this.onDidReceiveParallelRunEmitter.event;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    /** Idempotent — opens the WebSocket (SSE fallback) feed the first time it is called. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.liveCancelDispose = registerConversationLiveCancel(id => this.cancelConversationLive(id));
        this.openWebSocket();
        this.installVisibilityReconnect();
    }

    /** iOS Safari suspends EventSource in background tabs — reconnect when the page is visible again. */
    protected installVisibilityReconnect(): void {
        if (this.visibilityListenerInstalled || typeof document === 'undefined' || typeof window === 'undefined') {
            return;
        }
        this.visibilityListenerInstalled = true;
        const reconnect = (): void => {
            if (document.visibilityState !== 'visible') {
                return;
            }
            this.closeWebSocket();
            this.closeSse();
            this.clearReconnectTimers();
            this.openWebSocket();
        };
        document.addEventListener('visibilitychange', reconnect);
        window.addEventListener('pageshow', reconnect);
    }

    /** Conversations for one project cwd, sorted newest first. */
    getConversationsForCwd(cwd: string): QaapAgentConversationSummaryDTO[] {
        return sortConversations([
            ...(lookupByCwd(this.theiaByCwd, cwd) ?? []),
            ...(lookupByCwd(this.byCwd, cwd) ?? []),
        ]);
    }

    /** True when any conversation in any project is currently streaming a turn. */
    getStreamingCountForCwd(cwd: string): number {
        return this.getConversationsForCwd(cwd).reduce((n, c) => n + (c.status === 'streaming' ? 1 : 0), 0);
    }

    /**
     * Parallel-run variant conversations live in a tmpdir worktree (so their own cwd won't match
     * the repo), but carry `parallelBaseCwd` pointing at the originating repo. This returns the
     * variants whose base equals {@link baseCwd} so they can be grouped under that repo in Chats.
     */
    getVariantsForBaseCwd(baseCwd: string): QaapAgentConversationSummaryDTO[] {
        const normalized = normalizeCwd(baseCwd);
        const variants: QaapAgentConversationSummaryDTO[] = [];
        for (const [, conversations] of this.byCwd) {
            for (const conversation of conversations) {
                if (conversation.parallelBaseCwd && normalizeCwd(conversation.parallelBaseCwd) === normalized) {
                    variants.push(conversation);
                }
            }
        }
        return sortConversations(variants);
    }

    /**
     * Match conversations when the panel only knows repo identity (a GitHub card without a local
     * cwd yet). Mirrors the heuristic used by {@link MobileProjectsActiveTasks}.
     */
    findConversationsForProject(project: {
        readonly name: string;
        readonly github?: { readonly owner: string; readonly name: string };
    }): QaapAgentConversationSummaryDTO[] {
        const merged: QaapAgentConversationSummaryDTO[] = [];
        for (const [cwd, conversations] of this.getAllConversationBuckets()) {
            if (cwdMatchesProject(cwd, project)) {
                merged.push(...conversations);
            }
        }
        return sortConversations(merged);
    }

    /**
     * Reads Theia's real persisted AI chat sessions for the listed project cwds. These are the
     * same sessions shown as "Recent Chats" in the workspace Chat welcome view, stored under
     * `$CONFIGDIR/workspace-metadata/<workspace-uuid>/chatSessions`.
     */
    async refreshTheiaChatSessionsForProjects(_projects: ReadonlyArray<{
        readonly name: string;
        readonly uri?: URI;
        readonly github?: { readonly owner: string; readonly name: string };
        readonly isCurrent?: boolean;
    }>): Promise<void> {
        // Qaap product: Work Hub uses VPS QAIQ conversations only — do not merge Theia Coder sessions.
        this.theiaByCwd.clear();
        this.theiaSessionFiles.clear();
    }

    protected resolveWorkspaceMetadataCwd(
        project: { readonly name: string; readonly uri?: URI; readonly github?: { readonly owner: string; readonly name: string } },
        workspaceIndex: Record<string, string>,
    ): string | undefined {
        const fromUri = project.uri?.scheme === 'file' ? normalizeCwd(uriToFsPath(project.uri)) : undefined;
        if (fromUri && workspaceIndex[fromUri]) {
            return fromUri;
        }
        const candidates = Object.keys(workspaceIndex).map(normalizeCwd);
        const byExactName = candidates.find(cwd => cwdBaseName(cwd) === project.name.toLowerCase());
        if (byExactName) {
            return byExactName;
        }
        if (project.github) {
            const repoPath = `${project.github.owner}/${project.github.name}`.toLowerCase();
            const byGithubPath = candidates.find(cwd => {
                const normalized = cwd.toLowerCase();
                return normalized.endsWith(`/${repoPath}`)
                    || normalized.endsWith(`/repos/${repoPath}`)
                    || cwdBaseName(normalized) === project.github!.name.toLowerCase();
            });
            if (byGithubPath) {
                return byGithubPath;
            }
        }
        return fromUri;
    }

    async getTheiaConversation(id: string): Promise<QaapAgentConversationDTO | undefined> {
        const file = this.theiaSessionFiles.get(id);
        if (!file) {
            return undefined;
        }
        const data = await this.readJson<TheiaSerializedChatData>(file);
        if (!data) {
            return undefined;
        }
        const summary = this.findTheiaSummary(id);
        const cwd = summary?.cwd ?? '';
        return {
            id,
            cwd,
            agentId: data.pinnedAgentId ?? 'chat',
            title: data.title ?? summary?.title ?? 'Chat',
            status: 'idle',
            createdAt: data.saveDate,
            updatedAt: data.saveDate,
            messages: theiaMessagesToConversationMessages(data),
        };
    }

    async getTheiaSerializedConversation(id: string): Promise<unknown | undefined> {
        const file = this.theiaSessionFiles.get(id);
        return file ? this.readJson<unknown>(file) : undefined;
    }

    async findTheiaSerializedConversationBySessionId(sessionId: string, cwd?: string): Promise<unknown | undefined> {
        const normalizedCwd = cwd ? normalizeCwd(cwd) : undefined;
        for (const [id, file] of this.theiaSessionFiles) {
            const summary = this.findTheiaSummary(id);
            if (summary?.sessionId !== sessionId) {
                continue;
            }
            if (normalizedCwd && summary.cwd && normalizeCwd(summary.cwd) !== normalizedCwd) {
                continue;
            }
            return this.readJson<unknown>(file);
        }
        return undefined;
    }

    /** Optimistic update after a synchronous POST returns, before SSE catches up. */
    recordSnapshot(conv: QaapAgentConversationSummaryDTO): void {
        this.upsert(conv);
        this.onDidChangeEmitter.fire();
    }

    /** Latest summary row for a conversation id (VPS or Theia-backed). */
    findSummaryById(id: string): QaapAgentConversationSummaryDTO | undefined {
        for (const list of this.byCwd.values()) {
            const found = list.find(c => c.id === id);
            if (found) {
                return found;
            }
        }
        for (const list of this.theiaByCwd.values()) {
            const found = list.find(c => c.id === id || c.sessionId === id);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    /** Optimistic update after deleting a conversation before SSE/storage refresh catches up. */
    removeSnapshot(conversationId: string, cwd: string, source?: QaapAgentConversationSummaryDTO['source']): void {
        const map = source === 'theia-chat' ? this.theiaByCwd : this.byCwd;
        const normalized = normalizeCwd(cwd);
        const list = map.get(normalized);
        if (!list) {
            return;
        }
        const next = list.filter(c => c.id !== conversationId && c.sessionId !== conversationId);
        if (next.length === 0) {
            map.delete(normalized);
        } else {
            map.set(normalized, next);
        }
        this.onDidChangeEmitter.fire();
    }

    protected async primeFromAll(): Promise<void> {
        try {
            const groups = await listAllConversationGroups();
            this.applyConversationGroups(groups);
        } catch {
            /* live feed will reconcile */
        }
    }

    protected applyConversationGroups(
        groups: ReadonlyArray<{ readonly cwd: string; readonly conversations: ReadonlyArray<QaapAgentConversationSummaryDTO> }>,
    ): void {
        const next = new Map<string, QaapAgentConversationSummaryDTO[]>();
        for (const group of groups) {
            next.set(normalizeCwd(group.cwd), sortConversations([...group.conversations]));
        }
        this.byCwd.clear();
        for (const [cwd, list] of next) {
            this.byCwd.set(cwd, list);
        }
        this.onDidChangeEmitter.fire();
    }

    protected async cancelConversationLive(id: string): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ op: 'cancel', conversationId: id }));
            const existing = this.findSummaryById(id);
            if (existing?.status === 'streaming') {
                this.recordSnapshot({ ...existing, status: 'idle', updatedAt: Date.now() });
            }
            return;
        }
        await cancelConversationHttp(id);
    }

    protected openWebSocket(): void {
        if (typeof WebSocket === 'undefined') {
            this.openSseStream();
            void this.primeFromAll();
            return;
        }
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        try {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(`${proto}//${window.location.host}${QAAP_AGENT_CONVERSATION_WS_PATH}`);
            this.socket = socket;

            socket.addEventListener('open', () => {
                this.wsReconnectAttempt = 0;
                this.transport = 'ws';
                this.closeSse();
                for (const list of this.byCwd.values()) {
                    for (const conversation of list) {
                        if (conversation.status === 'streaming') {
                            this.streamMetrics.setTransport(conversation.id, 'ws');
                        }
                    }
                }
            });

            socket.addEventListener('message', ev => {
                try {
                    this.dispatchServerPayload(JSON.parse(String(ev.data)) as ConversationServerEvent);
                } catch {
                    /* drop malformed payload */
                }
            });

            socket.addEventListener('close', () => {
                this.socket = undefined;
                if (this.transport === 'ws') {
                    this.transport = 'none';
                }
                this.openSseStream();
                this.scheduleWebSocketReconnect();
            });

            socket.addEventListener('error', () => socket.close());
        } catch {
            this.openSseStream();
            void this.primeFromAll();
        }
    }

    protected openSseStream(): void {
        if (this.transport === 'ws' || typeof EventSource === 'undefined' || this.source) {
            return;
        }
        try {
            const source = new EventSource(STREAM_URL);
            this.source = source;
            this.transport = 'sse';
            for (const list of this.byCwd.values()) {
                for (const conversation of list) {
                    if (conversation.status === 'streaming') {
                        this.streamMetrics.setTransport(conversation.id, 'sse');
                    }
                }
            }
            source.addEventListener('created', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('updated', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('message', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('message_delta', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('deleted', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('parallel-run', ev => this.dispatchSseEvent(ev as MessageEvent));
            source.addEventListener('error', () => this.scheduleSseReconnect());
        } catch {
            this.scheduleSseReconnect();
        }
    }

    protected dispatchSseEvent(ev: MessageEvent): void {
        try {
            this.dispatchServerPayload(JSON.parse(ev.data) as ConversationServerEvent);
        } catch {
            /* drop malformed payload */
        }
    }

    protected dispatchServerPayload(payload: ConversationServerEvent): void {
        switch (payload.type) {
            case 'snapshot':
                this.applyConversationGroups(payload.groups);
                return;
            case 'created':
            case 'updated':
                this.upsert(payload.conversation);
                this.recordClientStreamMetrics(payload);
                this.onDidChangeEmitter.fire();
                return;
            case 'message':
                void this.dispatchLiveMessage(payload);
                return;
            case 'message_delta':
                void this.dispatchLiveMessageDelta(payload);
                return;
            case 'deleted': {
                const cwd = normalizeCwd(payload.cwd);
                const list = this.byCwd.get(cwd);
                if (!list) {
                    return;
                }
                const next = list.filter(c => c.id !== payload.conversationId);
                if (next.length === 0) {
                    this.byCwd.delete(cwd);
                } else {
                    this.byCwd.set(cwd, next);
                }
                this.onDidChangeEmitter.fire();
                return;
            }
            case 'parallel-run':
                this.onDidReceiveParallelRunEmitter.fire(payload);
                return;
            case 'pong':
                return;
            default:
                return;
        }
    }

    protected scheduleWebSocketReconnect(): void {
        if (this.wsReconnectHandle !== undefined || typeof WebSocket === 'undefined') {
            return;
        }
        const delay = Math.min(WS_RECONNECT_MAX_MS, 1_000 * (2 ** this.wsReconnectAttempt));
        this.wsReconnectAttempt++;
        this.wsReconnectHandle = window.setTimeout(() => {
            this.wsReconnectHandle = undefined;
            this.openWebSocket();
        }, delay);
    }

    protected scheduleSseReconnect(): void {
        if (this.sseReconnectHandle !== undefined || this.transport === 'ws') {
            return;
        }
        this.closeSse();
        this.sseReconnectHandle = window.setTimeout(() => {
            this.sseReconnectHandle = undefined;
            this.openSseStream();
            void this.primeFromAll();
        }, SSE_RECONNECT_DELAY_MS);
    }

    protected closeWebSocket(): void {
        this.socket?.close();
        this.socket = undefined;
        if (this.transport === 'ws') {
            this.transport = 'none';
        }
    }

    protected closeSse(): void {
        this.source?.close();
        this.source = undefined;
        if (this.transport === 'sse') {
            this.transport = 'none';
        }
    }

    protected clearReconnectTimers(): void {
        if (this.sseReconnectHandle !== undefined) {
            window.clearTimeout(this.sseReconnectHandle);
            this.sseReconnectHandle = undefined;
        }
        if (this.wsReconnectHandle !== undefined) {
            window.clearTimeout(this.wsReconnectHandle);
            this.wsReconnectHandle = undefined;
        }
    }

    protected async dispatchLiveMessage(payload: ConversationMessageEvent): Promise<void> {
        try {
            const message = await expandAgentMessageForWire(payload.message);
            const expanded: ConversationMessageEvent = message === payload.message
                ? payload
                : { ...payload, message };
            this.recordClientStreamMetrics(payload, expanded);
            this.onDidReceiveMessageEmitter.fire(expanded);
            this.refreshSummaryFromLiveMessage(expanded);
        } catch {
            /* drop payloads the browser cannot decompress */
        }
    }

    protected async dispatchLiveMessageDelta(payload: ConversationMessageDeltaEvent): Promise<void> {
        try {
            const delta = await expandAgentMessageWireDelta(payload.delta);
            const expanded: ConversationMessageDeltaEvent = delta === payload.delta
                ? payload
                : { ...payload, delta };
            this.recordClientStreamMetrics(payload, expanded);
            this.onDidReceiveMessageEmitter.fire(expanded);
            this.refreshSummaryFromLiveDelta(expanded);
        } catch {
            /* drop payloads the browser cannot decompress */
        }
    }

    protected recordClientStreamMetrics(
        wirePayload: ConversationServerEvent,
        expandedPayload?: ConversationServerEvent,
    ): void {
        if (wirePayload.type !== 'message'
            && wirePayload.type !== 'message_delta'
            && wirePayload.type !== 'updated') {
            return;
        }
        const conversationId = wirePayload.type === 'updated'
            ? wirePayload.conversation.id
            : wirePayload.type === 'message' || wirePayload.type === 'message_delta'
                ? wirePayload.conversationId
                : undefined;
        if (!conversationId) {
            return;
        }
        if (wirePayload.type === 'updated' && wirePayload.conversation.status === 'streaming') {
            this.streamMetrics.setTransport(conversationId, this.transport === 'ws' ? 'ws' : 'sse');
        }
        this.streamMetrics.recordWireEvent(conversationId, wirePayload.type, wirePayload, {
            uncompressedPayload: expandedPayload,
            compressedFieldCount: countCompressedWireFields(wirePayload),
        });
        if (wirePayload.type === 'updated' && wirePayload.conversation.status !== 'streaming') {
            logQaapStreamMetrics(this.streamMetrics.finishTurn(conversationId));
        }
    }

    protected refreshSummaryFromLiveMessage(payload: ConversationMessageEvent): void {
        const list = lookupByCwd(this.byCwd, payload.cwd) ?? [];
        const existing = list.find(c => c.id === payload.conversationId);
        if (!existing) {
            this.onDidChangeEmitter.fire();
            return;
        }
        const updated: QaapAgentConversationSummaryDTO = {
            ...existing,
            updatedAt: Math.max(existing.updatedAt, payload.message.createdAt),
            messageCount: payload.message.role === existing.lastMessageRole
                ? existing.messageCount
                : existing.messageCount + 1,
            lastMessagePreview: excerpt(resolveMessagePreviewText(payload.message)),
            lastMessageRole: payload.message.role,
        };
        this.upsert(updated);
        this.onDidChangeEmitter.fire();
    }

    protected refreshSummaryFromLiveDelta(payload: ConversationMessageDeltaEvent): void {
        const list = lookupByCwd(this.byCwd, payload.cwd) ?? [];
        const existing = list.find(c => c.id === payload.conversationId);
        if (!existing) {
            this.onDidChangeEmitter.fire();
            return;
        }
        const previewDelta = this.resolvePreviewDelta(payload.delta);
        const updated: QaapAgentConversationSummaryDTO = {
            ...existing,
            updatedAt: Date.now(),
            ...(previewDelta
                ? { lastMessagePreview: excerpt(`${existing.lastMessagePreview ?? ''}${previewDelta}`) }
                : {}),
        };
        this.upsert(updated);
        this.onDidChangeEmitter.fire();
    }

    protected resolvePreviewDelta(delta: QaapAgentMessageWireDelta): string | undefined {
        switch (delta.kind) {
            case 'append_content':
            case 'append_segment_text':
                return delta.text;
            case 'message_start':
            case 'replace':
                return resolveMessagePreviewText(delta.message);
            case 'patch_tool':
            case 'append_segment':
            case 'noop':
                return undefined;
            default: {
                const exhaustive: never = delta;
                return exhaustive;
            }
        }
    }

    protected upsert(conv: QaapAgentConversationSummaryDTO): void {
        const cwd = normalizeCwd(conv.cwd);
        const list = [...(this.byCwd.get(cwd) ?? [])];
        const index = list.findIndex(c => c.id === conv.id);
        if (index >= 0) {
            list[index] = conv;
        } else {
            list.unshift(conv);
        }
        this.byCwd.set(cwd, sortConversations(list));
    }

    protected getAllConversationBuckets(): Array<[string, QaapAgentConversationSummaryDTO[]]> {
        const buckets = new Map<string, QaapAgentConversationSummaryDTO[]>();
        for (const [cwd, list] of this.theiaByCwd) {
            buckets.set(cwd, [...list]);
        }
        for (const [cwd, list] of this.byCwd) {
            buckets.set(cwd, sortConversations([...(buckets.get(cwd) ?? []), ...list]));
        }
        return [...buckets];
    }

    protected findTheiaSummary(id: string): QaapAgentConversationSummaryDTO | undefined {
        for (const list of this.theiaByCwd.values()) {
            const found = list.find(c => c.id === id);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    protected async readJson<T>(uri: URI): Promise<T | undefined> {
        try {
            const content = await this.fileService.readFile(uri);
            return JSON.parse(bufferToString(content.value)) as T;
        } catch {
            return undefined;
        }
    }
}

function sortConversations(list: QaapAgentConversationSummaryDTO[]): QaapAgentConversationSummaryDTO[] {
    return [...list].sort((a, b) => {
        const aStreaming = a.status === 'streaming' ? 1 : 0;
        const bStreaming = b.status === 'streaming' ? 1 : 0;
        if (aStreaming !== bStreaming) {
            return bStreaming - aStreaming;
        }
        return b.updatedAt - a.updatedAt;
    });
}

function cwdBaseName(cwd: string): string {
    return normalizeCwd(cwd).split('/').pop()?.toLowerCase() ?? '';
}

function uriToFsPath(uri: URI): string {
    const raw = uri.path.toString();
    if (/^\/[A-Za-z]:/.test(raw)) {
        return raw.slice(1);
    }
    return raw;
}

function excerpt(text: string | undefined): string {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

interface TheiaSerializedChatData {
    readonly title?: string;
    readonly pinnedAgentId?: string;
    readonly saveDate: number;
    readonly model: {
        readonly requests?: ReadonlyArray<{ readonly id: string; readonly text?: string }>;
        readonly responses?: ReadonlyArray<TheiaSerializedChatResponse>;
    };
}

interface TheiaSerializedChatResponse {
    readonly requestId: string;
    readonly content?: ReadonlyArray<TheiaSerializedChatResponsePart>;
}

interface TheiaSerializedChatResponsePart {
    readonly kind: string;
    readonly fallbackMessage?: string;
    readonly data?: { readonly content?: string; readonly code?: string };
}

function theiaMessagesToConversationMessages(data: TheiaSerializedChatData): QaapAgentMessageDTO[] {
    const responsesByRequestId = new Map((data.model.responses ?? []).map(response => [response.requestId, response]));
    const messages: QaapAgentMessageDTO[] = [];
    let offset = 0;
    for (const request of data.model.requests ?? []) {
        const userText = request.text ? normalizeAgentMessageContentForDisplay(request.text).trim() : '';
        if (userText) {
            messages.push({
                id: `${request.id}:user`,
                role: 'user',
                content: userText,
                createdAt: data.saveDate + offset++,
            });
        }
        const responseText = normalizeAgentMessageContentForDisplay(responseToText(responsesByRequestId.get(request.id))).trim();
        if (responseText) {
            messages.push({
                id: `${request.id}:agent`,
                role: 'agent',
                content: responseText,
                createdAt: data.saveDate + offset++,
            });
        }
    }
    return messages;
}

function responseToText(response: TheiaSerializedChatResponse | undefined): string {
    if (!response?.content) {
        return '';
    }
    return response.content
        .map(part => part.data?.content ?? part.data?.code ?? part.fallbackMessage ?? '')
        .filter(Boolean)
        .join('\n\n');
}

function bufferToString(buffer: BinaryBuffer | { toString(): string }): string {
    return buffer.toString();
}
