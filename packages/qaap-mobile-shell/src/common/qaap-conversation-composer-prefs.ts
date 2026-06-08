// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    agentSupportsModelPicker,
    migrateLegacyBackendAgentId,
    type QaapCreateAgentTaskQaiqModel,
} from './qaap-agent-task-client';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import type { QaapUpdateConversationBody } from './qaap-agent-conversation-client';
import {
    DEFAULT_AGENT_APPROVAL_POLICY_ID,
    type QaapAgentApprovalPolicyId,
} from './qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from './qaap-agent-tool-approval-rules';

const CONVERSATION_COMPOSER_DRAFT_KEY = 'qaap.conversationComposer.draft';

export interface QaapConversationComposerPrefs {
    readonly agentId: string;
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly interactionModeId?: string;
    readonly approvalPolicyId: QaapAgentApprovalPolicyId;
    readonly toolApprovalRules: QaapAgentToolApprovalRules;
    readonly autoApprove: boolean;
}

function isAgentApprovalPolicyId(value: string | undefined): value is QaapAgentApprovalPolicyId {
    return value === 'request-approval' || value === 'approve-for-me' || value === 'full-access';
}

/** Derive the composer approval preset from durable conversation fields. */
export function resolveApprovalPolicyFromConversation(
    conv: Pick<QaapAgentConversationDTO, 'approvalPolicyId' | 'autoApprove'>,
): QaapAgentApprovalPolicyId {
    if (conv.approvalPolicyId && isAgentApprovalPolicyId(conv.approvalPolicyId)) {
        return conv.approvalPolicyId;
    }
    if (conv.autoApprove === false) {
        return 'request-approval';
    }
    return DEFAULT_AGENT_APPROVAL_POLICY_ID;
}

export function extractConversationComposerPrefs(conv: QaapAgentConversationDTO): QaapConversationComposerPrefs {
    const agentId = migrateLegacyBackendAgentId(conv.agentId) ?? conv.agentId;
    const agentModel = conv.agentModel ?? conv.qaiqModel;
    const approvalPolicyId = resolveApprovalPolicyFromConversation(conv);
    const toolApprovalRules = reconcileAgentToolApprovalRules(
        approvalPolicyId,
        conv.cwd,
        conv.toolApprovalRules,
    );
    return {
        agentId,
        ...(agentModel && agentSupportsModelPicker(agentId) ? { agentModel } : {}),
        ...(conv.interactionModeId ? { interactionModeId: conv.interactionModeId } : {}),
        approvalPolicyId,
        toolApprovalRules,
        autoApprove: approvalPolicyId !== 'request-approval',
    };
}

export function buildUpdateConversationComposerPatch(
    prefs: Partial<QaapConversationComposerPrefs>,
): QaapUpdateConversationBody {
    const approvalPolicyId = prefs.approvalPolicyId;
    const autoApprove = approvalPolicyId !== undefined
        ? approvalPolicyId !== 'request-approval'
        : prefs.autoApprove;
    return {
        ...(prefs.agentId !== undefined ? { agent: prefs.agentId } : {}),
        ...(prefs.agentModel !== undefined ? { agentModel: prefs.agentModel } : {}),
        ...(prefs.interactionModeId !== undefined ? { interactionModeId: prefs.interactionModeId } : {}),
        ...(approvalPolicyId !== undefined ? { approvalPolicyId, autoApprove } : {}),
        ...(approvalPolicyId === undefined && autoApprove !== undefined ? { autoApprove } : {}),
        ...(prefs.toolApprovalRules !== undefined ? { toolApprovalRules: prefs.toolApprovalRules } : {}),
    };
}

function scopedConversationDraftKey(conversationId: string): string {
    return `${CONVERSATION_COMPOSER_DRAFT_KEY}.${conversationId}`;
}

export function readConversationComposerDraft(conversationId: string | undefined): string {
    if (!conversationId) {
        return '';
    }
    try {
        return window.localStorage.getItem(scopedConversationDraftKey(conversationId)) ?? '';
    } catch {
        return '';
    }
}

export function writeConversationComposerDraft(conversationId: string | undefined, draft: string): void {
    if (!conversationId) {
        return;
    }
    try {
        const key = scopedConversationDraftKey(conversationId);
        const trimmed = draft.trim();
        if (!trimmed) {
            window.localStorage.removeItem(key);
            return;
        }
        window.localStorage.setItem(key, draft);
    } catch {
        /* session-only */
    }
}

export function clearConversationComposerDraft(conversationId: string | undefined): void {
    if (!conversationId) {
        return;
    }
    try {
        window.localStorage.removeItem(scopedConversationDraftKey(conversationId));
    } catch {
        /* ignore */
    }
}
