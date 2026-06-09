// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatMode, ChatModel } from '@theia/ai-chat';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    conversationToSummary,
    getConversation,
    updateConversation,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    agentSupportsModelPicker,
    QAAP_PRIMARY_AGENT_ID,
    readStoredAgentModel,
    resolveExplicitAgentForSubmit,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
} from '../common/qaap-agent-task-client';
import { createComposerContextEntry } from '../common/qaap-composer-context-entry';
import { resolveTranscriptEffectiveStatus } from '../common/qaap-transcript-turn-status';
import type { MobileComposerAttachHandlers } from './qaap-mobile-composer-device-attach';
import {
    resolveChatModelContextUsageBreakdown,
    resolveVpsContextUsageBreakdown,
} from './qaap-chat-context-usage-panel';
import {
    buildUpdateConversationComposerPatch,
    clearConversationComposerDraft,
    extractConversationComposerPrefs,
    readConversationComposerDraft,
    writeConversationComposerDraft,
} from '../common/qaap-conversation-composer-prefs';
import {
    describeComposerInteractionMode,
    reconcileComposerModeId,
    resolveComposerModeLabel,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    agentSupportsApprovalPolicy,
    reconcileAgentApprovalPolicyId,
    resolveComposerAutoApprove,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    MAX_TRANSCRIPT_FOLLOW_UP_QUEUE,
    TranscriptFollowUpQueue,
    type TranscriptFollowUpEntry,
} from '../common/qaap-transcript-follow-up-queue';
import { isAgentsHubIdleConversationSummary } from '../common/qaap-agents-hub-landing';
import type { StickyComposerContextChipView } from './qaap-sticky-composer-context-ui';
import {
    composerContextRequests,
    disposeComposerContextEntries,
    hasPendingComposerContextEntries,
    revokeComposerContextPreview,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import type { StickyComposerTokenOption } from '../common/qaap-sticky-composer-mention';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import { MobileSnackbar } from './mobile-snackbar';
import {
    renderStickyComposerActivityStack,
} from './qaap-sticky-composer-activity-stack';

export interface TranscriptStickyComposerColumnOptions {
    project: MobileProjectEntry;
    surface?: string;
    agentLocked?: boolean;
    getContext: () => StickyComposerContextEntry[];
    clearContext: () => void;
    removeContextItem: (index: number) => void;
    formatContextChip: (item: StickyComposerContextEntry) => StickyComposerContextChipView;
    filesExpanded?: boolean;
    onFilesExpandedChange?: (expanded: boolean) => void;
    getDraft: () => string;
    setDraft: (value: string) => void;
    resolveAgentLabel: () => string;
    resolveAgentId: () => string;
    modes?: readonly ChatMode[];
    resolveModeLabel?: () => string;
    onOpenModeSheet?: (anchor: HTMLButtonElement) => void;
    approvalPolicyId?: QaapAgentApprovalPolicyId;
    onOpenApprovalPolicySheet?: (anchor: HTMLButtonElement) => void;
    canSubmit: boolean;
    isAgentWorking?: () => boolean;
    onStop?: () => void;
    onAttach: (anchor: HTMLElement) => void;
    onOpenAgentSheet: (anchor: HTMLButtonElement) => void;
    onSubmit: (draft: string) => void;
    sendLabel?: string;
    onSendControlMounted?: (refresh: () => void) => void;
    inputPlaceholder?: string;
    getMentionOptions?: () => readonly StickyComposerTokenOption[];
    getVariableOptions?: () => readonly StickyComposerTokenOption[];
    onContextUsageBadgeMounted?: (badge: HTMLElement) => void;
    showWorkspaceBar?: boolean;
    transcriptOverlay?: boolean;
}

/** Panel surface for transcript sticky composer mount, prefs persistence, and follow-up queue. */
export interface MobileProjectsTranscriptStickyComposerHost {
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerMountKey: string | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerContext: StickyComposerContextEntry[];
    transcriptComposerFilesExpanded: boolean;
    transcriptComposerQueueExpanded: boolean;
    transcriptComposerChangedFilesExpanded: boolean;
    transcriptComposerDraft: string;
    transcriptComposerSendRefresh: (() => void) | undefined;
    stickyComposerContextUsageDispose: Disposable;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerDraftPersistTimer: number | undefined;
    transcriptComposerPrefsPersistTimer: number | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptComposerBackendAgents: QaapAgentTaskAgentOption[];
    agentsHubShellActive: boolean;
    transcriptFollowUpFlushInFlight: boolean;
    transcriptFollowUpQueue: TranscriptFollowUpQueue;
    transcriptTheiaSessionByConversationId: ReadonlyMap<string, string>;
    projectsService: MobileProjectsService;
    chatAgentService?: ChatAgentService;
    chatService?: import('@theia/ai-chat').ChatService;
    messageService?: MessageService;
    conversations?: MobileProjectsConversations;
    getComposerVariables?: unknown;
    pickContextVariable?: (
        anchor: HTMLElement,
        handlers: MobileComposerAttachHandlers,
    ) => Promise<import('@theia/ai-core').AIVariableResolutionRequest[]>;
    transcriptComposerUi: MobileProjectsTranscriptComposerUi;

    onCancelConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    submitBackgroundAgentTask(
        project: MobileProjectEntry,
        draft: string,
        options: Record<string, unknown>,
    ): Promise<void>;
    submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        options: Record<string, unknown>,
    ): Promise<void>;
    renderAgentsHubIdleSubmitOptimistic(
        chatHost: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        selectedAgentId: string,
    ): void;
    resolveActiveTranscriptChatHost(): HTMLElement | undefined;
    stickyComposerColumnUi: import('./mobile-projects-sticky-composer-column-ui').MobileProjectsStickyComposerColumnUi;
    stickyComposerContextUi: import('./mobile-projects-sticky-composer-context-ui').MobileProjectsStickyComposerContextUi;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    stickyComposerSheetsUi: import('./mobile-projects-sticky-composer-sheets-ui').MobileProjectsStickyComposerSheetsUi;
    composerHeaderUi: import('./mobile-projects-composer-header-ui').MobileProjectsComposerHeaderUi;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
    transcriptMessagesUi: import('./mobile-projects-transcript-messages-ui').MobileProjectsTranscriptMessagesUi;
    executionSurfaceTabsUi: import('./mobile-projects-execution-surface-tabs-ui').MobileProjectsExecutionSurfaceTabsUi;
}

