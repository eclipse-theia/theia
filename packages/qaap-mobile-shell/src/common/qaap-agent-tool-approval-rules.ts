// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { hashString } from './qaap-agent-task-client';
import type { QaapAgentApprovalPolicyId } from './qaap-sticky-composer-approval-policy';

/** Optional auto-approve scopes under the {@code approve-for-me} preset. File edits are always included. */
export interface QaapAgentToolApprovalRules {
    readonly shell?: boolean;
    readonly network?: boolean;
}

export const DEFAULT_APPROVE_FOR_ME_TOOL_RULES: QaapAgentToolApprovalRules = {
    shell: false,
    network: false,
};

const TOOL_RULES_STORAGE_KEY = 'qaap.mobile.projects.agentToolApprovalRules';

function scopedToolRulesStorageKey(cwd: string): string {
    return `${TOOL_RULES_STORAGE_KEY}.${hashString(cwd)}`;
}

export function readStoredAgentToolApprovalRules(cwd: string | undefined): QaapAgentToolApprovalRules | undefined {
    if (!cwd) {
        return undefined;
    }
    try {
        const raw = window.localStorage.getItem(scopedToolRulesStorageKey(cwd));
        if (!raw) {
            return undefined;
        }
        const parsed = JSON.parse(raw) as QaapAgentToolApprovalRules;
        return {
            shell: parsed.shell === true,
            network: parsed.network === true,
        };
    } catch {
        return undefined;
    }
}

export function writeStoredAgentToolApprovalRules(
    cwd: string | undefined,
    rules: QaapAgentToolApprovalRules,
): void {
    if (!cwd) {
        return;
    }
    try {
        window.localStorage.setItem(scopedToolRulesStorageKey(cwd), JSON.stringify({
            shell: rules.shell === true,
            network: rules.network === true,
        }));
    } catch {
        /* session-only */
    }
}

export function reconcileAgentToolApprovalRules(
    policyId: QaapAgentApprovalPolicyId | undefined,
    cwd: string | undefined,
    current: QaapAgentToolApprovalRules | undefined,
): QaapAgentToolApprovalRules {
    const policy = policyId ?? 'approve-for-me';
    if (policy === 'full-access') {
        return { shell: true, network: true };
    }
    if (policy === 'request-approval') {
        return { shell: false, network: false };
    }
    const stored = readStoredAgentToolApprovalRules(cwd);
    return {
        shell: current?.shell ?? stored?.shell ?? DEFAULT_APPROVE_FOR_ME_TOOL_RULES.shell,
        network: current?.network ?? stored?.network ?? DEFAULT_APPROVE_FOR_ME_TOOL_RULES.network,
    };
}
