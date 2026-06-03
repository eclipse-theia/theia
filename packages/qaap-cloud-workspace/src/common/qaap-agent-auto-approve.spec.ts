// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyAutoApproveToCommand,
    commandHasAutoApproveFlags,
    resolveAgentAutoApprove,
    resolveConversationAutoApprove,
    resolveRoutineAutoApprove,
} from './qaap-agent-auto-approve';

describe('qaap-agent-auto-approve', () => {

    const originalEnv = process.env.QAAP_AGENT_AUTO_APPROVE;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.QAAP_AGENT_AUTO_APPROVE;
        } else {
            process.env.QAAP_AGENT_AUTO_APPROVE = originalEnv;
        }
    });

    it('resolveAgentAutoApprove defaults to true', () => {
        delete process.env.QAAP_AGENT_AUTO_APPROVE;
        expect(resolveAgentAutoApprove()).to.equal(true);
        expect(resolveAgentAutoApprove(undefined)).to.equal(true);
    });

    it('resolveAgentAutoApprove respects explicit false and env opt-out', () => {
        expect(resolveAgentAutoApprove(false)).to.equal(false);
        process.env.QAAP_AGENT_AUTO_APPROVE = '0';
        expect(resolveAgentAutoApprove()).to.equal(false);
    });

    it('resolveRoutineAutoApprove is true unless explicitly false', () => {
        expect(resolveRoutineAutoApprove()).to.equal(true);
        expect(resolveRoutineAutoApprove(undefined)).to.equal(true);
        expect(resolveRoutineAutoApprove(false)).to.equal(false);
    });

    it('resolveConversationAutoApprove matches routine default', () => {
        expect(resolveConversationAutoApprove()).to.equal(true);
        expect(resolveConversationAutoApprove(false)).to.equal(false);
    });

    it('applyAutoApproveToCommand adds claude and codex flags', () => {
        expect(applyAutoApproveToCommand("claude -p 'hi'", 'claude'))
            .to.equal("claude --dangerously-skip-permissions -p 'hi'");
        expect(applyAutoApproveToCommand("codex exec 'hi'", 'codex'))
            .to.equal("codex --full-auto exec 'hi'");
        expect(applyAutoApproveToCommand("codex -q 'hi'", 'codex'))
            .to.equal("codex --full-auto -q 'hi'");
    });

    it('applyAutoApproveToCommand is idempotent', () => {
        const already = "claude --dangerously-skip-permissions -p 'hi'";
        expect(applyAutoApproveToCommand(already, 'claude')).to.equal(already);
        expect(commandHasAutoApproveFlags(already)).to.equal(true);
    });

    it('applyAutoApproveToCommand leaves aider unchanged', () => {
        const cmd = "aider --yes-always --message 'hi'";
        expect(applyAutoApproveToCommand(cmd, 'aider')).to.equal(cmd);
    });

    it('applyAutoApproveToCommand adds opencode, cursor, antigravity, and copilot flags', () => {
        expect(applyAutoApproveToCommand("opencode run 'hi'", 'opencode'))
            .to.equal("opencode run --dangerously-skip-permissions 'hi'");
        expect(applyAutoApproveToCommand("cursor-agent 'hi'", 'cursor'))
            .to.equal("cursor-agent -p --force 'hi'");
        expect(applyAutoApproveToCommand("antigravity 'hi'", 'antigravity'))
            .to.equal("antigravity --approval-mode=yolo -p 'hi'");
        expect(applyAutoApproveToCommand("gemini 'hi'", 'antigravity'))
            .to.equal("gemini --approval-mode=yolo -p 'hi'");
        expect(applyAutoApproveToCommand("agy -p 'hi'", 'antigravity'))
            .to.equal("agy --approval-mode=yolo -p 'hi'");
        expect(applyAutoApproveToCommand("copilot -p 'hi'", 'copilot'))
            .to.equal("copilot --autopilot --yolo --max-autopilot-continues 20 -p 'hi'");
        expect(applyAutoApproveToCommand("qwen -p 'hi'", 'qwen'))
            .to.equal("qwen -p --approval-mode yolo 'hi'");
    });
});
