// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveEffectiveConversationStatus, toConversationSummary } from './qaap-agent-conversation';
import type { QaapAgentConversation } from './qaap-agent-conversation';

function conversation(partial: Partial<QaapAgentConversation> & Pick<QaapAgentConversation, 'status'>): QaapAgentConversation {
    return {
        id: 'conv-1',
        cwd: '/workspace',
        agentId: 'codex',
        title: 'Test',
        createdAt: 1,
        updatedAt: 2,
        messages: [],
        ...partial,
    };
}

describe('resolveEffectiveConversationStatus', () => {
    it('keeps streaming while a turn is in flight', () => {
        expect(resolveEffectiveConversationStatus(conversation({ status: 'streaming' }))).to.equal('streaming');
    });

    it('reports failed when a user turn still carries an error', () => {
        const status = resolveEffectiveConversationStatus(conversation({
            status: 'idle',
            messages: [{
                id: 'u1',
                role: 'user',
                content: 'fix it',
                createdAt: 1,
                error: 'Agent failed (exit 1).',
            }],
        }));
        expect(status).to.equal('failed');
    });

    it('surfaces failed in list summaries even when stored status was cleared', () => {
        const summary = toConversationSummary(conversation({
            status: 'idle',
            messages: [
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
                    content: 'log tail',
                    createdAt: 2,
                },
            ],
        }));
        expect(summary.status).to.equal('failed');
    });
});
