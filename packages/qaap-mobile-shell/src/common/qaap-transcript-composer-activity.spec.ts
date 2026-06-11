// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';

/** Minimal stand-in for the segment scan used by MobileProjectsTranscriptMessagesUi. */
function resolveComposerConversationSegments(
    conv: QaapAgentConversationDTO | undefined,
    options?: { readonly allTurns?: boolean },
): NonNullable<QaapAgentConversationDTO['messages'][number]['segments']> {
    if (!conv?.messages.length) {
        return [];
    }
    const turnOnly = !options?.allTurns && conv.status === 'streaming';
    if (turnOnly) {
        const last = conv.messages[conv.messages.length - 1];
        if (last?.role !== 'agent') {
            return [];
        }
        return last.segments ?? [];
    }
    return conv.messages.flatMap(message => message.role === 'agent' ? (message.segments ?? []) : []);
}

describe('qaap-transcript-composer-activity', () => {

    it('uses only the in-flight agent turn while streaming', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c1',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 't',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [
                {
                    id: 'a0',
                    role: 'agent',
                    content: '',
                    createdAt: 1,
                    segments: [{ type: 'tool', toolUseId: 'old', name: 'Write', args: '{}', finished: true }],
                },
                { id: 'u1', role: 'user', content: 'again', createdAt: 2 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 3,
                    segments: [{ type: 'tool', toolUseId: 'new', name: 'Bash', args: '{}', finished: false }],
                },
            ],
        };
        const turnSegments = resolveComposerConversationSegments(conv);
        expect(turnSegments).to.have.length(1);
        expect(turnSegments[0]?.type === 'tool' && turnSegments[0].toolUseId).to.equal('new');
    });

    it('returns empty segments while streaming before the agent replies', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c1',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 't',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [
                {
                    id: 'a0',
                    role: 'agent',
                    content: '',
                    createdAt: 1,
                    segments: [{ type: 'text', content: 'done' }],
                },
                { id: 'u1', role: 'user', content: 'next', createdAt: 2 },
            ],
        };
        expect(resolveComposerConversationSegments(conv)).to.deep.equal([]);
    });

    it('scans all agent turns when idle or allTurns is requested', () => {
        const conv: QaapAgentConversationDTO = {
            id: 'c1',
            cwd: '/repo',
            agentId: 'qaiq',
            title: 't',
            status: 'streaming',
            createdAt: 1,
            updatedAt: 2,
            messages: [
                {
                    id: 'a0',
                    role: 'agent',
                    content: '',
                    createdAt: 1,
                    segments: [{ type: 'tool', toolUseId: 'old', name: 'Write', args: '{}', finished: true }],
                },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 3,
                    segments: [{ type: 'tool', toolUseId: 'new', name: 'Bash', args: '{}', finished: false }],
                },
            ],
        };
        expect(resolveComposerConversationSegments(conv, { allTurns: true })).to.have.length(2);
        expect(resolveComposerConversationSegments({ ...conv, status: 'idle' })).to.have.length(2);
    });
});
