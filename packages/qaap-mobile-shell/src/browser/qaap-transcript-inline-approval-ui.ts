// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type { QaapAgentApprovalRequestDTO } from '../common/qaap-agent-approval-client';

export const TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS = 'theia-mobile-sticky-composer-pending-approval-host';

export function removeTranscriptPendingApprovalHosts(root: ParentNode): void {
    root.querySelectorAll(`.${TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS}`).forEach(node => node.remove());
    root.querySelectorAll('.theia-mobile-agent-transcript-inline-approval').forEach(node => node.remove());
}

export function buildTranscriptPendingApprovalBar(
    pending: QaapAgentApprovalRequestDTO,
    handlers: {
        readonly onApprove: () => void;
        readonly onReject: () => void;
    },
): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'theia-mobile-agent-transcript-inline-approval';
    const title = document.createElement('div');
    title.className = 'theia-mobile-agent-transcript-inline-approval-title';
    title.textContent = pending.toolName
        ? nls.localize('qaap/mobileProjects/transcriptApprovalTool', 'Approve tool: {0}', pending.toolName)
        : nls.localize('qaap/mobileProjects/transcriptApprovalPending', 'Approval required');
    const summary = document.createElement('p');
    summary.className = 'theia-mobile-agent-transcript-inline-approval-summary';
    summary.textContent = pending.summary;
    const actions = document.createElement('div');
    actions.className = 'theia-mobile-agent-transcript-inline-approval-actions';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'theia-mobile-agent-transcript-inline-approval-approve';
    approve.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalAllow', 'Allow');
    approve.addEventListener('click', () => { handlers.onApprove(); });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'theia-mobile-agent-transcript-inline-approval-reject';
    reject.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalDeny', 'Deny');
    reject.addEventListener('click', () => { handlers.onReject(); });
    actions.append(approve, reject);
    bar.append(title, summary, actions);
    return bar;
}

export function clearTranscriptPendingApprovalBar(composerHost: HTMLElement | undefined): void {
    if (!composerHost) {
        return;
    }
    removeTranscriptPendingApprovalHosts(composerHost);
}

/** Mount pending approval above the codex composer lip so it stays visible on mobile. */
export function mountTranscriptPendingApprovalBar(
    composerHost: HTMLElement | undefined,
    pending: QaapAgentApprovalRequestDTO | undefined,
    handlers: {
        readonly onApprove: () => void;
        readonly onReject: () => void;
    },
): void {
    clearTranscriptPendingApprovalBar(composerHost);
    if (!pending || !composerHost) {
        return;
    }
    const column = composerHost.querySelector(':scope .theia-mobile-projects-sticky-composer-column')
        ?? composerHost.querySelector('.theia-mobile-projects-sticky-composer-column');
    if (!(column instanceof HTMLElement)) {
        return;
    }
    const host = document.createElement('div');
    host.className = TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS;
    host.append(buildTranscriptPendingApprovalBar(pending, handlers));
    column.insertBefore(host, column.firstChild);
}
