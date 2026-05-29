// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    QAAP_AGENT_CONVERSATION_API_PATH,
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    QaapAgentMessageDTO,
    listAllConversationGroups,
} from '../common/qaap-agent-conversation-client';
import { buildConversationListMetrics } from '../common/qaap-agent-conversation-list-metrics';
import { cwdMatchesProject, lookupByCwd, normalizeCwd } from './mobile-projects-active-tasks';

const STREAM_URL = `${QAAP_AGENT_CONVERSATION_API_PATH}/stream`;
const RECONNECT_DELAY_MS = 5_000;

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
interface ConversationDeletedEvent {
    readonly type: 'deleted';
    readonly conversationId: string;
    readonly cwd: string;
}

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
    protected reconnectHandle: number | undefined;
    protected started = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever conversation state on the server changes (any project). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    /** Idempotent — opens the SSE stream the first time it is called. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        void this.primeFromAll();
        this.openStream();
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
    async refreshTheiaChatSessionsForProjects(projects: ReadonlyArray<{
        readonly name: string;
        readonly uri?: URI;
        readonly github?: { readonly owner: string; readonly name: string };
        readonly isCurrent?: boolean;
    }>): Promise<void> {
        try {
            const configRoot = new URI(await this.envServer.getConfigDirUri());
            const metadataRoot = configRoot.resolve('workspace-metadata');
            const workspaceIndex = await this.readJson<Record<string, string>>(metadataRoot.resolve('index.json'));
            if (!workspaceIndex) {
                this.theiaByCwd.clear();
                this.theiaSessionFiles.clear();
                return;
            }

            const next = new Map<string, QaapAgentConversationSummaryDTO[]>();
            const nextFiles = new Map<string, URI>();
            for (const project of projects) {
                const cwd = this.resolveWorkspaceMetadataCwd(project, workspaceIndex);
                if (!cwd) {
                    continue;
                }
                const uuid = workspaceIndex[cwd];
                if (!uuid) {
                    continue;
                }
                const chatRoot = metadataRoot.resolve(uuid).resolve('chatSessions');
                const chatIndex = await this.readJson<TheiaChatSessionIndex>(chatRoot.resolve('index.json'));
                if (!chatIndex) {
                    continue;
                }
                const summaries: QaapAgentConversationSummaryDTO[] = [];
                for (const metadata of Object.values(chatIndex)) {
                    if (!isTheiaChatMetadata(metadata)) {
                        continue;
                    }
                    const id = makeTheiaConversationId(cwd, metadata.sessionId);
                    const sessionFile = chatRoot.resolve(`${metadata.sessionId}.json`);
                    const detail = await this.readJson<TheiaSerializedChatData>(sessionFile);
                    const preview = detail ? previewFromTheiaChat(detail) : undefined;
                    const theiaMessages = detail ? theiaMessagesToConversationMessages(detail) : [];
                    const metrics = detail
                        ? buildConversationListMetrics({ status: 'idle', messages: theiaMessages })
                        : {};
                    summaries.push({
                        id,
                        source: 'theia-chat',
                        cwd,
                        workspacePath: cwd,
                        sessionId: metadata.sessionId,
                        agentId: detail?.pinnedAgentId ?? 'chat',
                        title: metadata.title || detail?.title || project.name,
                        status: 'idle',
                        createdAt: metadata.saveDate,
                        updatedAt: metadata.saveDate,
                        messageCount: detail ? countTheiaMessages(detail) : 0,
                        lastMessagePreview: preview,
                        lastMessageRole: preview ? 'user' : undefined,
                        ...metrics,
                    });
                    nextFiles.set(id, sessionFile);
                }
                if (summaries.length > 0) {
                    next.set(cwd, sortConversations(summaries));
                }
            }
            this.theiaByCwd.clear();
            for (const [cwd, summaries] of next) {
                this.theiaByCwd.set(cwd, summaries);
            }
            this.theiaSessionFiles.clear();
            for (const [id, file] of nextFiles) {
                this.theiaSessionFiles.set(id, file);
            }
        } catch {
            /* Workspace chat metadata is best-effort; VPS conversation stream still works. */
        }
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
            const next = new Map<string, QaapAgentConversationSummaryDTO[]>();
            for (const group of groups) {
                next.set(normalizeCwd(group.cwd), sortConversations([...group.conversations]));
            }
            this.byCwd.clear();
            for (const [cwd, list] of next) {
                this.byCwd.set(cwd, list);
            }
            this.onDidChangeEmitter.fire();
        } catch {
            /* SSE will reconcile */
        }
    }

    protected openStream(): void {
        if (typeof EventSource === 'undefined') {
            return;
        }
        try {
            const source = new EventSource(STREAM_URL);
            this.source = source;
            source.addEventListener('created', ev => this.onCreatedOrUpdated(ev as MessageEvent));
            source.addEventListener('updated', ev => this.onCreatedOrUpdated(ev as MessageEvent));
            source.addEventListener('message', ev => this.onMessageEvent(ev as MessageEvent));
            source.addEventListener('deleted', ev => this.onDeletedEvent(ev as MessageEvent));
            source.addEventListener('error', () => this.scheduleReconnect());
        } catch {
            this.scheduleReconnect();
        }
    }

    protected scheduleReconnect(): void {
        if (this.reconnectHandle !== undefined) {
            return;
        }
        this.source?.close();
        this.source = undefined;
        this.reconnectHandle = window.setTimeout(() => {
            this.reconnectHandle = undefined;
            this.openStream();
            void this.primeFromAll();
        }, RECONNECT_DELAY_MS);
    }

    protected onCreatedOrUpdated(ev: MessageEvent): void {
        try {
            const payload = JSON.parse(ev.data) as ConversationCreatedEvent;
            this.upsert(payload.conversation);
            this.onDidChangeEmitter.fire();
        } catch {
            /* drop malformed payload */
        }
    }

    protected onMessageEvent(ev: MessageEvent): void {
        try {
            const payload = JSON.parse(ev.data) as ConversationMessageEvent;
            // We don't store full transcripts here (transcript sheet fetches its own copy);
            // we just refresh the preview/updatedAt on the summary so the card reflects activity.
            const list = lookupByCwd(this.byCwd, payload.cwd) ?? [];
            const existing = list.find(c => c.id === payload.conversationId);
            if (!existing) {
                this.onDidChangeEmitter.fire();
                return;
            }
            const updated: QaapAgentConversationSummaryDTO = {
                ...existing,
                updatedAt: payload.message.createdAt,
                messageCount: payload.message.role === existing.lastMessageRole
                    ? existing.messageCount
                    : existing.messageCount + 1,
                lastMessagePreview: excerpt(payload.message.content),
                lastMessageRole: payload.message.role,
            };
            this.upsert(updated);
            this.onDidChangeEmitter.fire();
        } catch {
            /* drop malformed payload */
        }
    }

    protected onDeletedEvent(ev: MessageEvent): void {
        try {
            const payload = JSON.parse(ev.data) as ConversationDeletedEvent;
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
        } catch {
            /* drop */
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

function excerpt(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

interface TheiaChatSessionMetadata {
    readonly sessionId: string;
    readonly title: string;
    readonly saveDate: number;
    readonly location: string;
}

interface TheiaChatSessionIndex {
    readonly [sessionId: string]: TheiaChatSessionMetadata;
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

function isTheiaChatMetadata(candidate: unknown): candidate is TheiaChatSessionMetadata {
    const value = candidate as Partial<TheiaChatSessionMetadata> | undefined;
    return typeof value?.sessionId === 'string'
        && typeof value.title === 'string'
        && typeof value.saveDate === 'number';
}

function makeTheiaConversationId(cwd: string, sessionId: string): string {
    return `theia-chat:${encodeURIComponent(normalizeCwd(cwd))}:${encodeURIComponent(sessionId)}`;
}

function previewFromTheiaChat(data: TheiaSerializedChatData): string | undefined {
    const requests = data.model.requests ?? [];
    for (let i = requests.length - 1; i >= 0; i--) {
        const text = requests[i].text?.trim();
        if (text) {
            return excerpt(text);
        }
    }
    return undefined;
}

function countTheiaMessages(data: TheiaSerializedChatData): number {
    return (data.model.requests?.length ?? 0) + (data.model.responses?.filter(response => responseToText(response).trim()).length ?? 0);
}

function theiaMessagesToConversationMessages(data: TheiaSerializedChatData): QaapAgentMessageDTO[] {
    const responsesByRequestId = new Map((data.model.responses ?? []).map(response => [response.requestId, response]));
    const messages: QaapAgentMessageDTO[] = [];
    let offset = 0;
    for (const request of data.model.requests ?? []) {
        const userText = request.text?.trim();
        if (userText) {
            messages.push({
                id: `${request.id}:user`,
                role: 'user',
                content: userText,
                createdAt: data.saveDate + offset++,
            });
        }
        const responseText = responseToText(responsesByRequestId.get(request.id)).trim();
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
