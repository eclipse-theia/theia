// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { formatQaiqInteractionFlags, normalizeInteractionModeId } from './qaap-qaiq-interaction-flags';

describe('qaap-qaiq-interaction-flags', () => {

    it('formatQaiqInteractionFlags maps plan and ask modes', () => {
        expect(formatQaiqInteractionFlags({ interactionModeId: 'plan' }))
            .to.equal('--permission-mode plan');
        expect(formatQaiqInteractionFlags({ interactionModeId: 'ask' }))
            .to.include('--permission-mode default')
            .and.to.include('--disallowed-tools');
    });

    it('formatQaiqInteractionFlags maps approval presets in agent mode', () => {
        expect(formatQaiqInteractionFlags({ approvalPolicyId: 'request-approval' }))
            .to.equal('--permission-mode default');
        expect(formatQaiqInteractionFlags({ autoApprove: false }))
            .to.equal('--permission-mode default');
        expect(formatQaiqInteractionFlags({ approvalPolicyId: 'approve-for-me' }))
            .to.equal('--permission-mode acceptEdits');
        expect(formatQaiqInteractionFlags({ approvalPolicyId: 'full-access' }))
            .to.equal('--permission-mode bypassPermissions');
    });

    it('normalizeInteractionModeId falls back to agent', () => {
        expect(normalizeInteractionModeId(undefined)).to.equal('agent');
        expect(normalizeInteractionModeId('plan')).to.equal('plan');
    });
});