/** Transcript overlay sticky composer: mount, prefs, follow-up queue, and submit wiring. */
export class MobileProjectsTranscriptStickyComposerUi {

    protected lastComposerActivityFingerprint = '';

    constructor(protected readonly host: MobileProjectsTranscriptStickyComposerHost) { }

    /** Prefer the live inline/overlay host — mount-time chatHost can go stale after renderList(). */
    protected resolveComposerTranscriptChatHost(fallback?: HTMLElement): HTMLElement | undefined {
        return this.host.resolveActiveTranscriptChatHost() ?? fallback;
    }

    async onTranscriptComposerAttach(
        _project: MobileProjectEntry,
        anchor: HTMLElement,
    ): Promise<void> {
        if (!this.host.pickContextVariable) {
            return;
        }
        const variables = await this.host.pickContextVariable(anchor, this.host.stickyComposerContextUi.createTranscriptComposerAttachHandlers());
        if (variables.length === 0) {
            return;
        }
        for (const request of variables) {
            this.host.transcriptComposerContext.push(createComposerContextEntry(request));
        }
        this.remountTranscriptStickyComposer();
    }

    resolveTranscriptContextUsageTarget(
        summary: QaapAgentConversationSummaryDTO,
    ): {
        readonly summary?: QaapAgentConversationSummaryDTO;
        readonly chatModel?: ChatModel;
        readonly full?: QaapAgentConversationDTO;
    } {
        if (summary.source === 'theia-chat') {
            const chatModel = this.resolveTranscriptTheiaChatModel(summary);
            return chatModel ? { chatModel } : {};
        }
        const cwd = summary.cwd;
        const live = this.host.conversations?.getConversationsForCwd(cwd).find(c => c.id === summary.id) ?? summary;
        if (this.host.transcriptLastConv?.id === summary.id) {
            const effectiveStatus = resolveTranscriptEffectiveStatus(this.host.transcriptLastConv);
            return {
                summary: { ...live, status: effectiveStatus },
                full: this.host.transcriptLastConv,
            };
        }
        return { summary: live };
    }

