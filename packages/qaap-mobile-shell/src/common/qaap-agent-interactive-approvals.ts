// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { reconcileAgentToolApprovalRules, type QaapAgentToolApprovalRules } from './qaap-agent-tool-approval-rules';
import type { QaapAgentApprovalPolicyId } from './qaap-sticky-composer-approval-policy';

export interface QaapInteractiveApprovalOptions {
    readonly approvalPolicyId?: QaapAgentApprovalPolicyId | string;
    readonly autoApprove?: boolean;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
    readonly cwd?: string;
}

/**
 * Whether a VPS agent run can pause mid-turn for tool permission approval.
 * True for "request approval", explicit YOLO-off, and "approve for me" when shell
 * or network are not both auto-approved — those presets still hit Bash/WebFetch
 * prompts that headless QAIQ cannot answer without the stdio control protocol.
 */
export function usesInteractiveAgentApprovals(options: QaapInteractiveApprovalOptions): boolean {
    if (options.autoApprove === false || options.approvalPolicyId === 'request-approval') {
        return true;
    }
    const policyId = isAgentApprovalPolicyId(options.approvalPolicyId)
        ? options.approvalPolicyId
        : 'approve-for-me';
    if (policyId === 'full-access') {
        return false;
    }
    const rules = reconcileAgentToolApprovalRules(policyId, options.cwd, options.toolApprovalRules);
    return !(rules.shell && rules.network);
}

export function conversationUsesInteractiveApprovals(
    conv: Pick<QaapInteractiveApprovalOptions, 'approvalPolicyId' | 'autoApprove' | 'toolApprovalRules' | 'cwd'>,
): boolean {
    return usesInteractiveAgentApprovals({
        approvalPolicyId: conv.approvalPolicyId,
        autoApprove: conv.autoApprove === false ? false : undefined,
        toolApprovalRules: conv.toolApprovalRules,
        cwd: conv.cwd,
    });
}

function isAgentApprovalPolicyId(value: string | undefined): value is QaapAgentApprovalPolicyId {
    return value === 'request-approval' || value === 'approve-for-me' || value === 'full-access';
}
