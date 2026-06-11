// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AIVariableResolutionRequest, GenericCapabilitySelections } from '@theia/ai-core';
import type { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import {
    cancelConversation,
    conversationToSummary,
    getConversation,
    postConversationMessage,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    resolveExplicitAgentForSubmit,
    resolveStoredAgentModelForSubmit,
} from '../common/qaap-agent-task-client';
import { applyBackendInteractionModeToPrompt } from '../common/qaap-sticky-composer-mode';
import {
    reconcileAgentApprovalPolicyId,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import { isConversationTurnVisuallySettled } from '../common/qaap-transcript-turn-status';
import { messageRequestsDevPreview } from '../common/qaap-transcript-preview-offer';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsTranscriptMessagesUi } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';

/** Panel surface for VPS/backend transcript message submit and optimistic render. */
export interface MobileProjectsTranscriptSubmitHost {
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    conversations: MobileProjectsConversations | undefined;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;
    transcriptLiveUi: MobileProjectsTranscriptLiveUi;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;

    isPendingNewChatSummary(summary: QaapAgentConversationSummaryDTO): boolean;
    createProjectChatSession(
        project: MobileProjectEntry,
        cwd: string,
        draft: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            variables?: AIVariableResolutionRequest[];
        },
    ): Promise<QaapAgentConversationSummaryDTO>;
    resolveActiveTranscriptChatHost(): HTMLElement | undefined;
    applyTaskStartedToProject(cwd: string, title: string, taskId: string): void;
}

/** Backend conversation submit with optimistic transcript rows and rollback on failure. */
export class MobileProjectsTranscriptSubmitUi {

    constructor(protected readonly host: MobileProjectsTranscriptSubmitHost) { }

    protected shouldRenderTranscriptSubmit(summary: QaapAgentConversationSummaryDTO): boolean {
        if (this.host.transcriptOpenSummaryId === summary.id) {
            return true;
        }
        return this.host.transcriptComposerSummary?.id === summary.id;
    }

