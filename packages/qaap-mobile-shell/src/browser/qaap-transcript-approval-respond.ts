// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { approveAgentRequest, rejectAgentRequest } from '../common/qaap-agent-approval-client';
import { MobileSnackbar } from './mobile-snackbar';
import { setTranscriptApprovalCardBusy, TRANSCRIPT_APPROVAL_CARD_CLASS } from './qaap-transcript-approval-card-ui';

export interface TranscriptApprovalRespondCallbacks {
    readonly onSettled?: () => void;
}

/** Approve or reject a VPS tool permission and surface failures in the mobile snackbar. */
export async function respondToTranscriptApproval(
    approvalId: string,
    action: 'approve' | 'reject',
    options: {
        readonly card?: HTMLElement;
        readonly fromEvent?: Event;
        readonly callbacks?: TranscriptApprovalRespondCallbacks;
    } = {},
): Promise<boolean> {
    options.fromEvent?.stopPropagation();
    options.fromEvent?.preventDefault();
    const card = options.card ?? (options.fromEvent?.currentTarget instanceof HTMLElement
        ? options.fromEvent.currentTarget.closest<HTMLElement>(`.${TRANSCRIPT_APPROVAL_CARD_CLASS}`) ?? undefined
        : undefined);
    if (card) {
        setTranscriptApprovalCardBusy(card, true);
    }
    try {
        const result = action === 'approve'
            ? await approveAgentRequest(approvalId)
            : await rejectAgentRequest(approvalId);
        if (result.ok) {
            card?.remove();
            options.callbacks?.onSettled?.();
            return true;
        }
        const fallback = action === 'approve'
            ? nls.localize(
                'qaap/mobileProjects/transcriptApprovalApproveFailed',
                'Could not approve this action. It may have expired — check the approval bar below or send a follow-up.',
            )
            : nls.localize(
                'qaap/mobileProjects/transcriptApprovalRejectFailed',
                'Could not reject this action.',
            );
        MobileSnackbar.show(result.error ?? fallback, { kind: 'warning', duration: 4200 });
        if (card) {
            setTranscriptApprovalCardBusy(card, false);
        }
        return false;
    } catch (error) {
        MobileSnackbar.show(error instanceof Error ? error.message : String(error), { kind: 'warning', duration: 4200 });
        if (card) {
            setTranscriptApprovalCardBusy(card, false);
        }
        return false;
    }
}
