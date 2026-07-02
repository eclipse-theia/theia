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
import { LanguageModelMessage, LanguageModelRequest, ReasoningSupport } from '@theia/ai-core';
import { OpenAiModel, OpenAiModelUtils } from './openai-language-model';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';

const GPT5_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

const O_SERIES_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

class TestableOpenAiModel extends OpenAiModel {
    public callGetSettings(request: LanguageModelRequest, forResponseApi: boolean = false): Record<string, unknown> {
        return this.getSettings(request, forResponseApi);
    }
    public callApplyResponseApiCompaction(settings: Record<string, unknown>, request: LanguageModelRequest): Record<string, unknown> {
        return this.applyResponseApiCompaction(settings, request);
    }
}

function createModel(modelId: string, reasoningSupport?: ReasoningSupport): TestableOpenAiModel {
    return new TestableOpenAiModel(
        'test-id', modelId, { status: 'ready' }, true,
        () => 'test-key', () => undefined,
        false, undefined, undefined,
        new OpenAiModelUtils(), new OpenAiResponseApiUtils(),
        'developer', 3, false, undefined, reasoningSupport
    );
}

function createCompactionModel(serverSideCompactionEnabledByDefault: boolean, useResponseApi: boolean = true): TestableOpenAiModel {
    return new TestableOpenAiModel(
        'test-id', 'gpt-5', { status: 'ready' }, true,
        () => 'test-key', () => undefined,
        false, undefined, undefined,
        new OpenAiModelUtils(), new OpenAiResponseApiUtils(),
        'developer', 3, useResponseApi, undefined, undefined, undefined, serverSideCompactionEnabledByDefault
    );
}

describe('OpenAiModel reasoning translation', () => {

    describe('Responses API (GPT-5)', () => {
        it('maps level=minimal to reasoning.effort=minimal', () => {
            const model = createModel('gpt-5', GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'minimal' });
        });
        it('maps level=high to reasoning.effort=high', () => {
            const model = createModel('gpt-5', GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'high' });
        });
        it('omits reasoning entirely when level=off', () => {
            const model = createModel('gpt-5', GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } }, true);
            expect(result.reasoning).to.equal(undefined);
        });
        it('omits reasoning when level=auto (provider default applies)', () => {
            const model = createModel('gpt-5', GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } }, true);
            expect(result.reasoning).to.equal(undefined);
        });
    });

    describe('Chat Completions API (o-series)', () => {
        it('maps level=medium to reasoning_effort=medium', () => {
            const model = createModel('o3-mini', O_SERIES_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } }, false);
            expect(result.reasoning_effort).to.equal('medium');
        });
        it('buckets minimal to low (o-series does not accept minimal)', () => {
            const model = createModel('o3-mini', O_SERIES_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } }, false);
            expect(result.reasoning_effort).to.equal('low');
        });
        it('omits reasoning_effort for level=off', () => {
            const model = createModel('o3-mini', O_SERIES_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } }, false);
            expect(result.reasoning_effort).to.equal(undefined);
        });
        it('omits reasoning_effort for level=auto', () => {
            const model = createModel('o3-mini', O_SERIES_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } }, false);
            expect(result.reasoning_effort).to.equal(undefined);
        });
    });

    describe('non-reasoning models', () => {
        it('ignores reasoning settings when the model has no reasoningSupport', () => {
            const model = createModel('gpt-4o', undefined);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } }, true);
            expect(result.reasoning).to.equal(undefined);
            expect(result.reasoning_effort).to.equal(undefined);
        });
    });
});

describe('OpenAiModelUtils Chat Completions processMessages', () => {
    it('drops a CompactionMessage without throwing when useResponseApi is off', () => {
        const utils = new OpenAiModelUtils();
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'hello' },
            { actor: 'ai', type: 'compaction', provider: 'openai-responses', data: { id: 'c1', encrypted_content: 'enc' } },
            { actor: 'ai', type: 'text', text: 'world' }
        ];

        let result: ReturnType<OpenAiModelUtils['processMessages']> | undefined;
        expect(() => { result = utils.processMessages(messages, 'developer'); }).to.not.throw();

        // The compaction marker must not appear in the output
        const hasCompaction = result?.some(m => 'content' in m && typeof m.content === 'string' && m.content.includes('enc'));
        expect(hasCompaction).to.equal(false);

        // The surrounding real messages must still be present
        const texts = result?.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
        expect(texts).to.contain('hello');
        expect(texts).to.contain('world');
    });
});

describe('OpenAiModel server-side compaction (Response API)', () => {

    it('adds context_management when model default is on and request has no compaction setting', () => {
        const model = createCompactionModel(true);
        const result = model.callApplyResponseApiCompaction({ stream: true }, { messages: [] });
        expect(result.context_management).to.deep.equal([{ type: 'compaction' }]);
        expect(result.stream).to.equal(true);
    });

    it('leaves settings unchanged when model default is off and request has no compaction setting', () => {
        const model = createCompactionModel(false);
        const result = model.callApplyResponseApiCompaction({ stream: true }, { messages: [] });
        expect(result.context_management).to.equal(undefined);
        expect(result).to.deep.equal({ stream: true });
    });

    it('session enabled=true activates compaction over a false model default', () => {
        const model = createCompactionModel(false);
        const result = model.callApplyResponseApiCompaction({}, { messages: [], compaction: { enabled: true } });
        expect(result.context_management).to.deep.equal([{ type: 'compaction' }]);
    });

    it('session enabled=false deactivates compaction even when model default is true', () => {
        const model = createCompactionModel(true);
        const result = model.callApplyResponseApiCompaction({}, { messages: [], compaction: { enabled: false } });
        expect(result.context_management).to.equal(undefined);
    });

    it('does not add context_management when capability is false (useResponseApi=false), even with session enabled=true', () => {
        const model = createCompactionModel(true, false);
        const result = model.callApplyResponseApiCompaction({ stream: true }, { messages: [], compaction: { enabled: true } });
        expect(result.context_management).to.equal(undefined);
        expect(result).to.deep.equal({ stream: true });
    });
});
