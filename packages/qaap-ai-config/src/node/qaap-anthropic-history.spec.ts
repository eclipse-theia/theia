// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { Anthropic } from '@anthropic-ai/sdk';
import { addCacheControlToLastMessage, pruneOldHistoryTurns } from './qaap-anthropic-history';

describe('qaap-anthropic-history', () => {

    describe('pruneOldHistoryTurns', () => {
        const userText = (text: string): Anthropic.Messages.MessageParam => ({ role: 'user', content: [{ type: 'text', text }] });
        const assistantText = (text: string): Anthropic.Messages.MessageParam => ({ role: 'assistant', content: [{ type: 'text', text }] });
        const toolResult = (id: string, text: string): Anthropic.Messages.MessageParam => ({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: id, content: text }]
        });

        it('returns messages unchanged when under the turn limit', () => {
            const messages = [userText('a'), assistantText('A'), userText('b'), assistantText('B')];
            expect(pruneOldHistoryTurns(messages, 5)).to.equal(messages);
        });

        it('keeps only the last N human turns when over the limit', () => {
            const messages = [
                userText('t1'), assistantText('r1'),
                userText('t2'), assistantText('r2'),
                userText('t3'), assistantText('r3'),
                userText('t4'), assistantText('r4')
            ];
            const result = pruneOldHistoryTurns(messages, 2);
            expect(result).to.have.lengthOf(4);
            expect((result[0].content as { text: string }[])[0].text).to.equal('t3');
            expect((result[3].content as { text: string }[])[0].text).to.equal('r4');
        });

        it('does not split a tool_use/tool_result round-trip', () => {
            const messages = [
                userText('t1'),
                assistantText('a1 with tool_use'),
                toolResult('tool_1', 'result_1'),
                assistantText('a1 final'),
                userText('t2'),
                assistantText('a2')
            ];
            const result = pruneOldHistoryTurns(messages, 1);
            expect(result).to.have.lengthOf(2);
            expect((result[0].content as { text: string }[])[0].text).to.equal('t2');
            expect((result[1].content as { text: string }[])[0].text).to.equal('a2');
        });

        it('handles string content as a human turn', () => {
            const messages: Anthropic.Messages.MessageParam[] = [
                { role: 'user', content: 't1' },
                assistantText('r1'),
                { role: 'user', content: 't2' },
                assistantText('r2')
            ];
            const result = pruneOldHistoryTurns(messages, 1);
            expect(result).to.have.lengthOf(2);
            expect(result[0].content).to.equal('t2');
        });

        it('returns messages unchanged for empty arrays or non-positive limits', () => {
            expect(pruneOldHistoryTurns([], 10)).to.deep.equal([]);
            const messages = [userText('a')];
            expect(pruneOldHistoryTurns(messages, 0)).to.equal(messages);
        });
    });

    describe('addCacheControlToLastMessage', () => {

        it('should add a rolling read breakpoint to the previous user message in multi-turn history', () => {
            const messages: Anthropic.Messages.MessageParam[] = [
                { role: 'user', content: [{ type: 'text', text: 'turn 1' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'reply 1' }] },
                { role: 'user', content: [{ type: 'text', text: 'turn 2' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'reply 2' }] },
                { role: 'user', content: [{ type: 'text', text: 'turn 3' }] }
            ];

            const result = addCacheControlToLastMessage(messages);

            expect(result).to.have.lengthOf(5);
            expect(result[4].content).to.deep.equal([{
                type: 'text', text: 'turn 3', cache_control: { type: 'ephemeral' }
            }]);
            expect(result[2].content).to.deep.equal([{
                type: 'text', text: 'turn 2', cache_control: { type: 'ephemeral' }
            }]);
            expect(result[0].content).to.deep.equal([{ type: 'text', text: 'turn 1' }]);
            expect(result[1].content).to.deep.equal([{ type: 'text', text: 'reply 1' }]);
            expect(result[3].content).to.deep.equal([{ type: 'text', text: 'reply 2' }]);
        });

        it('should add only the write breakpoint when there is no prior user message', () => {
            const messages: Anthropic.Messages.MessageParam[] = [
                { role: 'assistant', content: [{ type: 'text', text: 'assistant only' }] },
                { role: 'user', content: [{ type: 'text', text: 'first user' }] }
            ];

            const result = addCacheControlToLastMessage(messages);

            expect(result[1].content).to.deep.equal([{
                type: 'text', text: 'first user', cache_control: { type: 'ephemeral' }
            }]);
            expect(result[0].content).to.deep.equal([{ type: 'text', text: 'assistant only' }]);
        });
    });
});
