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
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectEntry } from './mobile-projects-types';

/** Panel surface for VPS/backend transcript message submit and optimistic render. */
export interface MobileProjectsTranscriptSubmitHost {
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
    transcriptComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
    conversations: MobileProjectsConversations | undefined;

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
    renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    ensureTranscriptConversationRefresh(): void;
    applyTaskStartedToProject(cwd: string, title: string, taskId: string): void;
}

/** Backend conversation submit with optimistic transcript rows and rollback on failure. */
export class MobileProjectsTranscriptSubmitUi {

    constructor(protected readonly host: MobileProjectsTranscriptSubmitHost) { }

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
        if (this.host.isPendingNewChatSummary(summary)) {
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
            if (activeChatHost) {
                const full = await getConversation(created.id);
                this.host.transcriptLastFingerprint = undefined;
                this.host.renderTranscriptMessages(activeChatHost, full);
                this.host.ensureTranscriptConversationRefresh();
            }
            this.host.applyTaskStartedToProject(created.cwd, content, created.id);
            return;
        }
        const agent = resolveExplicitAgentForSubmit(content, {
            pinnedChatAgentId: options.selectedAgentId ?? options.widget?.pinnedAgent?.id ?? summary.agentId,
        }) ?? options.selectedAgentId ?? summary.agentId;
        const outbound = applyBackendInteractionModeToPrompt(content, options.modeId);
        let base = await getConversation(summary.id);
        if (base.status === 'streaming' && isConversationTurnVisuallySettled(base)) {
            await cancelConversation(summary.id);
            base = await getConversation(summary.id);
        }
        const optimistic: QaapAgentConversationDTO = {
            ...base,
            status: 'streaming',
            messages: [...base.messages, {
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content: outbound,
                createdAt: Date.now(),
            }],
        };
        const activeChatHost = this.host.resolveActiveTranscriptChatHost();
        if (activeChatHost && this.host.transcriptOpenSummaryId === summary.id) {
            this.host.transcriptLastFingerprint = undefined;
            this.host.renderTranscriptMessages(activeChatHost, optimistic);
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
            if (refreshedChatHost && this.host.transcriptOpenSummaryId === summary.id) {
                this.host.transcriptLastFingerprint = undefined;
                this.host.renderTranscriptMessages(refreshedChatHost, updated);
            }
            this.host.applyTaskStartedToProject(summary.cwd, content, summary.id);
            this.host.ensureTranscriptConversationRefresh();
        } catch (error) {
            const rollbackChatHost = this.host.resolveActiveTranscriptChatHost();
            if (rollbackChatHost && this.host.transcriptOpenSummaryId === summary.id) {
                this.host.transcriptLastFingerprint = undefined;
                this.host.renderTranscriptMessages(rollbackChatHost, base);
            }
            throw error;
        }
    }
}
