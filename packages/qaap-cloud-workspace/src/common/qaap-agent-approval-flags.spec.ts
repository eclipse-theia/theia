// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyAgentApprovalPolicyToCommand,
    resolveEffectiveToolApprovalRules,
    shouldUseInteractiveAgentApprovals,
    shouldUseQaiqStdioApprovals,
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

    it('approve-for-me allows read-only exploration for QAIQ', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "qaiq --print -p 'hi'",
            { agentId: 'qaiq', approvalPolicyId: 'approve-for-me', autoApprove: true },
        );
        expect(command).to.include('--allowed-tools');
        expect(command).to.include('Read');
        expect(command).to.include('Grep');
        expect(command).not.to.include('acceptEdits');
    });

    it('approve-for-me strips template acceptEdits before injecting allowed-tools', () => {
        const command = applyAgentApprovalPolicyToCommand(
            "qaiq --permission-mode acceptEdits --print -p 'hi'",
            { agentId: 'qaiq', approvalPolicyId: 'approve-for-me', autoApprove: true },
        );
        expect(command).to.include('--permission-mode default');
        expect(command).to.include('--allowed-tools');
        expect(command).not.to.include('acceptEdits');
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

    it('default approve-for-me still needs QAIQ stdio for gated shell', () => {
        expect(shouldUseQaiqStdioApprovals({
            agentId: 'qaiq',
            approvalPolicyId: 'approve-for-me',
            autoApprove: true,
        })).to.equal(true);
        expect(shouldUseInteractiveAgentApprovals({
            agentId: 'qaiq',
            approvalPolicyId: 'approve-for-me',
            autoApprove: true,
        })).to.equal(false);
    });
});
