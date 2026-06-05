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
import { LanguageModelMessage } from '@theia/ai-core';
import { HuggingFaceModel } from './huggingface-language-model';

/**
 * Tests cover the message-conversion path that runs before the request leaves Theia.
 * We exercise it by passing crafted messages to a stub HF client through the model.
 */
class TestableHuggingFaceModel extends HuggingFaceModel {
    public capturedMessages: Array<{ role: string; content: string }> | undefined;

    constructor() {
        super('test-id', 'test-model', { status: 'ready' }, () => 'test-key');
    }

    // Capture the converted messages by overriding the private fetch step.
    // We re-implement the same conversion path used in handleNonStreamingRequest, since
    // toChatMessages and the merge step are module-private.
    public async runConvert(messages: LanguageModelMessage[]): Promise<Array<{ role: string; content: string }>> {
        // Use a stub client so the request never goes out. We capture the messages it receives.
        const stubClient = {
            chatCompletion: async (params: { messages: Array<{ role: string; content: string }> }) => {
                this.capturedMessages = params.messages;
                return { choices: [{ message: { content: '' } }] };
            },
            chatCompletionStream: undefined as unknown
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this as any).handleNonStreamingRequest(stubClient, { messages });
        return this.capturedMessages!;
    }
}

describe('HuggingFaceModel - message merging', () => {
    const model = new TestableHuggingFaceModel();

    it('should merge consecutive assistant text messages with a newline separator', async () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'q' },
            { actor: 'ai', type: 'text', text: 'part one' },
            { actor: 'ai', type: 'text', text: 'part two' }
        ];
        const result = await model.runConvert(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'q' },
            { role: 'assistant', content: 'part one\npart two' }
        ]);
    });

    it('should leave alternating user/assistant messages unchanged', async () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'q1' },
            { actor: 'ai', type: 'text', text: 'a1' },
            { actor: 'user', type: 'text', text: 'q2' },
            { actor: 'ai', type: 'text', text: 'a2' }
        ];
        const result = await model.runConvert(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
            { role: 'user', content: 'q2' },
            { role: 'assistant', content: 'a2' }
        ]);
    });

    it('should reproduce the bug scenario from issue #17104 (consecutive ai messages)', async () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'first request' },
            { actor: 'ai', type: 'text', text: 'reasoning' },
            { actor: 'ai', type: 'text', text: 'final answer' }
        ];
        const result = await model.runConvert(messages);
        // Sanity check: no two consecutive assistant messages remain.
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].role === 'assistant' && result[i].role === 'assistant').to.equal(false);
        }
        expect(result).to.have.lengthOf(2);
        expect(result[1]).to.deep.equal({ role: 'assistant', content: 'reasoning\nfinal answer' });
    });
});