    resolveTranscriptTheiaChatModel(summary: QaapAgentConversationSummaryDTO): ChatModel | undefined {
        if (summary.source !== 'theia-chat' || !summary.sessionId || !this.host.chatService) {
            return undefined;
        }
        return this.host.chatService.getSession(summary.sessionId)?.model;
    }

    enqueueTranscriptFollowUp(
        conversationId: string,
        entry: TranscriptFollowUpEntry,
    ): boolean {
        const ok = this.host.transcriptFollowUpQueue.enqueue(conversationId, entry);
        if (!ok) {
            MobileSnackbar.show(
                nls.localize(
                    'qaap/mobileProjects/transcriptFollowUpQueueFull',
                    'Queue is full ({0} messages). Wait for the agent to finish.',
                    String(MAX_TRANSCRIPT_FOLLOW_UP_QUEUE),
                ),
                { kind: 'warning', duration: 2800 },
            );
            return false;
        }
        const count = this.host.transcriptFollowUpQueue.size(conversationId);
        MobileSnackbar.show(
            nls.localize(
                'qaap/mobileProjects/transcriptFollowUpQueued',
                '{0} message(s) queued — will send when the agent finishes',
                String(count),
            ),
            { kind: 'success', duration: 1600 },
        );
        return true;
    }

    appendTranscriptFollowUpQueueBanner(_shell: HTMLElement, _conversationId: string): void {
        /* Replaced by composer activity stack inside the codex card. */
    }

