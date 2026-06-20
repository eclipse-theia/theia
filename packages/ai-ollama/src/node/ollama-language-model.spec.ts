// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { Message } from 'ollama';
import { OllamaModel } from './ollama-language-model';

class TestableOllamaModel extends OllamaModel {
    constructor() {
        super('test-id', 'test-model', { status: 'ready' }, () => 'http://localhost:11434');
    }

    public callMergeConsecutiveAssistantMessages(messages: Message[]): Message[] {
        return this.mergeConsecutiveAssistantMessages(messages);
    }
}

describe('OllamaModel - mergeConsecutiveAssistantMessages', () => {
    const model = new TestableOllamaModel();

    it('should merge an assistant text message followed by an assistant tool_use into a single message', () => {
        const messages: Message[] = [
            { role: 'user', content: 'do something' },
            { role: 'assistant', content: 'let me call a tool' },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'foo', arguments: { x: 1 } } }] }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'do something' },
            {
                role: 'assistant',
                content: 'let me call a tool',
                tool_calls: [{ function: { name: 'foo', arguments: { x: 1 } } }]
            }
        ]);
    });

    it('should merge multiple parallel assistant tool_calls into a single message', () => {
        const messages: Message[] = [
            { role: 'user', content: 'do parallel work' },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'foo', arguments: { x: 1 } } }] },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'bar', arguments: { y: 2 } } }] }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'do parallel work' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [
                    { function: { name: 'foo', arguments: { x: 1 } } },
                    { function: { name: 'bar', arguments: { y: 2 } } }
                ]
            }
        ]);
    });

    it('should reproduce the bug scenario from issue #17104 (text+tool_use after a tool_result round-trip)', () => {
        const messages: Message[] = [
            { role: 'user', content: 'first request' },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'foo', arguments: {} } }] },
            { role: 'tool', content: 'Tool call foo returned: r1' },
            { role: 'assistant', content: 'follow-up reasoning' },
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'bar', arguments: {} } }] }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        // Sanity check: no two consecutive assistant messages remain.
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].role === 'assistant' && result[i].role === 'assistant').to.equal(false);
        }
        expect(result).to.have.lengthOf(4);
        expect(result[3]).to.deep.equal({
            role: 'assistant',
            content: 'follow-up reasoning',
            tool_calls: [{ function: { name: 'bar', arguments: {} } }]
        });
    });

    it('should not merge non-adjacent assistant messages separated by a tool result', () => {
        const messages: Message[] = [
            { role: 'assistant', content: '', tool_calls: [{ function: { name: 'foo', arguments: {} } }] },
            { role: 'tool', content: 'Tool call foo returned: r' },
            { role: 'assistant', content: 'final answer' }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        expect(result).to.deep.equal(messages);
    });

    it('should join thinking text from consecutive assistant messages', () => {
        const messages: Message[] = [
            { role: 'assistant', content: 'hello', thinking: 'reasoning step 1' },
            { role: 'assistant', content: 'world', thinking: 'reasoning step 2' }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        expect(result).to.deep.equal([
            { role: 'assistant', content: 'hello\nworld', thinking: 'reasoning step 1\nreasoning step 2' }
        ]);
    });

    it('should not merge non-assistant consecutive messages', () => {
        const messages: Message[] = [
            { role: 'user', content: 'q1' },
            { role: 'user', content: 'q2' },
            { role: 'tool', content: 'result_a' },
            { role: 'tool', content: 'result_b' }
        ];
        const result = model.callMergeConsecutiveAssistantMessages(messages);
        expect(result).to.deep.equal(messages);
    });
});
