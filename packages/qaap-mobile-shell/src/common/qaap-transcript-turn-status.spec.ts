// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import {
    isAgentMessageVisuallySettled,
    isConversationTurnVisuallySettled,
    resolveTranscriptEffectiveStatus,
} from './qaap-transcript-turn-status';

const conv = (partial: Partial<QaapAgentConversationDTO> = {}): QaapAgentConversationDTO => ({
    id: 'c1',
    cwd: '/repo',
    agentId: 'qaiq',
    title: 'Test',
    status: 'streaming',
    createdAt: 1,
    updatedAt: 10,
    messages: [],
    ...partial,
});

describe('qaap-transcript-turn-status', () => {
    it('isConversationTurnVisuallySettled is false while a tool is still running', () => {
        const streaming = conv({
            messages: [
                { id: 'u1', role: 'user', content: 'run dev', createdAt: 5 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 8,
                    segments: [{
                        type: 'tool',
                        toolUseId: 't1',
                        name: 'Bash',
                        args: '{"command":"pnpm dev"}',
                        finished: false,
                    }],
                },
            ],
        });
        expect(isConversationTurnVisuallySettled(streaming)).to.equal(false);
        expect(resolveTranscriptEffectiveStatus(streaming)).to.equal('streaming');
    });

    it('isConversationTurnVisuallySettled is true when tools finished and files were edited', () => {
        const streaming = conv({
            messages: [
                { id: 'u1', role: 'user', content: 'levanta la app', createdAt: 5 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 20,
                    segments: [
                        {
                            type: 'tool',
                            toolUseId: 't1',
                            name: 'Edit',
                            args: '{"path":"vite.config.ts"}',
                            finished: true,
                        },
                        {
                            type: 'tool',
                            toolUseId: 't2',
                            name: 'Bash',
                            args: '{"command":"pnpm dev"}',
                            finished: true,
                            result: 'ready in 300ms',
                        },
                    ],
                },
            ],
        });
        expect(isConversationTurnVisuallySettled(streaming)).to.equal(true);
        expect(resolveTranscriptEffectiveStatus(streaming)).to.equal('idle');
    });

    it('isAgentMessageVisuallySettled accepts plain stdout agents', () => {
        expect(isAgentMessageVisuallySettled({
            id: 'a1',
            role: 'agent',
            content: 'Done.',
            createdAt: 3,
        })).to.equal(true);
    });

    it('isConversationTurnVisuallySettled stays streaming for thinking-only segments', () => {
        const streaming = conv({
            messages: [
                { id: 'u1', role: 'user', content: 'run dev', createdAt: 5 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 8,
                    segments: [{
                        type: 'thinking',
                        content: 'Let me explore the project structure first.',
                    }],
                },
            ],
        });
        expect(isConversationTurnVisuallySettled(streaming)).to.equal(false);
        expect(resolveTranscriptEffectiveStatus(streaming)).to.equal('streaming');
    });

    it('isConversationTurnVisuallySettled mirrors backend idle', () => {
        const idle = conv({ status: 'idle', messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 1 }] });
        expect(isConversationTurnVisuallySettled(idle)).to.equal(true);
    });
});