    protected renderTranscriptSubmitMessages(
        chatHost: HTMLElement,
        conv: QaapAgentConversationDTO,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        if (!this.shouldRenderTranscriptSubmit(summary)) {
            return;
        }
        this.host.transcriptLastFingerprint = undefined;
        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, conv);
    }

    /**
     * Paint the outbound user bubble (and the streaming activity skeleton) synchronously from the
     * cached conversation, before any network round-trip, so perceived send latency is zero.
     */
    protected renderInstantSubmitOptimistic(
        summary: QaapAgentConversationSummaryDTO,
        pendingUserMessage: QaapAgentConversationDTO['messages'][number],
    ): void {
        const cached = this.host.transcriptLastConv;
        const chatHost = this.host.resolveActiveTranscriptChatHost();
        if (!chatHost) {
            return;
        }
        const baseConv: QaapAgentConversationDTO = cached?.id === summary.id ? cached : {
            id: summary.id,
            cwd: summary.cwd,
            agentId: summary.agentId,
            title: summary.title,
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: Date.now(),
            messages: [],
        };
        this.renderTranscriptSubmitMessages(chatHost, {
            ...baseConv,
            status: 'streaming',
            messages: [...baseConv.messages, pendingUserMessage],
        }, summary);
    }

    async submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            autoApprove?: boolean;
            approvalPolicyId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: AIVariableResolutionRequest[];
            widget?: AIChatInputWidget;
        } = {},
    ): Promise<void> {
        if (this.host.transcriptHeaderUi.isPendingNewChatSummary(summary)) {
            this.renderInstantSubmitOptimistic(summary, {
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content,
                createdAt: Date.now(),
            });
            const created = await this.host.createProjectChatSession(project, summary.cwd, content, {
                selectedAgentId: options.selectedAgentId,
                modeId: options.modeId,
                autoApprove: options.autoApprove,
                approvalPolicyId: options.approvalPolicyId,
                variables: options.variables,
            });
            this.host.transcriptOpenSummaryId = created.id;
            this.host.transcriptOpenSummary = created;
            this.host.transcriptComposerSummary = created;
            const activeChatHost = this.host.resolveActiveTranscriptChatHost();
            const full = await getConversation(created.id);
            if (activeChatHost) {
                this.host.transcriptLastFingerprint = undefined;
                this.host.transcriptMessagesUi.renderTranscriptMessages(activeChatHost, full);
                this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
            }
            this.host.applyTaskStartedToProject(created.cwd, content, created.id);
            if (messageRequestsDevPreview(content)) {
                this.host.transcriptLiveUi.onTranscriptUserMessageSubmitted(content, full);
            }
            return;
        }
        if (this.host.transcriptComposerSummary?.id === summary.id) {
            if (!this.host.transcriptOpenSummaryId) {
                this.host.transcriptOpenSummaryId = summary.id;
                this.host.transcriptOpenSummary = summary;
            }
        }
        const agent = resolveExplicitAgentForSubmit(content, {
            pinnedChatAgentId: options.selectedAgentId ?? options.widget?.pinnedAgent?.id ?? summary.agentId,
        }) ?? options.selectedAgentId ?? summary.agentId;
        const outbound = applyBackendInteractionModeToPrompt(content, options.modeId);
        const pendingUserMessage = {
            id: `pending-user-${Date.now()}`,
            role: 'user' as const,
            content: outbound,
            createdAt: Date.now(),
        };
        // Zero perceived latency: paint the user bubble + activity skeleton from the cached
        // conversation before the GET/POST round-trips; the server render below reconciles.
        this.renderInstantSubmitOptimistic(summary, pendingUserMessage);
        let base = await getConversation(summary.id);
        if (base.status === 'streaming' && isConversationTurnVisuallySettled(base)) {
            await cancelConversation(summary.id);
            base = await getConversation(summary.id);
        }
        const optimistic: QaapAgentConversationDTO = {
            ...base,
            status: 'streaming',
            messages: [...base.messages, pendingUserMessage],
        };
        const activeChatHost = this.host.resolveActiveTranscriptChatHost();
        if (activeChatHost) {
            this.renderTranscriptSubmitMessages(activeChatHost, optimistic, summary);
        }
        try {
            const agentModel = resolveStoredAgentModelForSubmit(agent, summary.cwd);
            const updated = await postConversationMessage(summary.id, outbound, {
                agent,
                agentModel,
                autoApprove: options.autoApprove,
                interactionModeId: options.modeId,
                approvalPolicyId: options.approvalPolicyId
                    ?? reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, summary.cwd),
                toolApprovalRules: reconcileAgentToolApprovalRules(
                    (options.approvalPolicyId as QaapAgentApprovalPolicyId | undefined)
                        ?? reconcileAgentApprovalPolicyId(this.host.transcriptComposerApprovalPolicyId, summary.cwd),
                    summary.cwd,
                    this.host.transcriptComposerToolApprovalRules,
                ),
            });
            const nextSummary = conversationToSummary(updated);
            this.host.conversations?.recordSnapshot(nextSummary);
            const refreshedChatHost = this.host.resolveActiveTranscriptChatHost();
            if (refreshedChatHost) {
                this.renderTranscriptSubmitMessages(refreshedChatHost, updated, summary);
            }
            this.host.applyTaskStartedToProject(summary.cwd, content, summary.id);
            if (messageRequestsDevPreview(content)) {
                this.host.transcriptLiveUi.onTranscriptUserMessageSubmitted(content, updated);
            }
            this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
        } catch (error) {
            const rollbackChatHost = this.host.resolveActiveTranscriptChatHost();
            if (rollbackChatHost) {
                this.renderTranscriptSubmitMessages(rollbackChatHost, base, summary);
            }
            throw error;
        }
    }
}
