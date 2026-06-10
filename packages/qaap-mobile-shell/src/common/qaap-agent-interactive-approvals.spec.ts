// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { usesInteractiveAgentApprovals } from './qaap-agent-interactive-approvals';

describe('qaap-agent-interactive-approvals', () => {

    it('treats request-approval and explicit YOLO-off as interactive', () => {
        expect(usesInteractiveAgentApprovals({ approvalPolicyId: 'request-approval' })).to.equal(true);
        expect(usesInteractiveAgentApprovals({ autoApprove: false })).to.equal(true);
    });

    it('treats full-access as non-interactive', () => {
        expect(usesInteractiveAgentApprovals({ approvalPolicyId: 'full-access', autoApprove: true })).to.equal(false);
    });

    it('treats default approve-for-me as interactive because shell is gated', () => {
        expect(usesInteractiveAgentApprovals({
            approvalPolicyId: 'approve-for-me',
            autoApprove: true,
        })).to.equal(true);
    });

    it('treats approve-for-me with shell+network auto as non-interactive', () => {
        expect(usesInteractiveAgentApprovals({
            approvalPolicyId: 'approve-for-me',
            autoApprove: true,
            toolApprovalRules: { shell: true, network: true },
        })).to.equal(false);
    });
});
