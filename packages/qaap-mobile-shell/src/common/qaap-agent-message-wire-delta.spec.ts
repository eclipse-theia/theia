// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyAgentMessageWireDelta,
    computeAgentMessageWireDelta,
    type QaapAgentMessageWireSnapshot,
} from './qaap-agent-message-wire-delta';
import type { QaapAgentMessageDTO } from './qaap-agent-conversation-client';

function agentMessage(partial: Partial<QaapAgentMessageDTO> & Pick<QaapAgentMessageDTO, 'id'>): QaapAgentMessageWireSnapshot {
    return {
        id: partial.id,
        role: 'agent',
        content: partial.content ?? '',
        createdAt: partial.createdAt ?? 1,
        ...(partial.segments ? { segments: [...partial.segments] } : {}),
    };
}

describe('computeAgentMessageWireDelta', () => {
    it('starts a new agent row', () => {
        const next = agentMessage({ id: 'a1', content: 'Hi' });
        const delta = computeAgentMessageWireDelta(undefined, next, 'shell');
        expect(delta.kind).to.equal('message_start');
        if (delta.kind === 'message_start') {
            expect(delta.message).to.deep.equal({
                id: 'a1',
                role: 'agent',
                content: 'Hi',
                createdAt: 1,
            });
        }
    });

    it('appends stdout content incrementally', () => {
        const prev = agentMessage({ id: 'a1', content: 'Hel' });
        const next = agentMessage({ id: 'a1', content: 'Hello' });
        expect(computeAgentMessageWireDelta(prev, next, 'shell')).to.deep.equal({
            kind: 'append_content',
            messageId: 'a1',
            text: 'lo',
        });
    });

    it('appends structured text segment deltas', () => {
        const prev = agentMessage({
            id: 'a1',
            segments: [{ type: 'text', content: 'Hel' }],
        });
        const next = agentMessage({
            id: 'a1',
            segments: [{ type: 'text', content: 'Hello' }],
        });
        expect(computeAgentMessageWireDelta(prev, next, 'qaiq')).to.deep.equal({
            kind: 'append_segment_text',
            messageId: 'a1',
            segmentIndex: 0,
            text: 'lo',
        });
    });

    it('patches streaming tool results incrementally', () => {
        const prev = agentMessage({
            id: 'a1',
            segments: [{
                type: 'tool',
                toolUseId: 't1',
                name: 'Read',
                args: '{}',
                finished: false,
                result: 'line1',
            }],
        });
        const next = agentMessage({
            id: 'a1',
            segments: [{
                type: 'tool',
                toolUseId: 't1',
                name: 'Read',
                args: '{}',
                finished: true,
                result: 'line1\nline2',
            }],
        });
        expect(computeAgentMessageWireDelta(prev, next, 'qaiq')).to.deep.equal({
            kind: 'patch_tool',
            messageId: 'a1',
            toolUseId: 't1',
            resultAppend: '\nline2',
            finished: true,
        });
    });
});

describe('applyAgentMessageWireDelta', () => {
    it('reconstructs the tail message from append_content', () => {
        const conv = {
            messages: [agentMessage({ id: 'a1', content: 'Hel' }) as QaapAgentMessageDTO],
        };
        const patched = applyAgentMessageWireDelta(conv, {
            kind: 'append_content',
            messageId: 'a1',
            text: 'lo',
        });
        expect(patched?.content).to.equal('Hello');
    });
});
