// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type { QaapAgentApprovalRequestDTO } from '../common/qaap-agent-approval-client';
import {
    buildTranscriptApprovalCard,
    TRANSCRIPT_APPROVAL_CARD_CLASS,
} from './qaap-transcript-approval-card-ui';

export const TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS = 'theia-mobile-sticky-composer-pending-approval-host';

export function removeTranscriptPendingApprovalHosts(root: ParentNode): void {
    root.querySelectorAll(`.${TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS}`).forEach(node => node.remove());
    root.querySelectorAll(`.${TRANSCRIPT_APPROVAL_CARD_CLASS}.theia-mod-inline`).forEach(node => node.remove());
}

export function buildTranscriptPendingApprovalBar(
    pending: QaapAgentApprovalRequestDTO,
    handlers: {
        readonly onApprove: () => void;
        readonly onReject: () => void;
    },
): HTMLElement {
    const toolLabel = pending.toolName?.trim() || nls.localize('qaap/mobileProjects/transcriptApprovalToolFallback', 'tool');
    return buildTranscriptApprovalCard({
        surface: 'inline',
        title: nls.localize(
            'qaap/mobileProjects/transcriptApprovalWaitingTitle',
            'Agent waiting — allow {0}?',
            toolLabel,
        ),
        description: pending.summary?.trim()
            ? `${pending.summary}\n${nls.localize(
                'qaap/mobileProjects/transcriptApprovalComposerHint',
                'Use Allow here so the agent can continue this step.',
            )}`
            : nls.localize(
                'qaap/mobileProjects/transcriptApprovalComposerHint',
                'Use Allow here so the agent can continue this step.',
            ),
    }, {
        onApprove: () => { handlers.onApprove(); },
        onReject: () => { handlers.onReject(); },
    });
}

/** Bring the sticky composer approval bar into view — it sits above the floating input card. */
export function scrollTranscriptPendingApprovalIntoView(composerHost: HTMLElement | undefined): void {
    const host = composerHost?.querySelector(`.${TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS}`);
    if (host instanceof HTMLElement) {
        host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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
