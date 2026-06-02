// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { hashString, isTheiaCoderAgent } from './qaap-agent-task-client';
import { nls } from '@theia/core/lib/common/nls';

const SELECTED_APPROVAL_POLICY_STORAGE_KEY = 'qaap.mobile.projects.agentApprovalPolicy';
const LEGACY_APPROVAL_POLICY_STORAGE_KEY = 'qaap.mobile.projects.codexApprovalPolicy';

/** Agent approval presets shown in the sticky composer controls row. */
export type QaapAgentApprovalPolicyId = 'request-approval' | 'approve-for-me' | 'full-access';

export interface QaapAgentApprovalPolicyOption {
    readonly id: QaapAgentApprovalPolicyId;
    readonly label: string;
    readonly description: string;
    /** Single codicon shown on the toolbar trigger button. */
    readonly toolbarIconClass: string;
    /** Primary codicon in the bottom-sheet row. */
    readonly sheetIconClass: string;
}

export const QAAP_AGENT_APPROVAL_POLICIES: readonly QaapAgentApprovalPolicyOption[] = [
    {
        id: 'request-approval',
        label: nls.localize('qaap/mobileProjects/approvalPolicyRequest', 'Request approval'),
        description: nls.localize(
            'qaap/mobileProjects/approvalPolicyRequestHint',
            'Always ask before editing external files and running risky commands.',
        ),
        toolbarIconClass: 'codicon-inspect',
        sheetIconClass: 'codicon-inspect',
    },
    {
        id: 'approve-for-me',
        label: nls.localize('qaap/mobileProjects/approvalPolicyAuto', 'Approve for me'),
        description: nls.localize(
            'qaap/mobileProjects/approvalPolicyAutoHint',
            'Ask only for actions detected as high risk; approve routine workspace work automatically.',
        ),
        toolbarIconClass: 'codicon-shield',
        sheetIconClass: 'codicon-shield',
    },
    {
        id: 'full-access',
        label: nls.localize('qaap/mobileProjects/approvalPolicyFull', 'Full access'),
        description: nls.localize(
            'qaap/mobileProjects/approvalPolicyFullHint',
            'Unrestricted network and filesystem access without approval prompts.',
        ),
        toolbarIconClass: 'codicon-shield',
        sheetIconClass: 'codicon-shield',
    },
];

export const DEFAULT_AGENT_APPROVAL_POLICY_ID: QaapAgentApprovalPolicyId = 'full-access';

/** VPS / background agents expose the approval picker; local Coder chat does not. */
export function agentSupportsApprovalPolicy(agentId: string | undefined): boolean {
    return !!agentId && !isTheiaCoderAgent(agentId);
}

function scopedApprovalPolicyStorageKey(cwd: string): string {
    return `${SELECTED_APPROVAL_POLICY_STORAGE_KEY}.${hashString(cwd)}`;
}

function scopedLegacyApprovalPolicyStorageKey(cwd: string): string {
    return `${LEGACY_APPROVAL_POLICY_STORAGE_KEY}.${hashString(cwd)}`;
}

export function readStoredAgentApprovalPolicy(cwd: string | undefined): QaapAgentApprovalPolicyId | undefined {
    if (!cwd) {
        return undefined;
    }
    try {
        const raw = window.localStorage.getItem(scopedApprovalPolicyStorageKey(cwd))
            ?? window.localStorage.getItem(scopedLegacyApprovalPolicyStorageKey(cwd));
        return isAgentApprovalPolicyId(raw) ? raw : undefined;
    } catch {
        return undefined;
    }
}

export function writeStoredAgentApprovalPolicy(cwd: string | undefined, policyId: QaapAgentApprovalPolicyId): void {
    if (!cwd) {
        return;
    }
    try {
        window.localStorage.setItem(scopedApprovalPolicyStorageKey(cwd), policyId);
    } catch {
        /* session-only */
    }
}

export function reconcileAgentApprovalPolicyId(
    current: QaapAgentApprovalPolicyId | undefined,
    cwd: string | undefined,
): QaapAgentApprovalPolicyId {
    if (current && QAAP_AGENT_APPROVAL_POLICIES.some(option => option.id === current)) {
        return current;
    }
    const stored = readStoredAgentApprovalPolicy(cwd);
    if (stored) {
        return stored;
    }
    return DEFAULT_AGENT_APPROVAL_POLICY_ID;
}

export function resolveAgentApprovalPolicyOption(
    policyId: QaapAgentApprovalPolicyId | undefined,
): QaapAgentApprovalPolicyOption {
    return QAAP_AGENT_APPROVAL_POLICIES.find(option => option.id === policyId)
        ?? QAAP_AGENT_APPROVAL_POLICIES.find(option => option.id === DEFAULT_AGENT_APPROVAL_POLICY_ID)!;
}

/** Maps the UI preset to the VPS conversation auto-approve flag. */
export function resolveAutoApproveFromApprovalPolicy(policyId: QaapAgentApprovalPolicyId): boolean {
    return policyId !== 'request-approval';
}

function isAgentApprovalPolicyId(value: string | null | undefined): value is QaapAgentApprovalPolicyId {
    return value === 'request-approval' || value === 'approve-for-me' || value === 'full-access';
}
