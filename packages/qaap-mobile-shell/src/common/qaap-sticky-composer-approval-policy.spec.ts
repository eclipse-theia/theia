// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { THEIA_CODER_AGENT_ID } from './qaap-agent-task-client';
import {
    agentSupportsApprovalPolicy,
    DEFAULT_AGENT_APPROVAL_POLICY_ID,
    reconcileAgentApprovalPolicyId,
    resolveAutoApproveFromApprovalPolicy,
} from './qaap-sticky-composer-approval-policy';

describe('qaap-sticky-composer-approval-policy', () => {
    it('enables the approval picker for VPS agents but not local Coder', () => {
        expect(agentSupportsApprovalPolicy('codex')).to.equal(true);
        expect(agentSupportsApprovalPolicy('qaiq')).to.equal(true);
        expect(agentSupportsApprovalPolicy('claude')).to.equal(true);
        expect(agentSupportsApprovalPolicy(THEIA_CODER_AGENT_ID)).to.equal(false);
        expect(agentSupportsApprovalPolicy(undefined)).to.equal(false);
    });

    it('defaults to full access when nothing is stored', () => {
        expect(reconcileAgentApprovalPolicyId(undefined, undefined))
            .to.equal(DEFAULT_AGENT_APPROVAL_POLICY_ID);
    });

    it('reconciles an explicit current policy before storage', () => {
        expect(reconcileAgentApprovalPolicyId('request-approval', '/tmp/repo-a')).to.equal('request-approval');
        expect(reconcileAgentApprovalPolicyId('full-access', '/tmp/repo-a')).to.equal('full-access');
    });

    it('maps request approval to manual VPS approval', () => {
        expect(resolveAutoApproveFromApprovalPolicy('request-approval')).to.equal(false);
        expect(resolveAutoApproveFromApprovalPolicy('approve-for-me')).to.equal(true);
        expect(resolveAutoApproveFromApprovalPolicy('full-access')).to.equal(true);
    });
});
