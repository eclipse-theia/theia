// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import type { ModelInfo } from './copilot-sdk-types';
import { selectSdkModelIds, buildSdkPrompt, buildSdkSystemMessage } from './copilot-sdk-mappers';

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

    it('drops a dated release when its family is offered as well', () => {
        const result = selectSdkModelIds([
            model('gpt-5'),
            model('gpt-5-2026-04-17'),
            model('claude-sonnet-5'),
            model('claude-sonnet-5-20260514')
        ]);
        expect(result).to.deep.equal(['gpt-5', 'claude-sonnet-5']);
    });

    it('keeps a dated release that is the only way to select that model', () => {
        const result = selectSdkModelIds([model('gpt-5'), model('o5-preview-2026-03-01')]);
        expect(result).to.deep.equal(['gpt-5', 'o5-preview-2026-03-01']);
    });

    it('keeps a dated release whose family is disabled by policy', () => {
        const result = selectSdkModelIds([model('gpt-5', 'disabled'), model('gpt-5-2026-04-17')]);
        expect(result).to.deep.equal(['gpt-5-2026-04-17']);
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

describe('copilot-sdk-mappers - buildSdkSystemMessage', () => {
    it('carries the system text as the content of the system message', () => {
        const systemMessage = buildSdkSystemMessage('be helpful');
        expect(systemMessage?.mode).to.equal('customize');
        expect(systemMessage?.content).to.equal('be helpful');
    });

    it('removes the agent instructions of the CLI that the Theia prompt replaces', () => {
        const systemMessage = buildSdkSystemMessage('be helpful');
        const sections = systemMessage?.mode === 'customize' ? systemMessage.sections : undefined;
        expect(Object.keys(sections ?? {})).to.have.members(['identity', 'tone', 'guidelines', 'code_change_rules']);
        for (const section of Object.values(sections ?? {})) {
            expect(section?.action).to.equal('remove');
        }
    });

    it('keeps the tool instructions of the CLI, which tool calling relies on', () => {
        const systemMessage = buildSdkSystemMessage('be helpful');
        const sections = systemMessage?.mode === 'customize' ? systemMessage.sections : undefined;
        expect(sections).to.not.have.property('tool_instructions');
        expect(sections).to.not.have.property('safety');
    });

    it('configures nothing when the request has no system text', () => {
        expect(buildSdkSystemMessage('')).to.be.undefined;
    });
});
