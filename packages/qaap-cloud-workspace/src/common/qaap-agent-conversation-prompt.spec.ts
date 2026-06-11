// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentMessage } from './qaap-agent-conversation';
import {
    buildConversationAgentPrompt,
    partitionConversationHistory,
    shouldCompressConversationPrompt,
    VPS_PROMPT_COMPRESSED_MESSAGE_MAX_CHARS,
} from './qaap-agent-conversation-prompt';

function message(partial: Partial<QaapAgentMessage> & Pick<QaapAgentMessage, 'role' | 'content'>): QaapAgentMessage {
    return {
        id: partial.id ?? `${partial.role}-${Math.random()}`,
        createdAt: partial.createdAt ?? 1,
        ...partial,
    };
}

describe('partitionConversationHistory', () => {
    it('keeps the last two user turns verbatim', () => {
        const history = [
            message({ role: 'user', content: 'u1' }),
            message({ role: 'agent', content: 'a1' }),
            message({ role: 'user', content: 'u2' }),
            message({ role: 'agent', content: 'a2' }),
            message({ role: 'user', content: 'u3' }),
            message({ role: 'agent', content: 'a3' }),
        ];
        const { compressed, recent } = partitionConversationHistory(history, 2);
        expect(compressed.map(m => m.content)).to.deep.equal(['u1', 'a1']);
        expect(recent.map(m => m.content)).to.deep.equal(['u2', 'a2', 'u3', 'a3']);
    });
});

describe('buildConversationAgentPrompt', () => {
    it('uses the full transcript when under the compression threshold', () => {
        const prompt = buildConversationAgentPrompt({
            history: [
                message({ role: 'user', content: 'Hello' }),
                message({ role: 'agent', content: 'Hi there' }),
            ],
            latestUserContent: 'Next question',
            contextWindowSize: 128_000,
        });
        expect(prompt).to.include('The transcript so far:');
        expect(prompt).to.include('USER: Hello');
        expect(prompt).to.include('ASSISTANT: Hi there');
        expect(prompt).to.include('USER: Next question');
        expect(prompt).not.to.include('Earlier context (compressed)');
    });

    it('compresses older turns when the estimated prompt exceeds the threshold', () => {
        const longBody = 'x'.repeat(VPS_PROMPT_COMPRESSED_MESSAGE_MAX_CHARS + 200);
        const history: QaapAgentMessage[] = [];
        for (let turn = 0; turn < 8; turn++) {
            history.push(message({ role: 'user', content: `${longBody} user-${turn}` }));
            history.push(message({ role: 'agent', content: `${longBody} agent-${turn}` }));
        }
        expect(shouldCompressConversationPrompt(
            history.concat(message({ role: 'user', content: 'latest' })),
            undefined,
            4_000,
        )).to.equal(true);

        const prompt = buildConversationAgentPrompt({
            history,
            latestUserContent: 'latest',
            contextWindowSize: 4_000,
        });
        expect(prompt).to.include('Earlier context (compressed):');
        expect(prompt).to.include('Recent transcript:');
        expect(prompt).to.include('USER: latest');
        expect(prompt).not.to.include(`${longBody} user-0`);
    });
});
