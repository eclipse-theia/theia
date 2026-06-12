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
import type { ModelInfo } from '@github/copilot-sdk';
import { selectSdkModelIds, buildSdkPrompt, flattenSdkPrompt } from './copilot-sdk-mappers';

// Minimal ModelInfo factory: selectSdkModelIds only reads `id` and `policy.state`.
function model(id: string, state?: 'enabled' | 'disabled' | 'unconfigured'): ModelInfo {
    return { id, policy: state ? { state } : undefined } as unknown as ModelInfo;
}

describe('copilot-sdk-mappers - selectSdkModelIds', () => {
    it('keeps enabled and unconfigured models and drops disabled ones', () => {
        const result = selectSdkModelIds([
            model('gpt-4o', 'enabled'),
            model('o1', 'disabled'),
            model('claude', 'unconfigured'),
            model('gpt-5')
        ]);
        expect(result).to.deep.equal(['gpt-4o', 'claude', 'gpt-5']);
    });

    it('preserves order and removes duplicates', () => {
        const result = selectSdkModelIds([
            model('a', 'enabled'),
            model('b', 'enabled'),
            model('a', 'enabled')
        ]);
        expect(result).to.deep.equal(['a', 'b']);
    });

    it('returns an empty list when given no models', () => {
        expect(selectSdkModelIds([])).to.deep.equal([]);
    });
});

describe('copilot-sdk-mappers - buildSdkPrompt', () => {
    it('forwards a lone user turn verbatim with no system text', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'hello world' }
        ];
        const result = buildSdkPrompt(messages);
        expect(result.systemText).to.equal('');
        expect(result.prompt).to.equal('hello world');
    });

    it('extracts and concatenates system messages', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'system', type: 'text', text: 'You are helpful.' },
            { actor: 'system', type: 'text', text: 'Be concise.' },
            { actor: 'user', type: 'text', text: 'hi' }
        ];
        const result = buildSdkPrompt(messages);
        expect(result.systemText).to.equal('You are helpful.\n\nBe concise.');
        expect(result.prompt).to.equal('hi');
    });

    it('renders a multi-message history as a role-labelled transcript', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'first' },
            { actor: 'ai', type: 'text', text: 'reply' },
            { actor: 'user', type: 'text', text: 'second' }
        ];
        const result = buildSdkPrompt(messages);
        expect(result.prompt).to.equal('User: first\n\nAssistant: reply\n\nUser: second');
    });

    it('drops thinking messages from the conversation body', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'ai', type: 'thinking', thinking: 'internal', signature: 's' },
            { actor: 'user', type: 'text', text: 'only user' }
        ];
        const result = buildSdkPrompt(messages);
        expect(result.prompt).to.equal('only user');
    });

    it('summarises tool use and tool result messages in the transcript', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'run it' },
            { actor: 'ai', type: 'tool_use', id: 'call_1', name: 'foo', input: { x: 1 } },
            { actor: 'user', type: 'tool_result', tool_use_id: 'call_1', name: 'foo', content: 'done' }
        ];
        const result = buildSdkPrompt(messages);
        expect(result.prompt).to.equal(
            'User: run it\n\nAssistant: [tool call: foo {"x":1}]\n\nUser: [tool result: done]'
        );
    });
});

describe('copilot-sdk-mappers - flattenSdkPrompt', () => {
    it('prepends system text when present', () => {
        expect(flattenSdkPrompt({ systemText: 'sys', prompt: 'body' })).to.equal('sys\n\nbody');
    });

    it('returns the prompt unchanged when there is no system text', () => {
        expect(flattenSdkPrompt({ systemText: '', prompt: 'body' })).to.equal('body');
    });
});
