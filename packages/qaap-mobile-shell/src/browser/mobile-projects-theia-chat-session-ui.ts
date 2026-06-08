// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { generateUuid } from '@theia/core/lib/common/uuid';
import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { GenericCapabilitySelections } from '@theia/ai-core';
import {
    ChatAgent,
    ChatAgentService,
    ChatRequestModel,
    ChatService,
    ChatSession,
    MutableChatModel,
} from '@theia/ai-chat';
import type { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { Widget as LuminoWidget } from '@lumino/widgets';
import {
    getConversation,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    extractBackendAgentMention,
    isTheiaCoderMention,
    migrateLegacyBackendAgentId,
    normalizeBackendAgentId,
    QAIQ_AGENT_ID,
    readStoredAgent,
    stripNonCoderAgentMention,
    THEIA_CODER_AGENT_ID,
    writeStoredAgent,
} from '../common/qaap-agent-task-client';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';

interface RestorableTheiaChatData {
    readonly title?: string;
    readonly pinnedAgentId?: string;
    readonly saveDate?: number;
    readonly model: ConstructorParameters<typeof MutableChatModel>[0] & {
        readonly sessionId: string;
        readonly requests: unknown[];
        readonly responses: unknown[];
    };
}

function isRestorableTheiaChatData(candidate: unknown): candidate is RestorableTheiaChatData {
    const data = candidate as Partial<RestorableTheiaChatData> | undefined;
    const model = data?.model as Partial<RestorableTheiaChatData['model']> | undefined;
    return !!model
        && typeof model.sessionId === 'string'
        && Array.isArray(model.requests)
        && Array.isArray(model.responses);
}

/** Panel surface for Theia local-chat session restore, fork, and legacy transcript input mount. */
export interface MobileProjectsTheiaChatSessionHost {
    chatService: ChatService | undefined;
    chatAgentService: ChatAgentService | undefined;
    conversations: MobileProjectsConversations | undefined;
    projectsService: MobileProjectsService;
    createChatInputWidget: ((id: string) => Promise<AIChatInputWidget>) | undefined;
    transcriptChatInputWidget: AIChatInputWidget | undefined;
    transcriptSheet: HTMLElement | undefined;
    agentChatInputMountSeq: number;
    messageService: MessageService | undefined;

    chatAgentForBackendId(agentId: string | undefined): ChatAgent | undefined;
    ensureAgentChatSession(cwd?: string): ChatSession;
}

/** Theia ChatService session restore/fork and pinned-agent resolution for local chat rows. */
export class MobileProjectsTheiaChatSessionUi {

    constructor(protected readonly host: MobileProjectsTheiaChatSessionHost) { }

    /** Local chat always routes to Coder — strip VPS @mentions and ensure a Coder prefix. */
    formatTheiaChatRequestText(content: string, _pinnedAgentId?: string): string {
        const cleaned = stripNonCoderAgentMention(content);
        if (isTheiaCoderMention(cleaned)) {
            return cleaned;
        }
        return `@${THEIA_CODER_AGENT_ID} ${cleaned}`;
    }

    async getOrRestoreProjectChatSession(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.host.chatService || !summary.sessionId) {
            return undefined;
        }
        const existing = this.host.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        if (summary.source === 'theia-chat' || summary.id.startsWith('theia-chat:')) {
            const fromProjects = await this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
            if (fromProjects) {
                return fromProjects;
            }
        }
        const restored = await this.host.chatService.getOrRestoreSession(summary.sessionId);
        return restored ?? this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
    }

    async forkTheiaConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.host.chatService || !this.host.conversations || !summary.sessionId) {
            return undefined;
        }

        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const existing = await this.getOrRestoreProjectChatSession(project, summary);
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.host.conversations.getTheiaSerializedConversation(summary.id)
            : await this.host.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
            ?? await this.host.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        const baseData: RestorableTheiaChatData | undefined = isRestorableTheiaChatData(raw)
            ? raw
            : existing
                ? {
                    title: existing.title,
                    pinnedAgentId: existing.pinnedAgent?.id,
                    saveDate: existing.lastInteraction?.getTime() ?? Date.now(),
                    model: existing.model.toSerializable() as RestorableTheiaChatData['model'],
                }
                : undefined;
        if (!baseData) {
            return undefined;
        }

        const sessionId = generateUuid();
        const serializedModel = JSON.parse(JSON.stringify(baseData.model)) as RestorableTheiaChatData['model'];
        (serializedModel as { sessionId: string }).sessionId = sessionId;

        const model = new MutableChatModel(serializedModel);
        const service = this.host.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
            saveSession?: (sessionId: string) => Promise<void>;
        };
        await service.restoreSessionData?.(model, serializedModel);

        const title = nls.localize(
            'qaap/mobileProjects/forkedTaskTitle',
            '{0} fork',
            baseData.title ?? summary.title ?? project.name
        );
        const pinnedAgentId = baseData.pinnedAgentId ?? existing?.pinnedAgent?.id;
        const session: ChatSession = {
            id: sessionId,
            title,
            lastInteraction: new Date(),
            model,
            isActive: false,
            pinnedAgent: pinnedAgentId ? this.host.chatAgentService?.getAgent(pinnedAgentId) : existing?.pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        await service.saveSession?.(session.id);
        this.host.chatService.setActiveSession(session.id, { focus: false });
        return session;
    }

    async restoreTheiaChatSessionFromProjectsStorage(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.host.chatService || !summary.sessionId || !this.host.conversations) {
            return undefined;
        }
        const existing = this.host.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.host.conversations.getTheiaSerializedConversation(summary.id)
            : await this.host.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
            ?? await this.host.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        if (!isRestorableTheiaChatData(raw)) {
            return undefined;
        }

        const model = new MutableChatModel(raw.model);
        const service = this.host.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
        };
        await service.restoreSessionData?.(model, raw.model);
        const pinnedAgent = raw.pinnedAgentId ? this.host.chatAgentService?.getAgent(raw.pinnedAgentId) : undefined;
        const session: ChatSession = {
            id: summary.sessionId,
            title: raw.title ?? summary.title,
            lastInteraction: new Date(raw.saveDate ?? summary.updatedAt),
            model,
            isActive: false,
            pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        return session;
    }

    async getChatServiceConversation(summary: QaapAgentConversationSummaryDTO): Promise<QaapAgentConversationDTO | undefined> {
        const sessionId = summary.sessionId;
        if (!sessionId || !this.host.chatService) {
            return undefined;
        }
        const session = await this.host.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return undefined;
        }
        const messages: QaapAgentConversationDTO['messages'] = [];
        let offset = 0;
        for (const request of session.model.getRequests()) {
            const userText = request.request.text?.trim();
            if (userText) {
                messages.push({
                    id: `${request.id}:user`,
                    role: 'user',
                    content: userText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
            const agentText = request.response.response.asString().trim();
            if (agentText) {
                messages.push({
                    id: `${request.id}:agent`,
                    role: 'agent',
                    content: agentText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
        }
        return {
            id: summary.id,
            cwd: summary.cwd,
            agentId: session.pinnedAgent?.id ?? summary.agentId,
            title: summary.title,
            status: 'idle',
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages,
        };
    }

    async mountTranscriptChatInput(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
        submit: (content: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections, widget?: AIChatInputWidget) => Promise<void>,
    ): Promise<void> {
        if (!this.host.createChatInputWidget || !this.host.chatService) {
            host.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            return;
        }
        if (this.host.transcriptChatInputWidget && !this.host.transcriptChatInputWidget.isDisposed) {
            this.host.transcriptChatInputWidget.dispose();
        }
        this.host.transcriptChatInputWidget = undefined;

        const uniqueId = `transcript-${project.id}-${summary.id}-${++this.host.agentChatInputMountSeq}-${Date.now()}`;
        let widget: AIChatInputWidget;
        try {
            widget = await this.host.createChatInputWidget(uniqueId);
        } catch (error) {
            console.error('[qaap-mobile-projects] transcript createChatInputWidget threw:', error);
            host.textContent = `Agent input failed to load: ${error instanceof Error ? error.message : String(error)}`;
            return;
        }
        widget.id = `mobile-projects-transcript-chat-input-${uniqueId}`;
        if (!this.host.transcriptSheet || !host.isConnected) {
            widget.dispose();
            return;
        }

        host.replaceChildren();
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add('chat-input-widget', 'theia-mobile-projects-real-agent-input');
        widget.show();

        const restoredSession = summary.sessionId && summary.id.startsWith('theia-chat')
            ? await this.host.chatService.getOrRestoreSession(summary.sessionId)
            : undefined;
        const session = restoredSession ?? this.host.ensureAgentChatSession(summary.cwd);
        widget.chatModel = session.model;
        const convMessages = summary.source === 'theia-chat'
            ? (await this.host.conversations?.getTheiaConversation(summary.id))?.messages
            : (await getConversation(summary.id).catch(() => undefined))?.messages;
        this.applyTranscriptPinnedAgent(summary, session, widget, convMessages);
        widget.initialValue = '';
        widget.setEnabled(true);
        widget.onQuery = async (query: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections) => {
            const cleaned = query.trim();
            if (!cleaned) {
                return;
            }
            try {
                await submit(cleaned, modeId, capabilityOverrides, genericCapabilitySelections, widget);
                widget.clearPendingImageAttachments();
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                this.host.messageService?.error(nls.localize(
                    'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                ));
            }
        };
        widget.onCancel = (requestModel: ChatRequestModel) => {
            void this.host.chatService?.cancelRequest(requestModel.session.id, requestModel.id);
        };
        widget.onUnpin = () => {
            session.pinnedAgent = undefined;
            widget.pinnedAgent = undefined;
        };
        widget.onDeleteChangeSet = ((sessionId: string) => {
            this.host.chatService?.deleteChangeSet(sessionId);
        }) as unknown as (requestModel: ChatRequestModel) => void;
        widget.onDeleteChangeSetElement = ((sessionId: string, uri: Parameters<ChatService['deleteChangeSetElement']>[1]) => {
            this.host.chatService?.deleteChangeSetElement(sessionId, uri);
        }) as unknown as (requestModel: ChatRequestModel, index: number) => void;

        this.host.transcriptChatInputWidget = widget;
        widget.activate();
        widget.update();
    }

    protected inferBackendAgentIdFromChatSession(session: ChatSession): string | undefined {
        let lastMention: string | undefined;
        for (const request of session.model.getRequests()) {
            const mentioned = extractBackendAgentMention(request.request.text ?? '');
            if (mentioned) {
                lastMention = mentioned;
            }
        }
        if (lastMention) {
            return lastMention;
        }
        const pinned = migrateLegacyBackendAgentId(session.pinnedAgent?.id);
        if (pinned && pinned !== 'chat' && (normalizeBackendAgentId(pinned) || pinned === QAIQ_AGENT_ID)) {
            return pinned;
        }
        return undefined;
    }

    protected inferBackendAgentIdFromMessages(
        messages: ReadonlyArray<{ readonly content?: string }> | undefined,
    ): string | undefined {
        if (!messages?.length) {
            return undefined;
        }
        let last: string | undefined;
        for (const message of messages) {
            const mentioned = extractBackendAgentMention(message.content ?? '');
            if (mentioned) {
                last = mentioned;
            }
        }
        return last;
    }

    protected resolveBackendAgentIdForTranscript(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): string | undefined {
        if (summary.source === 'theia-chat') {
            return THEIA_CODER_AGENT_ID;
        }
        if (session) {
            const fromSession = this.inferBackendAgentIdFromChatSession(session);
            if (fromSession) {
                return fromSession;
            }
        }
        const fromMessages = this.inferBackendAgentIdFromMessages(messages);
        if (fromMessages) {
            return fromMessages;
        }
        const fromTitle = extractBackendAgentMention(summary.title ?? '');
        if (fromTitle) {
            return fromTitle;
        }
        const fromSummary = migrateLegacyBackendAgentId(summary.agentId?.trim());
        if (fromSummary && fromSummary !== 'chat' && normalizeBackendAgentId(fromSummary)) {
            return fromSummary;
        }
        return readStoredAgent(summary.cwd);
    }

    protected resolveTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        return this.host.chatAgentForBackendId(this.resolveBackendAgentIdForTranscript(summary, session, messages));
    }

    protected applyTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session: ChatSession,
        inputWidget?: AIChatInputWidget,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        const agent = this.resolveTranscriptPinnedAgent(summary, session, messages);
        if (!agent) {
            return undefined;
        }
        session.pinnedAgent = agent;
        if (inputWidget) {
            inputWidget.pinnedAgent = agent;
        }
        if (summary.cwd) {
            writeStoredAgent(summary.cwd, agent.id);
        }
        return agent;
    }
}
