// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildToolApprovalId,
    detectLogApprovalPrompt,
    extractPendingToolApprovals,
    summarizeToolApproval,
} from './qaap-agent-approval';
import type { QaapAgentConversation } from './qaap-agent-conversation';

describe('qaap-agent-approval', () => {

    it('summarizeToolApproval prefers file_path from JSON args', () => {
        const result = summarizeToolApproval('Edit', '{"file_path":"src/config/env.ts"}');
        expect(result.summary).to.equal('Edit · src/config/env.ts');
    });

    it('extractPendingToolApprovals returns unfinished tools when manual approval is on', () => {
        const conv: QaapAgentConversation = {
            id: 'conv-1',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 'Fix env',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            autoApprove: false,
            messages: [{
                id: 'm1',
                role: 'agent',
                content: '…',
                createdAt: 2,
                segments: [{
                    type: 'tool',
                    toolUseId: 'tool-1',
                    name: 'Bash',
                    args: '{"command":"npm test"}',
                    finished: false,
                }],
            }],
        };
        const pending = extractPendingToolApprovals(conv, 'task-1');
        expect(pending).to.have.length(1);
        expect(pending[0].id).to.equal(buildToolApprovalId('conv-1', 'tool-1'));
        expect(pending[0].taskId).to.equal('task-1');
    });

    it('detectLogApprovalPrompt finds permission lines in log tail', () => {
        const detected = detectLogApprovalPrompt('Working…\nDo you want to allow this tool?\n> ');
        expect(detected?.summary).to.match(/allow this tool/i);
    });
});
