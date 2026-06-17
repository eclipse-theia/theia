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
import { LanguageModelRequest, ReasoningSupport } from '@theia/ai-core';
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
