// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    agentSupportsModelPicker,
    migrateLegacyBackendAgentId,
    readStoredAgent,
    readStoredAgentModel,
    writeStoredAgent,
    type QaapCreateAgentTaskQaiqModel,
} from './qaap-agent-task-client';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';
import type { QaapUpdateConversationBody } from './qaap-agent-conversation-client';
import {
    DEFAULT_AGENT_APPROVAL_POLICY_ID,
    reconcileAgentApprovalPolicyId,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from './qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from './qaap-agent-tool-approval-rules';
import {
    readStoredComposerMode,
    writeStoredComposerMode,
} from './qaap-sticky-composer-mode';

const CONVERSATION_COMPOSER_DRAFT_KEY = 'qaap.conversationComposer.draft';

export interface QaapConversationComposerPrefs {
    readonly agentId: string;
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly interactionModeId?: string;
    readonly approvalPolicyId: QaapAgentApprovalPolicyId;
    readonly toolApprovalRules: QaapAgentToolApprovalRules;
    readonly autoApprove: boolean;
}

export interface QaapConversationComposerRuntimeState {
    readonly conversationId: string | undefined;
    readonly pinnedAgentId: string | undefined;
    readonly agentModel: QaapCreateAgentTaskQaiqModel | undefined;
    readonly modeId: string | undefined;
    readonly approvalPolicyId: QaapAgentApprovalPolicyId | undefined;
    readonly toolApprovalRules: QaapAgentToolApprovalRules | undefined;
    readonly draft: string;
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

export function extractConversationComposerPrefsFromSummary(
    summary: Pick<
        QaapAgentConversationSummaryDTO,
        'agentId' | 'agentModel' | 'qaiqModel' | 'interactionModeId' | 'approvalPolicyId' | 'autoApprove' | 'cwd'
    >,
): QaapConversationComposerPrefs | undefined {
    if (!summary.agentId?.trim()) {
        return undefined;
    }
    return extractConversationComposerPrefs({
        id: '',
        cwd: summary.cwd,
        agentId: summary.agentId,
        title: '',
        status: 'idle',
        createdAt: 0,
        updatedAt: 0,
        messages: [],
        agentModel: summary.agentModel ?? summary.qaiqModel,
        interactionModeId: summary.interactionModeId,
        approvalPolicyId: summary.approvalPolicyId,
        autoApprove: summary.autoApprove,
    });
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

export function buildRuntimeComposerPersistPatch(
    agentId: string,
    cwd: string | undefined,
    runtime: {
        readonly agentModel?: QaapCreateAgentTaskQaiqModel;
        readonly modeId?: string;
        readonly approvalPolicyId?: QaapAgentApprovalPolicyId;
        readonly toolApprovalRules?: QaapAgentToolApprovalRules;
    },
): QaapUpdateConversationBody {
    return buildUpdateConversationComposerPatch({
        agentId,
        ...(agentSupportsModelPicker(agentId)
            ? { agentModel: runtime.agentModel ?? readStoredAgentModel(cwd, agentId) }
            : {}),
        ...(runtime.modeId ? { interactionModeId: runtime.modeId } : {}),
        ...(runtime.approvalPolicyId
            ? {
                approvalPolicyId: runtime.approvalPolicyId,
                toolApprovalRules: reconcileAgentToolApprovalRules(
                    runtime.approvalPolicyId,
                    cwd,
                    runtime.toolApprovalRules,
                ),
            }
            : {}),
    });
}

/** Persist composer prefs to project-scoped storage (agent/mode/approval — not per-conversation model). */
export function writeProjectComposerStorage(
    cwd: string | undefined,
    prefs: QaapConversationComposerPrefs,
): void {
    if (!cwd) {
        return;
    }
    writeStoredAgent(cwd, prefs.agentId);
    if (prefs.interactionModeId) {
        writeStoredComposerMode(cwd, prefs.interactionModeId);
    }
    writeStoredAgentApprovalPolicy(cwd, prefs.approvalPolicyId);
    writeStoredAgentToolApprovalRules(cwd, prefs.toolApprovalRules);
}

export function readProjectComposerDefaults(
    cwd: string | undefined,
    defaultAgentId: string,
): QaapConversationComposerPrefs {
    const agentId = migrateLegacyBackendAgentId(readStoredAgent(cwd) ?? defaultAgentId) ?? defaultAgentId;
    const agentModel = readStoredAgentModel(cwd, agentId);
    const approvalPolicyId = reconcileAgentApprovalPolicyId(undefined, cwd);
    const toolApprovalRules = reconcileAgentToolApprovalRules(approvalPolicyId, cwd, undefined);
    const interactionModeId = readStoredComposerMode(cwd);
    return {
        agentId,
        ...(agentModel && agentSupportsModelPicker(agentId) ? { agentModel } : {}),
        ...(interactionModeId ? { interactionModeId } : {}),
        approvalPolicyId,
        toolApprovalRules,
        autoApprove: approvalPolicyId !== 'request-approval',
    };
}

export function applyConversationComposerPrefs(
    prefs: QaapConversationComposerPrefs,
    cwd: string | undefined,
    conversationId: string,
    draft = readConversationComposerDraft(conversationId),
): QaapConversationComposerRuntimeState {
    writeProjectComposerStorage(cwd, prefs);
    return {
        conversationId,
        pinnedAgentId: prefs.agentId,
        agentModel: prefs.agentModel,
        modeId: prefs.interactionModeId,
        approvalPolicyId: prefs.approvalPolicyId,
        toolApprovalRules: prefs.toolApprovalRules,
        draft,
    };
}

export function applyProjectComposerDefaults(
    cwd: string | undefined,
    defaultAgentId: string,
): Omit<QaapConversationComposerRuntimeState, 'draft'> {
    const prefs = readProjectComposerDefaults(cwd, defaultAgentId);
    writeProjectComposerStorage(cwd, prefs);
    return {
        conversationId: undefined,
        pinnedAgentId: prefs.agentId,
        agentModel: prefs.agentModel,
        modeId: prefs.interactionModeId,
        approvalPolicyId: prefs.approvalPolicyId,
        toolApprovalRules: prefs.toolApprovalRules,
    };
}

export function mergeComposerPrefsOntoSummary(
    summary: QaapAgentConversationSummaryDTO,
    patch: QaapUpdateConversationBody,
): QaapAgentConversationSummaryDTO {
    return {
        ...summary,
        ...(patch.agent !== undefined ? { agentId: patch.agent } : {}),
        ...(patch.agentModel !== undefined ? { agentModel: patch.agentModel } : {}),
        ...(patch.interactionModeId !== undefined ? { interactionModeId: patch.interactionModeId } : {}),
        ...(patch.approvalPolicyId !== undefined ? { approvalPolicyId: patch.approvalPolicyId } : {}),
        ...(patch.autoApprove !== undefined ? { autoApprove: patch.autoApprove } : {}),
        ...(patch.toolApprovalRules !== undefined ? { toolApprovalRules: patch.toolApprovalRules } : {}),
    };
}

export function formatConversationComposerSessionMeta(
    summary: Pick<QaapAgentConversationSummaryDTO, 'agentId' | 'agentModel' | 'qaiqModel'>,
    resolveAgentLabel: (agentId: string) => string,
): string | undefined {
    const agentId = migrateLegacyBackendAgentId(summary.agentId) ?? summary.agentId;
    if (!agentId) {
        return undefined;
    }
    const agentLabel = resolveAgentLabel(agentId);
    const model = summary.agentModel ?? summary.qaiqModel;
    if (model?.modelId && agentSupportsModelPicker(agentId)) {
        return `${agentLabel} · ${model.modelId}`;
    }
    return agentLabel;
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
