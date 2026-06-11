// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { QaapAgentApprovalRequestDTO } from '../common/qaap-agent-approval-client';
import { TRANSCRIPT_APPROVAL_CARD_ALLOW_CLASS } from './qaap-transcript-approval-card-ui';
import {
    clearTranscriptPendingApprovalBar,
    mountTranscriptPendingApprovalBar,
    TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS,
} from './qaap-transcript-inline-approval-ui';

describe('qaap-transcript-inline-approval-ui', () => {
    let disableJSDOM: () => void;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const pending: QaapAgentApprovalRequestDTO = {
        id: 'conv-1:tool:tool-use-1',
        conversationId: 'conv-1',
        cwd: '/tmp/repo',
        agentId: 'qaiq',
        conversationTitle: 'Test task',
        kind: 'tool',
        toolName: 'Bash',
        toolUseId: 'tool-use-1',
        summary: 'Run npm test',
        createdAt: Date.now(),
    };

    it('mounts pending approval above the composer column', () => {
        const composerHost = document.createElement('div');
        composerHost.className = 'theia-mobile-projects-sticky-composer';
        composerHost.innerHTML = '<div class="theia-mobile-projects-sticky-composer-column"><div class="theia-mobile-projects-sticky-composer-inner"></div></div>';
        mountTranscriptPendingApprovalBar(composerHost, pending, {
            onApprove: () => undefined,
            onReject: () => undefined,
        });
        const column = composerHost.querySelector('.theia-mobile-projects-sticky-composer-column')!;
        expect(column.firstElementChild?.className).to.equal(TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS);
        expect(column.querySelector(`.${TRANSCRIPT_APPROVAL_CARD_ALLOW_CLASS}`)?.textContent).to.equal('Allow');
    });

    it('clearTranscriptPendingApprovalBar removes the host', () => {
        const composerHost = document.createElement('div');
        composerHost.innerHTML = '<div class="theia-mobile-projects-sticky-composer-column"></div>';
        mountTranscriptPendingApprovalBar(composerHost, pending, {
            onApprove: () => undefined,
            onReject: () => undefined,
        });
        clearTranscriptPendingApprovalBar(composerHost);
        expect(composerHost.querySelector(`.${TRANSCRIPT_PENDING_APPROVAL_HOST_CLASS}`)).to.equal(null);
    });
});
