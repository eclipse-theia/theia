// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentConversationDTO } from './qaap-agent-conversation-client';
import {
    buildConversationTranscriptFingerprint,
    isStreamingTranscriptTailUnchanged,
    resolveStreamingTranscriptPatchKind,
    shouldForceTranscriptRenderOnStatusSettle,
    transcriptFingerprintChanged,
} from './qaap-transcript-incremental-update';

function conv(partial: Partial<QaapAgentConversationDTO> & Pick<QaapAgentConversationDTO, 'messages'>): QaapAgentConversationDTO {
    return {
        id: 'c1',
        cwd: '/repo',
        agentId: 'qaiq',
        title: 't',
        status: 'streaming',
        createdAt: 1,
        updatedAt: 1,
        ...partial,
    };
}

describe('qaap-transcript-incremental-update', () => {

    it('buildConversationTranscriptFingerprint tolerates missing segment text fields', () => {
        const snapshot = conv({
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [
                    { type: 'text', content: undefined as unknown as string },
                    { type: 'tool', toolUseId: 't1', name: 'Read', args: undefined as unknown as string, finished: false },
                ],
            }],
        });
        expect(() => buildConversationTranscriptFingerprint(snapshot)).to.not.throw();
    });

    it('buildConversationTranscriptFingerprint includes every segment, not only the last', () => {
        const base = conv({
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [
                    { type: 'tool', toolUseId: 't1', name: 'Read', args: '{}', finished: true, result: 'ok' },
                    { type: 'tool', toolUseId: 't2', name: 'Bash', args: '{}', finished: false },
                ],
            }],
        });
        const updated = conv({
            updatedAt: 2,
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [
                    { type: 'tool', toolUseId: 't1', name: 'Read', args: '{}', finished: true, result: 'ok-longer' },
                    { type: 'tool', toolUseId: 't2', name: 'Bash', args: '{}', finished: false },
                ],
            }],
        });
        expect(buildConversationTranscriptFingerprint(base)).to.not.equal(
            buildConversationTranscriptFingerprint(updated),
        );
    });

    it('resolveStreamingTranscriptPatchKind returns last-agent when segments grow in place', () => {
        const prev = conv({
            messages: [
                { id: 'u1', role: 'user', content: 'hi', createdAt: 1 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 2,
                    segments: [{ type: 'text', content: 'Hel' }],
                },
            ],
        });
        const next = conv({
            updatedAt: 3,
            messages: [
                { id: 'u1', role: 'user', content: 'hi', createdAt: 1 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 2,
                    segments: [{ type: 'text', content: 'Hello' }],
                },
            ],
        });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('last-agent');
    });

    it('resolveStreamingTranscriptPatchKind returns append-agent when the agent row first appears', () => {
        const prev = conv({
            messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 1 }],
        });
        const next = conv({
            messages: [
                { id: 'u1', role: 'user', content: 'hi', createdAt: 1 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: '',
                    createdAt: 2,
                    segments: [{ type: 'thinking', content: 'plan' }],
                },
            ],
        });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('append-agent');
    });

    it('resolveStreamingTranscriptPatchKind returns activity-only while waiting for the agent', () => {
        const prev = conv({
            messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 1 }],
        });
        const next = conv({
            updatedAt: 2,
            messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 1 }],
        });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('activity-only');
    });

    it('resolveStreamingTranscriptPatchKind returns none when idle', () => {
        const prev = conv({ status: 'streaming', messages: [] });
        const next = conv({ status: 'idle', messages: [] });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('none');
    });

    it('resolveStreamingTranscriptPatchKind returns append-agent for codex stdout agents with segments', () => {
        const prev = conv({
            id: 'c1',
            agentId: 'codex',
            messages: [{ id: 'u1', role: 'user', content: 'hi', createdAt: 1 }],
        });
        const next = conv({
            id: 'c1',
            agentId: 'codex',
            messages: [
                { id: 'u1', role: 'user', content: 'hi', createdAt: 1 },
                {
                    id: 'a1',
                    role: 'agent',
                    content: 'Done.',
                    createdAt: 2,
                    segments: [{ type: 'text', content: 'Done.' }],
                },
            ],
        });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('append-agent');
    });

    it('shouldForceTranscriptRenderOnStatusSettle forces render when a turn settles', () => {
        const prev = conv({
            status: 'streaming',
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [{ type: 'text', content: 'done' }],
            }],
        });
        const next = conv({ status: 'idle', messages: prev.messages });
        expect(shouldForceTranscriptRenderOnStatusSettle(prev, next, true)).to.equal(true);
        expect(shouldForceTranscriptRenderOnStatusSettle(prev, next, false)).to.equal(false);
        expect(shouldForceTranscriptRenderOnStatusSettle(prev, conv({ status: 'streaming', messages: prev.messages }), true))
            .to.equal(false);
    });

    it('transcriptFingerprintChanged detects segment updates with the same updatedAt', () => {
        const prev = conv({
            id: 'c1',
            updatedAt: 5,
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [{ type: 'text', content: 'a' }],
            }],
        });
        const next = conv({
            id: 'c1',
            updatedAt: 5,
            messages: [{
                id: 'a1',
                role: 'agent',
                content: '',
                createdAt: 1,
                segments: [{ type: 'text', content: 'ab' }],
            }],
        });
        expect(transcriptFingerprintChanged(prev, next)).to.equal(true);
    });

    it('resolveStreamingTranscriptPatchKind returns none when structured segments are unchanged', () => {
        const messages = [
            { id: 'u1', role: 'user' as const, content: 'hi', createdAt: 1 },
            {
                id: 'a1',
                role: 'agent' as const,
                content: 'Hello',
                createdAt: 2,
                segments: [{ type: 'text' as const, content: 'Hello' }],
            },
        ];
        const prev = conv({ updatedAt: 2, messages });
        const next = conv({ updatedAt: 3, messages });
        expect(resolveStreamingTranscriptPatchKind(prev, next)).to.equal('none');
    });

    it('isStreamingTranscriptTailUnchanged ignores metadata-only SSE ticks', () => {
        const messages = [
            { id: 'u1', role: 'user' as const, content: 'hi', createdAt: 1 },
            {
                id: 'a1',
                role: 'agent' as const,
                content: 'Hello',
                createdAt: 2,
                segments: [{ type: 'text' as const, content: 'Hello' }],
            },
        ];
        const prev = conv({ updatedAt: 2, messages });
        const next = conv({ updatedAt: 99, messages });
        expect(isStreamingTranscriptTailUnchanged(prev, next)).to.equal(true);
    });
});
