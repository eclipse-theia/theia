// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversation } from './qaap-agent-conversation';
import { planConversationRewind } from './qaap-agent-conversation-rewind';

function conversation(messages: QaapAgentConversation['messages'], checkpoints?: QaapAgentConversation['checkpoints']): Pick<QaapAgentConversation, 'messages' | 'checkpoints'> {
    return { messages, checkpoints };
}

describe('planConversationRewind', () => {
    it('truncates from the target user message and cancels later tasks', () => {
        const plan = planConversationRewind(conversation([
            { id: 'u1', role: 'user', content: 'first', createdAt: 1, taskId: 't1' },
            { id: 'a1', role: 'agent', content: 'ok', createdAt: 2 },
            { id: 'u2', role: 'user', content: 'second', createdAt: 3, taskId: 't2' },
            { id: 'a2', role: 'agent', content: 'done', createdAt: 4 },
        ], [
            { id: 'c1', messageId: 'u1', label: 'Turn 1', commit: 'abc', ref: 'refs/qaap/1', capturedAt: 1 },
        ]), 'u2');
        expect(plan.trimmedMessages.map(message => message.id)).to.deep.equal(['u1', 'a1']);
        expect(plan.taskIdsToCancel).to.deep.equal(['t2']);
        expect(plan.trimmedCheckpoints.map(checkpoint => checkpoint.id)).to.deep.equal(['c1']);
        expect(plan.restoreCheckpoint?.id).to.equal('c1');
    });

    it('does not restore files when rewinding the first user message', () => {
        const plan = planConversationRewind(conversation([
            { id: 'u1', role: 'user', content: 'only', createdAt: 1 },
        ]), 'u1');
        expect(plan.trimmedMessages).to.have.length(0);
        expect(plan.restoreCheckpoint).to.be.undefined;
    });

    it('rejects agent messages', () => {
        expect(() => planConversationRewind(conversation([
            { id: 'a1', role: 'agent', content: 'nope', createdAt: 1 },
        ]), 'a1')).to.throw('Only user messages can be rewound.');
    });
});
