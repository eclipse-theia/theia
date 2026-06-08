// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyAgentApprovalPolicyToCommand,
    resolveEffectiveToolApprovalRules,
} from './qaap-agent-approval-flags';

describe('qaap-agent-approval-flags', () => {

    it('resolveEffectiveToolApprovalRules maps presets to scopes', () => {
        expect(resolveEffectiveToolApprovalRules('request-approval', { shell: true, network: true }))
            .to.deep.equal({ shell: false, network: false });
        expect(resolveEffectiveToolApprovalRules('full-access', { shell: false, network: false }))
            .to.deep.equal({ shell: true, network: true });
        expect(resolveEffectiveToolApprovalRules('approve-for-me', { shell: true, network: false }))
            .to.deep.equal({ shell: true, network: false });
    });

    it('approve-for-me uses acceptEdits for Claude instead of full skip', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "claude --print -p 'hi'",
            { agentId: 'claude', approvalPolicyId: 'approve-for-me', autoApprove: true },
        );
        expect(command).to.include('--permission-mode acceptEdits');
        expect(command).not.to.include('--dangerously-skip-permissions');
    });

    it('approve-for-me with shell enables Bash for Claude', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "claude --print -p 'hi'",
            {
                agentId: 'claude',
                approvalPolicyId: 'approve-for-me',
                autoApprove: true,
                toolApprovalRules: { shell: true, network: false },
            },
        );
        expect(command).to.include('--allowed-tools');
        expect(command).to.include('Bash');
    });

    it('full-access bypasses Claude permissions', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "claude --print -p 'hi'",
            { agentId: 'claude', approvalPolicyId: 'full-access', autoApprove: true },
        );
        expect(command).to.include('--dangerously-skip-permissions');
    });

    it('approve-for-me uses full-auto for Codex', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "codex exec --json 'hi'",
            { agentId: 'codex', approvalPolicyId: 'approve-for-me', autoApprove: true },
        );
        expect(command).to.include('--full-auto');
        expect(command).not.to.include('--dangerously-bypass-approvals-and-sandbox');
    });

    it('request-approval keeps Codex interactive', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "codex exec --json 'hi'",
            { agentId: 'codex', approvalPolicyId: 'request-approval', autoApprove: false },
        );
        expect(command).not.to.include('--full-auto');
    });
});
