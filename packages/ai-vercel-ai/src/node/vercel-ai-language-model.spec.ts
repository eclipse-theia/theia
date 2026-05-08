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
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { LanguageModelMessage } from '@theia/ai-core';
import { CoreMessage } from 'ai';
import { VercelAiModel } from './vercel-ai-language-model';
import { VercelAiLanguageModelFactory } from './vercel-ai-language-model-factory';

class TestableVercelAiModel extends VercelAiModel {
    constructor() {
        super(
            'test-id',
            'test-model',
            { status: 'ready' },
            true,
            false,
            undefined,
            new MockLogger(),
            new VercelAiLanguageModelFactory(),
            () => ({ provider: 'openai', apiKey: 'k' })
        );
    }

    public callProcessMessages(messages: LanguageModelMessage[]): Array<CoreMessage> {
        return this.processMessages(messages);
    }
}

describe('VercelAiModel - processMessages', () => {
    const model = new TestableVercelAiModel();

    it('should merge consecutive assistant text messages with a newline separator', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'q' },
            { actor: 'ai', type: 'text', text: 'part one' },
            { actor: 'ai', type: 'text', text: 'part two' }
        ];
        const result = model.callProcessMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'q' },
            { role: 'assistant', content: 'part one\npart two' }
        ]);
    });

    it('should leave alternating user/assistant messages unchanged', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'q1' },
            { actor: 'ai', type: 'text', text: 'a1' },
            { actor: 'user', type: 'text', text: 'q2' },
            { actor: 'ai', type: 'text', text: 'a2' }
        ];
        const result = model.callProcessMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: 'a1' },
            { role: 'user', content: 'q2' },
            { role: 'assistant', content: 'a2' }
        ]);
    });

    it('should reproduce the bug scenario from issue #17104 (consecutive ai messages)', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'first request' },
            { actor: 'ai', type: 'text', text: 'reasoning' },
            { actor: 'ai', type: 'text', text: 'final answer' }
        ];
        const result = model.callProcessMessages(messages);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].role === 'assistant' && result[i].role === 'assistant').to.equal(false);
        }
        expect(result).to.have.lengthOf(2);
        expect(result[1]).to.deep.equal({ role: 'assistant', content: 'reasoning\nfinal answer' });
    });
});