    buildTranscriptComposerActivityStack(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement | undefined {
        const queueEntries = this.host.transcriptFollowUpQueue.peek(summary.id);
        const conv = this.host.transcriptLastConv?.id === summary.id ? this.host.transcriptLastConv : undefined;
        const activityFiles = this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        const agentWorking = this.isTranscriptStickyComposerAgentWorking();
        return renderStickyComposerActivityStack({
            queueEntries,
            queueExpanded: this.host.transcriptComposerQueueExpanded,
            onQueueExpandedChange: expanded => { this.host.transcriptComposerQueueExpanded = expanded; },
            onQueueEdit: (index, entry) => {
                this.host.transcriptComposerDraft = entry.draft;
                this.host.transcriptFollowUpQueue.removeAt(summary.id, index);
                this.remountTranscriptStickyComposer();
            },
            onQueueMoveUp: index => {
                if (this.host.transcriptFollowUpQueue.moveUp(summary.id, index)) {
                    this.refreshComposerActivityStack();
                }
            },
            onQueueRemove: index => {
                this.host.transcriptFollowUpQueue.removeAt(summary.id, index);
                this.refreshComposerActivityStack();
            },
            changedFiles: activityFiles.files,
            diffStats: activityFiles.stats,
            filesExpanded: this.host.transcriptComposerChangedFilesExpanded,
            onFilesExpandedChange: expanded => { this.host.transcriptComposerChangedFilesExpanded = expanded; },
            agentWorking,
            onStop: () => { void this.host.onCancelConversation(project, summary); },
            onReview: () => {
                this.host.executionSurfaceTabsUi.selectTranscriptTab('review', project, summary);
            },
        });
    }

    syncComposerActivityFingerprint(summary: QaapAgentConversationSummaryDTO): void {
        const conv = this.host.transcriptLastConv?.id === summary.id ? this.host.transcriptLastConv : undefined;
        const activityFiles = this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        this.lastComposerActivityFingerprint = `${this.host.transcriptFollowUpQueue.size(summary.id)}|${activityFiles.files.map(file => file.path).join('\n')}|${activityFiles.stats?.added ?? 0}:${activityFiles.stats?.removed ?? 0}|${conv?.status ?? summary.status}`;
    }

    refreshComposerActivityStack(): void {
        const host = this.host.transcriptComposerHost;
        const project = this.host.transcriptComposerProject;
        const summary = this.host.transcriptComposerSummary;
        if (!host?.isConnected || !project || !summary) {
            return;
        }
        const card = host.querySelector('.theia-mobile-projects-sticky-composer-card.theia-mod-codex');
        if (!card) {
            this.remountTranscriptStickyComposer();
            return;
        }
        const stack = this.buildTranscriptComposerActivityStack(project, summary);
        const existing = card.querySelector(':scope > .theia-mobile-sticky-composer-activity-stack');
        if (!stack) {
            existing?.remove();
            card.classList.remove('theia-mod-has-activity');
        } else if (existing) {
            existing.replaceWith(stack);
            card.classList.add('theia-mod-has-activity');
        } else {
            const stage = card.querySelector(':scope > .theia-mobile-projects-sticky-composer-stage');
            if (stage) {
                card.insertBefore(stack, stage);
            } else {
                card.append(stack);
            }
            card.classList.add('theia-mod-has-activity');
        }
        this.syncComposerActivityFingerprint(summary);
        this.host.composerHeaderUi.updateStickyComposerFabLift();
    }

    refreshTranscriptComposerActivityIfNeeded(conv: QaapAgentConversationDTO): void {
        const summary = this.host.transcriptComposerSummary;
        if (!summary || summary.id !== conv.id || !this.host.transcriptComposerHost?.isConnected) {
            return;
        }
        const queueSize = this.host.transcriptFollowUpQueue.size(summary.id);
        const activityFiles = this.host.transcriptMessagesUi.resolveComposerActivityFiles(conv, summary);
        const fingerprint = `${queueSize}|${activityFiles.files.map(file => file.path).join('\n')}|${activityFiles.stats?.added ?? 0}:${activityFiles.stats?.removed ?? 0}|${conv.status}`;
        if (fingerprint === this.lastComposerActivityFingerprint) {
            this.host.transcriptComposerSendRefresh?.();
            return;
        }
        this.lastComposerActivityFingerprint = fingerprint;
        this.refreshComposerActivityStack();
        this.host.transcriptComposerSendRefresh?.();
    }

    isTranscriptFollowUpReady(summary: QaapAgentConversationSummaryDTO): boolean {
        if (this.host.transcriptFollowUpFlushInFlight) {
            return false;
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            return resolveTranscriptEffectiveStatus(this.host.transcriptLastConv) !== 'streaming';
        }
        return summary.status !== 'streaming';
    }

    async flushTranscriptFollowUpQueue(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (!this.isTranscriptFollowUpReady(summary)) {
            return;
        }
        const next = this.host.transcriptFollowUpQueue.shift(summary.id);
        if (!next) {
            return;
        }
        this.host.transcriptFollowUpFlushInFlight = true;
        try {
            await this.host.submitTranscriptViaBackendConversation(project, summary, next.draft, {
                selectedAgentId: next.selectedAgentId,
                modeId: next.modeId,
                autoApprove: next.autoApprove,
                approvalPolicyId: next.approvalPolicyId,
            });
        } catch (error) {
            this.host.transcriptFollowUpQueue.unshift(summary.id, next);
            const detail = error instanceof Error ? error.message : String(error);
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail,
            ));
        } finally {
            this.host.transcriptFollowUpFlushInFlight = false;
            this.remountTranscriptStickyComposer();
        }
    }

    isTranscriptStickyComposerAgentWorking(): boolean {
        const summary = this.host.transcriptComposerSummary;
        if (!summary || !this.host.transcriptComposerHost?.isConnected) {
            return false;
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            return resolveTranscriptEffectiveStatus(this.host.transcriptLastConv) === 'streaming';
        }
        if (summary.source === 'theia-chat' && this.host.chatService) {
            const sessionId = summary.sessionId ?? this.host.transcriptTheiaSessionByConversationId.get(summary.id);
            const session = sessionId ? this.host.chatService.getSession(sessionId) : undefined;
            if (session && this.host.chatServiceSummariesUi.isChatSessionWorking(session)) {
                return true;
            }
        }
        const project = this.host.transcriptComposerProject;
        if (project) {
            const latest = this.host.conversationIndexUi.conversationsForProject(project).find(candidate => candidate.id === summary.id);
            if (latest?.status === 'streaming') {
                return true;
            }
        }
        return this.host.transcriptOpenSummary?.id === summary.id && this.host.transcriptOpenSummary.status === 'streaming';
    }

    applyTranscriptComposerPrefsFromConversation(
        conv: QaapAgentConversationDTO,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        const prefs = extractConversationComposerPrefs(conv);
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        this.host.transcriptComposerPrefsConvId = conv.id;
        this.host.transcriptComposerPinnedAgentId = prefs.agentId;
        if (cwd) {
            writeStoredAgent(cwd, prefs.agentId);
            if (prefs.agentModel) {
                writeStoredAgentModel(cwd, prefs.agentId, prefs.agentModel);
            }
            if (prefs.interactionModeId) {
                writeStoredComposerMode(cwd, prefs.interactionModeId);
            }
            writeStoredAgentApprovalPolicy(cwd, prefs.approvalPolicyId);
            writeStoredAgentToolApprovalRules(cwd, prefs.toolApprovalRules);
        }
        const modes = resolveStickyComposerModes(prefs.agentId, this.host.chatAgentService);
        this.host.transcriptComposerModeId = reconcileComposerModeId(
            prefs.interactionModeId,
            modes,
            cwd,
        );
        this.host.transcriptComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
            prefs.approvalPolicyId,
            cwd,
        );
        this.host.transcriptComposerToolApprovalRules = prefs.toolApprovalRules;
        this.host.transcriptComposerDraft = readConversationComposerDraft(conv.id);
    }

    async hydrateTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<boolean> {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return false;
        }
        const conv = this.host.transcriptLastConv?.id === summary.id
            ? this.host.transcriptLastConv
            : await getConversation(summary.id).catch(() => undefined);
        if (!conv || conv.id !== summary.id) {
            return false;
        }
        if (this.host.transcriptComposerPrefsConvId === conv.id) {
            return false;
        }
        this.applyTranscriptComposerPrefsFromConversation(conv, project, summary);
        return true;
    }

    schedulePersistTranscriptComposerDraft(conversationId: string | undefined): void {
        if (!conversationId) {
            return;
        }
        if (this.host.transcriptComposerDraftPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerDraftPersistTimer);
        }
        this.host.transcriptComposerDraftPersistTimer = window.setTimeout(() => {
            this.host.transcriptComposerDraftPersistTimer = undefined;
            writeConversationComposerDraft(conversationId, this.host.transcriptComposerDraft);
        }, 280);
    }

    schedulePersistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        if (this.host.transcriptComposerPrefsPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerPrefsPersistTimer);
        }
        this.host.transcriptComposerPrefsPersistTimer = window.setTimeout(() => {
            this.host.transcriptComposerPrefsPersistTimer = undefined;
            void this.persistTranscriptComposerPrefs(project, summary);
        }, 320);
    }

    async persistTranscriptComposerPrefs(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (summary.source === 'theia-chat' || isAgentsHubIdleConversationSummary(summary)) {
            return;
        }
        const agentId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const patch = buildUpdateConversationComposerPatch({
            agentId,
            ...(agentSupportsModelPicker(agentId)
                ? { agentModel: readStoredAgentModel(cwd, agentId) }
                : {}),
            ...(this.host.transcriptComposerModeId ? { interactionModeId: this.host.transcriptComposerModeId } : {}),
            ...(this.host.transcriptComposerApprovalPolicyId
                ? {
                    approvalPolicyId: this.host.transcriptComposerApprovalPolicyId,
                    toolApprovalRules: reconcileAgentToolApprovalRules(
                        this.host.transcriptComposerApprovalPolicyId,
                        cwd,
                        this.host.transcriptComposerToolApprovalRules,
                    ),
                }
                : {}),
        });
        if (Object.keys(patch).length === 0) {
            return;
        }
        try {
            const updated = await updateConversation(summary.id, patch);
            this.host.transcriptComposerPrefsConvId = updated.id;
            if (this.host.transcriptLastConv?.id === updated.id) {
                this.host.transcriptLastConv = updated;
            }
            this.host.conversations?.recordSnapshot(conversationToSummary(updated));
        } catch {
            /* best-effort — composer still works for the current runtime */
        }
    }

    mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        const mountKey = `${project.id}|${summary.id}`;
        const composerStable = this.host.transcriptComposerMountKey === mountKey
            && this.host.transcriptComposerHost === host
            && host.childElementCount > 0;
        if (composerStable) {
            this.host.transcriptComposerSendRefresh?.();
            this.refreshComposerActivityStack();
            return;
        }
        this.host.transcriptComposerMountKey = mountKey;
        this.host.transcriptComposerHost = host;
        this.host.transcriptComposerProject = project;
        this.host.transcriptComposerSummary = summary;
        this.host.transcriptComposerSendRefresh = undefined;
        this.host.stickyComposerContextUsageDispose.dispose();
        host.replaceChildren();
        if (this.host.transcriptLastConv?.id === summary.id) {
            this.applyTranscriptComposerPrefsFromConversation(this.host.transcriptLastConv, project, summary);
        } else {
            void this.hydrateTranscriptComposerPrefs(project, summary).then(applied => {
                if (!applied) {
                    return;
                }
                this.host.transcriptComposerSendRefresh?.();
            });
        }
        const shell = document.createElement('div');
        shell.className = 'theia-mobile-projects-sticky-composer';
        const isLegacyTheiaChat = summary.source === 'theia-chat';
        const pinnedId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
        const cwd = this.host.projectsService.getProjectCwd(project) ?? summary.cwd;
        const modes = resolveStickyComposerModes(pinnedId, this.host.chatAgentService);
        this.host.transcriptComposerModeId = reconcileComposerModeId(
            this.host.transcriptComposerModeId,
            modes,
            cwd,
        );
        const showApprovalPolicy = !isLegacyTheiaChat && agentSupportsApprovalPolicy(pinnedId);
        if (showApprovalPolicy) {
            this.host.transcriptComposerApprovalPolicyId = reconcileAgentApprovalPolicyId(
                this.host.transcriptComposerApprovalPolicyId,
                cwd,
            );
            this.host.transcriptComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                this.host.transcriptComposerApprovalPolicyId,
                cwd,
                this.host.transcriptComposerToolApprovalRules,
            );
        } else {
            this.host.transcriptComposerApprovalPolicyId = undefined;
            this.host.transcriptComposerToolApprovalRules = undefined;
        }
        const column = this.host.stickyComposerColumnUi.buildStickyComposerColumn({
            project,
            surface: 'task',
            agentLocked: isLegacyTheiaChat,
            activityStack: this.buildTranscriptComposerActivityStack(project, summary),
            getContext: () => this.host.transcriptComposerContext,
            clearContext: () => {
                disposeComposerContextEntries(this.host.transcriptComposerContext);
                this.host.transcriptComposerContext = [];
                this.remountTranscriptStickyComposer();
            },
            removeContextItem: index => {
                revokeComposerContextPreview(this.host.transcriptComposerContext[index]);
                this.host.transcriptComposerContext.splice(index, 1);
                this.remountTranscriptStickyComposer();
            },
            formatContextChip: item => this.host.stickyComposerContextUi.formatComposerContextEntry(item),
            filesExpanded: this.host.transcriptComposerFilesExpanded,
            onFilesExpandedChange: expanded => { this.host.transcriptComposerFilesExpanded = expanded; },
            getDraft: () => this.host.transcriptComposerDraft,
            setDraft: value => {
                this.host.transcriptComposerDraft = value;
                this.schedulePersistTranscriptComposerDraft(summary.id);
            },
            resolveAgentLabel: () => this.host.transcriptComposerUi.resolveTranscriptComposerAgentLabel(),
            resolveAgentId: () => this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.host.transcriptComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? anchor => { this.host.transcriptComposerUi.openTranscriptComposerModeSheet(project, summary, modes, anchor); }
                : undefined,
            approvalPolicyId: showApprovalPolicy ? this.host.transcriptComposerApprovalPolicyId : undefined,
            onOpenApprovalPolicySheet: showApprovalPolicy
                ? anchor => {
                    this.host.transcriptComposerUi.openTranscriptComposerApprovalPolicySheet(
                        project,
                        summary,
                        this.host.transcriptComposerUi.resolveTranscriptComposerAgentLabel(),
                        anchor,
                    );
                }
                : undefined,
            canSubmit: true,
            isAgentWorking: () => this.isTranscriptStickyComposerAgentWorking(),
            onStop: () => { void this.host.onCancelConversation(project, summary); },
            onSendControlMounted: refresh => { this.host.transcriptComposerSendRefresh = refresh; },
            onAttach: anchor => { void this.onTranscriptComposerAttach(project, anchor); },
            onOpenAgentSheet: isLegacyTheiaChat
                ? () => { /* Legacy Theia chat is not agent-switchable */ }
                : anchor => { this.host.transcriptComposerUi.openTranscriptComposerAgentSheet(project, summary, anchor); },
            sendLabel: this.isTranscriptStickyComposerAgentWorking()
                ? nls.localize('qaap/mobileProjects/transcriptQueue', 'Queue')
                : nls.localize('qaap/mobileProjects/transcriptSend', 'Send'),
            onSubmit: draft => {
                if (hasPendingComposerContextEntries(this.host.transcriptComposerContext)) {
                    this.host.stickyComposerContextUi.notifyPendingComposerAttachments();
                    return;
                }
                const resolvedPinnedId = this.host.transcriptComposerUi.resolveTranscriptComposerPinnedAgentId(project, summary);
                const selectedAgentId = resolveExplicitAgentForSubmit(draft, {
                    pinnedChatAgentId: resolvedPinnedId,
                }) ?? resolvedPinnedId;
                const requests = composerContextRequests(this.host.transcriptComposerContext);
                const variables = requests.length > 0 ? requests : undefined;
                const modeId = this.host.transcriptComposerModeId;
                const autoApprove = resolveComposerAutoApprove(
                    showApprovalPolicy,
                    this.host.transcriptComposerApprovalPolicyId,
                    summary.cwd,
                );
                disposeComposerContextEntries(this.host.transcriptComposerContext);
                this.host.transcriptComposerContext = [];
                const clearComposerDraft = (): void => {
                    clearConversationComposerDraft(summary.id);
                    this.host.transcriptComposerDraft = '';
                };
                if (this.isTranscriptStickyComposerAgentWorking() && !isAgentsHubIdleConversationSummary(summary)) {
                    const queued = this.enqueueTranscriptFollowUp(summary.id, {
                        draft,
                        selectedAgentId,
                        modeId,
                        autoApprove,
                        approvalPolicyId: reconcileAgentApprovalPolicyId(
                            this.host.transcriptComposerApprovalPolicyId,
                            summary.cwd,
                        ),
                    });
                    if (queued) {
                        clearComposerDraft();
                        this.refreshComposerActivityStack();
                        const input = this.host.transcriptComposerHost?.querySelector('.theia-mobile-projects-sticky-composer-input');
                        if (input instanceof HTMLTextAreaElement) {
                            input.value = '';
                        }
                        this.host.transcriptComposerSendRefresh?.();
                    }
                    return;
                }
                clearComposerDraft();
                if (isAgentsHubIdleConversationSummary(summary)) {
                    const activeChatHost = this.resolveComposerTranscriptChatHost(chatHost);
                    if (activeChatHost) {
                        this.host.renderAgentsHubIdleSubmitOptimistic(activeChatHost, summary, draft, selectedAgentId);
                    }
                    this.host.transcriptComposerSendRefresh?.();
                    void (async () => {
                        try {
                            await this.host.submitBackgroundAgentTask(project, draft, {
                                openConversation: true,
                                forceVps: true,
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        } catch {
                            /* submitBackgroundAgentTask surfaces errors */
                        } finally {
                            this.host.stickyComposerRenderUi.renderStickyComposer();
                        }
                    })();
                    return;
                }
                void (async () => {
                    try {
                        if (isLegacyTheiaChat) {
                            await this.host.submitBackgroundAgentTask(project, draft, {
                                openConversation: true,
                                forceVps: true,
                                selectedAgentId: QAAP_PRIMARY_AGENT_ID,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        } else {
                            await this.host.submitTranscriptViaBackendConversation(project, summary, draft, {
                                selectedAgentId,
                                modeId,
                                variables,
                                autoApprove,
                                approvalPolicyId: reconcileAgentApprovalPolicyId(
                                    this.host.transcriptComposerApprovalPolicyId,
                                    summary.cwd,
                                ),
                            });
                        }
                    } catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        this.host.messageService?.error(nls.localize(
                            'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                        ));
                    } finally {
                        this.remountTranscriptStickyComposer();
                    }
                })();
            },
            getMentionOptions: () => this.host.stickyComposerContextUi.resolveComposerMentionOptions(this.host.transcriptComposerBackendAgents, false),
            getVariableOptions: this.host.getComposerVariables
                ? () => this.host.stickyComposerContextUi.resolveComposerVariableOptions()
                : undefined,
            inputPlaceholder: isAgentsHubIdleConversationSummary(summary)
                ? nls.localize('qaap/mobileProjects/stickyComposerNewTask', 'Delegate a task…')
                : isLegacyTheiaChat
                    ? nls.localize('qaap/mobileProjects/transcriptLegacyTheiaPlaceholder', 'Start a new QAIQ session…')
                    : nls.localize('qaap/mobileProjects/transcriptTaskPlaceholder', 'Follow up on this task…'),
            onContextUsageBadgeMounted: badge => {
                this.host.stickyComposerContextUsageDispose = this.host.stickyComposerRenderUi.mountStickyComposerContextUsage(
                    badge,
                    () => this.resolveTranscriptContextUsageTarget(summary),
                );
            },
            onOpenContextUsageSheet: anchor => {
                this.host.stickyComposerSheetsUi.openStickyComposerContextUsageSheet(
                    () => {
                        const target = this.resolveTranscriptContextUsageTarget(summary);
                        if (target?.chatModel) {
                            return resolveChatModelContextUsageBreakdown(target.chatModel);
                        }
                        return resolveVpsContextUsageBreakdown(target?.summary, target?.full);
                    },
                    !this.host.agentsHubShellActive,
                    anchor,
                );
            },
            showWorkspaceBar: this.host.composerHeaderUi.shouldShowComposerWorkspaceBar(summary),
            transcriptOverlay: !this.host.agentsHubShellActive,
        });
        const modeHint = describeComposerInteractionMode(this.host.transcriptComposerModeId);
        if (modeHint) {
            const modeBanner = document.createElement('div');
            modeBanner.className = 'theia-mobile-sticky-composer-mode-banner';
            modeBanner.textContent = modeHint;
            shell.append(modeBanner);
        }
        if (isLegacyTheiaChat) {
            const legacyBanner = document.createElement('div');
            legacyBanner.className = 'theia-mobile-sticky-composer-legacy-banner';
            legacyBanner.textContent = nls.localize(
                'qaap/mobileProjects/transcriptLegacyTheiaBanner',
                'Legacy local chat — replies start a new QAIQ session in the cloud.',
            );
            shell.append(legacyBanner);
        }
        shell.append(column);
        host.append(shell);
        this.syncComposerActivityFingerprint(summary);
    }

    remountTranscriptStickyComposer(): void {
        const host = this.host.transcriptComposerHost;
        const project = this.host.transcriptComposerProject;
        const summary = this.host.transcriptComposerSummary;
        const chatHost = this.resolveComposerTranscriptChatHost(this.host.transcriptChatHost);
        if (!host?.isConnected || !project || !summary) {
            return;
        }
        this.host.transcriptComposerMountKey = undefined;
        this.mountTranscriptStickyComposer(host, project, summary, chatHost ?? host);
    }
}
