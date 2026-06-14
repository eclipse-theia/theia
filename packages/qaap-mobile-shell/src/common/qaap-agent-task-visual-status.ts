// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

export type QaapAgentTaskVisualStatusId =
    | 'idle'
    | 'running'
    | 'needs-you'
    | 'failed'
    | 'pr-ready'
    | 'verified';

export interface QaapAgentTaskVisualStatus {
    readonly id: QaapAgentTaskVisualStatusId;
    readonly labelKey: string;
    readonly label: string;
    readonly className: string;
    readonly iconClass?: string;
    readonly color: string;
}

const STATUS_BY_ID: Record<QaapAgentTaskVisualStatusId, QaapAgentTaskVisualStatus> = {
    'idle': {
        id: 'idle',
        labelKey: 'qaap/mobileProjects/taskStateIdle',
        label: 'idle',
        className: 'theia-mod-idle',
        color: 'var(--theia-descriptionForeground)',
    },
    'running': {
        id: 'running',
        labelKey: 'qaap/mobileProjects/taskStateRunning',
        label: 'running',
        className: 'theia-mod-running',
        color: 'var(--theia-charts-green, #4caf7c)',
    },
    'needs-you': {
        id: 'needs-you',
        labelKey: 'qaap/mobileProjects/taskStateNeedsInput',
        label: 'needs you',
        className: 'theia-mod-needs-input',
        iconClass: 'codicon-warning',
        color: 'var(--theia-notificationsWarningIcon-foreground, #cca700)',
    },
    'failed': {
        id: 'failed',
        labelKey: 'qaap/mobileProjects/taskStateFailed',
        label: 'failed',
        className: 'theia-mod-failed',
        iconClass: 'codicon-error',
        color: 'var(--theia-errorForeground, #f14c4c)',
    },
    'pr-ready': {
        id: 'pr-ready',
        labelKey: 'qaap/mobileProjects/taskStatePrReady',
        label: 'PR ready',
        className: 'theia-mod-pr-ready',
        iconClass: 'codicon-git-pull-request',
        color: 'var(--theia-charts-purple, #b180d7)',
    },
    'verified': {
        id: 'verified',
        labelKey: 'qaap/mobileProjects/taskStateVerified',
        label: 'verified',
        className: 'theia-mod-verified',
        iconClass: 'codicon-pass',
        color: 'var(--theia-charts-green, #4caf7c)',
    },
};

export function resolveQaapAgentTaskVisualStatus(
    task: { readonly state: string },
    summary?: Pick<QaapAgentConversationSummaryDTO,
        'status' | 'priority' | 'lastMessageRole' | 'messageCount' | 'linkedPullRequest'>,
    unread = false,
): QaapAgentTaskVisualStatus {
    const state = task.state;
    if (state === 'failed' || state === 'interrupted' || summary?.status === 'failed') {
        return STATUS_BY_ID['failed'];
    }
    if (state === 'queued') {
        return {
            ...STATUS_BY_ID['idle'],
            labelKey: 'qaap/mobileProjects/taskStateQueued',
            label: 'queued',
        };
    }
    if (state === 'running' || summary?.status === 'streaming') {
        return STATUS_BY_ID['running'];
    }
    if (
        state === 'needs-input'
        || summary?.priority
        || (unread && summary?.lastMessageRole === 'agent' && (summary.messageCount ?? 0) > 0)
    ) {
        return STATUS_BY_ID['needs-you'];
    }
    if (summary?.linkedPullRequest?.number || summary?.linkedPullRequest?.branch) {
        return STATUS_BY_ID['pr-ready'];
    }
    if (state === 'completed' || state === 'verified' || state === 'ok') {
        return STATUS_BY_ID['verified'];
    }
    return STATUS_BY_ID['idle'];
}

