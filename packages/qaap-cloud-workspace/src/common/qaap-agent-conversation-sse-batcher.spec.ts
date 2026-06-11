// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationEvent } from './qaap-agent-conversation';
import { QaapAgentConversationSseBatcher } from './qaap-agent-conversation-sse-batcher';

function summary(status: 'idle' | 'streaming' = 'streaming') {
    return {
        id: 'conv-1',
        cwd: '/workspace',
        agentId: 'qaiq',
        title: 'Test',
        status,
        createdAt: 1,
        updatedAt: 2,
        messageCount: 1,
    };
}

describe('QaapAgentConversationSseBatcher', () => {
    it('coalesces streaming message and updated events', async () => {
        const emitted: QaapAgentConversationEvent[] = [];
        const batcher = new QaapAgentConversationSseBatcher(event => emitted.push(event), 16);
        batcher.enqueue({
            type: 'message',
            conversationId: 'conv-1',
            cwd: '/workspace',
            message: { id: 'm1', role: 'agent', content: 'a', createdAt: 1 },
        });
        batcher.enqueue({
            type: 'message',
            conversationId: 'conv-1',
            cwd: '/workspace',
            message: { id: 'm1', role: 'agent', content: 'ab', createdAt: 1 },
        });
        batcher.enqueue({ type: 'updated', conversation: summary('streaming') });
        expect(emitted).to.have.length(0);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(emitted).to.have.length(2);
        expect(emitted[0]).to.deep.equal({
            type: 'message',
            conversationId: 'conv-1',
            cwd: '/workspace',
            message: { id: 'm1', role: 'agent', content: 'ab', createdAt: 1 },
        });
        expect(emitted[1]?.type).to.equal('updated');
        batcher.dispose();
    });

    it('flushes immediately for settled conversation updates', () => {
        const emitted: QaapAgentConversationEvent[] = [];
        const batcher = new QaapAgentConversationSseBatcher(event => emitted.push(event), 16);
        batcher.enqueue({
            type: 'message',
            conversationId: 'conv-1',
            cwd: '/workspace',
            message: { id: 'm1', role: 'agent', content: 'partial', createdAt: 1 },
        });
        batcher.enqueue({ type: 'updated', conversation: summary('idle') });
        expect(emitted).to.have.length(2);
        expect(emitted[0]?.type).to.equal('message');
        expect(emitted[1]?.type).to.equal('updated');
        batcher.dispose();
    });
});
