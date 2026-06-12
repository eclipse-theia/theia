// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { localizeGenericAgentFailureMessage } from './qaap-agent-failure-message';
import { normalizeAgentConversationFailures, type QaapAgentConversationDTO } from './qaap-agent-conversation-client';

function conversation(messages: QaapAgentConversationDTO['messages']): QaapAgentConversationDTO {
    return {
        id: 'conv-1',
        cwd: '/workspace',
        agentId: 'qaiq',
        title: 'Test',
        status: 'failed',
        createdAt: 1,
        updatedAt: 2,
        messages,
    };
}

describe('normalizeAgentConversationFailures', () => {
    it('moves legacy user errors onto the next agent row', () => {
        const normalized = normalizeAgentConversationFailures(conversation([
            {
                id: 'u1',
                role: 'user',
                content: 'fix it',
                createdAt: 1,
                error: 'Agent failed (exit 1).',
            },
            {
                id: 'a1',
                role: 'agent',
                content: 'partial output',
                createdAt: 2,
            },
        ]));
        expect(normalized.messages[0].error).to.equal(undefined);
        expect(normalized.messages[1].error).to.equal('Agent failed (exit 1).');
    });

    it('inserts a synthetic agent failure row when no agent reply exists', () => {
        const normalized = normalizeAgentConversationFailures(conversation([
            {
                id: 'u1',
                role: 'user',
                content: 'fix it',
                createdAt: 1,
                error: localizeGenericAgentFailureMessage('failed', 1),
            },
        ]));
        expect(normalized.messages).to.have.length(2);
        expect(normalized.messages[1].role).to.equal('agent');
        expect(normalized.messages[1].error).to.equal(localizeGenericAgentFailureMessage('failed', 1));
    });
});
