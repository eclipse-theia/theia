// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentApprovalPolicyId } from './qaap-sticky-composer-approval-policy';

export type QaapComposerInteractionModeId = 'agent' | 'plan' | 'ask';

export interface QaapQaiqInteractionFlagOptions {
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: QaapAgentApprovalPolicyId;
    /** VPS auto-approve flag from the composer approval picker. */
    readonly autoApprove?: boolean;
}

/**
 * Maps composer interaction mode + approval policy to QAIQ CLI flags.
 * Replaces ad-hoc {@code --dangerously-skip-permissions} on the runner template.
 */
export function formatQaiqInteractionFlags(options: QaapQaiqInteractionFlagOptions): string {
    const mode = normalizeInteractionModeId(options.interactionModeId);
    if (mode === 'plan') {
        return '--permission-mode plan';
    }
    if (mode === 'ask') {
        return '--permission-mode default --disallowed-tools Edit Write NotebookEdit Bash';
    }
    if (options.autoApprove === false || options.approvalPolicyId === 'request-approval') {
        return '--permission-mode default';
    }
    if (options.approvalPolicyId === 'approve-for-me') {
        return '--permission-mode acceptEdits';
    }
    return '--permission-mode bypassPermissions';
}

export function normalizeInteractionModeId(modeId: string | undefined): QaapComposerInteractionModeId {
    if (modeId === 'plan' || modeId === 'ask') {
        return modeId;
    }
    return 'agent';
}

/** QAIQ permission flags are authoritative — do not also inject {@code --dangerously-skip-permissions}. */
export function qaiqCommandUsesInteractionFlags(command: string): boolean {
    return /\b(qaiq|openclaude)\b/.test(command) && /--permission-mode\b/.test(command);
}
