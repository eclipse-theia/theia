// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { applyAutoApproveToCommand } from './qaap-agent-auto-approve';
import type { QaapAgentConversation } from './qaap-agent-conversation';
import {
    conversationTurnUsesAutoApprove,
    patchConversationAutoApprove,
} from './qaap-agent-conversation-auto-approve';

describe('qaap-agent-conversation-auto-approve', () => {

    it('patchConversationAutoApprove clears opt-out when composer requests auto-approve', () => {
        const conv = { autoApprove: false as const };
        expect(patchConversationAutoApprove(conv, true)).to.deep.equal({ autoApprove: undefined });
        expect(conversationTurnUsesAutoApprove({ ...conv, ...patchConversationAutoApprove(conv, true) }))
            .to.equal(true);
    });

    it('patchConversationAutoApprove enforces manual approval when composer requests it', () => {
        const conv = { autoApprove: undefined };
        expect(patchConversationAutoApprove(conv, false)).to.deep.equal({ autoApprove: false });
        expect(conversationTurnUsesAutoApprove({ ...conv, ...patchConversationAutoApprove(conv, false) }))
            .to.equal(false);
    });

    it('patchConversationAutoApprove leaves stored policy when override is omitted', () => {
        expect(patchConversationAutoApprove({ autoApprove: false })).to.deep.equal({ autoApprove: false });
        expect(patchConversationAutoApprove({ autoApprove: undefined })).to.deep.equal({ autoApprove: undefined });
    });

    it('full-access composer policy produces agy YOLO flags for Antigravity', () => {
        const conv = { autoApprove: false as const };
        const patched = { ...conv, ...patchConversationAutoApprove(conv, true) };
        const base = "agy -p 'que hace esta app'";
        const command = buildAntigravityCommandForTurn(base, patched);
        expect(command).to.include('--approval-mode=yolo');
        expect(command).to.match(/^agy --approval-mode=yolo -p /);
    });

    it('request-approval composer policy skips YOLO injection on the task runner path', () => {
        const conv = { autoApprove: undefined };
        const patched = { ...conv, ...patchConversationAutoApprove(conv, false) };
        const base = "agy -p 'hi'";
        expect(buildAntigravityCommandForTurn(base, patched)).to.equal(base);
    });
});

/** Mirrors {@link QaapAgentTaskRunner.buildAgentCommand} auto-approve branch. */
function buildAntigravityCommandForTurn(
    baseCommand: string,
    conv: Pick<QaapAgentConversation, 'autoApprove'>,
): string {
    return conversationTurnUsesAutoApprove(conv)
        ? applyAutoApproveToCommand(baseCommand, 'antigravity')
        : baseCommand;
}
