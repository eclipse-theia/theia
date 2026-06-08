// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    DEFAULT_APPROVE_FOR_ME_TOOL_RULES,
    reconcileAgentToolApprovalRules,
} from './qaap-agent-tool-approval-rules';

describe('qaap-agent-tool-approval-rules', () => {

    it('reconcileAgentToolApprovalRules defaults shell/network off for approve-for-me', () => {
        expect(reconcileAgentToolApprovalRules('approve-for-me', '/tmp/repo', undefined))
            .to.deep.equal(DEFAULT_APPROVE_FOR_ME_TOOL_RULES);
    });

    it('reconcileAgentToolApprovalRules enables all scopes for full-access', () => {
        expect(reconcileAgentToolApprovalRules('full-access', '/tmp/repo', undefined))
            .to.deep.equal({ shell: true, network: true });
    });
});
