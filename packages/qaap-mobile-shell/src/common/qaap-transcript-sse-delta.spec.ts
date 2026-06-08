// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import {
    applyConversationMessageDelta,
    canApplySseMessageDelta,
    shouldSkipStreamingTranscriptRefetch,
} from './qaap-transcript-sse-delta';

const baseConv = (): QaapAgentConversationDTO => ({
    id: 'conv-1',
    cwd: '/repo',
    agentId: 'qaiq',
    title: 'Test',
    status: 'streaming',
    createdAt: 1,
    updatedAt: 10,
    messages: [{
        id: 'user-1',
        role: 'user',
        content: 'hi',
        createdAt: 5,
    }],
});

describe('canApplySseMessageDelta', () => {
    it('accepts structured agent segments for QAIQ', () => {
        expect(canApplySseMessageDelta(baseConv(), 'conv-1', {
            id: 'agent-1',
            role: 'agent',
            content: '…',
            segments: [{ type: 'text', content: 'Hello' }],
            createdAt: 12,
        })).to.equal(true);
    });

    it('rejects unknown conversations', () => {
        expect(canApplySseMessageDelta(baseConv(), 'other', {
            id: 'agent-1',
            role: 'agent',
            content: 'Hello',
            createdAt: 12,
        })).to.equal(false);
    });

    it('rejects stale deltas after the turn has settled', () => {
        const idle = { ...baseConv(), status: 'idle' as const };
        expect(canApplySseMessageDelta(idle, 'conv-1', {
            id: 'agent-1',
            role: 'agent',
            content: 'late chunk',
            createdAt: 30,
        })).to.equal(false);
    });

    it('accepts codex stdout agent chunks with plain content', () => {
        const conv = { ...baseConv(), agentId: 'codex' };
        expect(canApplySseMessageDelta(conv, 'conv-1', {
            id: 'agent-1',
            role: 'agent',
            content: 'plain stdout',
            createdAt: 12,
        })).to.equal(true);
    });
});

describe('shouldSkipStreamingTranscriptRefetch', () => {
    it('returns true while streaming and a recent SSE delta was applied', () => {
        const conv = { ...baseConv(), status: 'streaming' as const };
        expect(shouldSkipStreamingTranscriptRefetch(conv, Date.now())).to.equal(true);
        expect(shouldSkipStreamingTranscriptRefetch(conv, Date.now() - 20_000)).to.equal(false);
    });
});

describe('applyConversationMessageDelta', () => {
    it('appends a new agent message', () => {
        const next = applyConversationMessageDelta(baseConv(), {
            id: 'agent-1',
            role: 'agent',
            content: 'Hello',
            segments: [{ type: 'text', content: 'Hello' }],
            createdAt: 20,
        });
        expect(next.messages).to.have.length(2);
        expect(next.messages[1]?.id).to.equal('agent-1');
        expect(next.updatedAt).to.equal(20);
        expect(next.status).to.equal('streaming');
    });

    it('updates an existing agent message in place', () => {
        const withAgent = applyConversationMessageDelta(baseConv(), {
            id: 'agent-1',
            role: 'agent',
            content: 'Hel',
            segments: [{ type: 'text', content: 'Hel' }],
            createdAt: 20,
        });
        const next = applyConversationMessageDelta(withAgent, {
            id: 'agent-1',
            role: 'agent',
            content: 'Hello',
            segments: [{ type: 'text', content: 'Hello' }],
            createdAt: 21,
        });
        expect(next.messages).to.have.length(2);
        expect(next.messages[1]?.content).to.equal('Hello');
        expect(next.updatedAt).to.equal(21);
    });
});
