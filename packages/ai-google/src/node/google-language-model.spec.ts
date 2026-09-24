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
import { LanguageModelRequest, LanguageModelTextResponse, ReasoningApi, ReasoningSupport } from '@theia/ai-core';
import type { GoogleGenAI } from '@google/genai';
import { GoogleModel } from './google-language-model';

const GEMINI_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

class TestableGoogleModel extends GoogleModel {
    public callGetSettings(request: LanguageModelRequest): Readonly<Record<string, unknown>> {
        return this.getSettings(request);
    }
}

function createModel(modelId: string, reasoningApi?: ReasoningApi): TestableGoogleModel {
    return new TestableGoogleModel(
        'test-id', modelId, { status: 'ready' }, true,
        () => 'test-key',
        () => ({ maxRetriesOnErrors: 0, retryDelayOnRateLimitError: -1, retryDelayOnOtherErrors: -1 }),
        reasoningApi ? GEMINI_REASONING_SUPPORT : undefined,
        reasoningApi
    );
}

describe('GoogleModel reasoning translation', () => {

    describe('effort API (Gemini 3 thinkingLevel)', () => {
        it('maps level=medium to thinkingConfig.thinkingLevel=medium', () => {
            const model = createModel('gemini-3-pro', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } });
            expect(result.thinkingConfig).to.deep.include({ thinkingLevel: 'medium', includeThoughts: true });
        });
        it('omits thinkingConfig entirely when level=off', () => {
            const model = createModel('gemini-3-pro', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } });
            expect(result.thinkingConfig).to.equal(undefined);
        });
        it('omits thinkingConfig for level=auto (provider default applies)', () => {
            const model = createModel('gemini-3-pro', 'effort');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } });
            expect(result.thinkingConfig).to.equal(undefined);
        });
    });

    describe('budget API (Gemini 2.5 thinkingBudget)', () => {
        it('omits thinkingConfig entirely when level=off', () => {
            const model = createModel('gemini-2.5-pro', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } });
            expect(result.thinkingConfig).to.equal(undefined);
        });
        it('maps level=auto to thinkingBudget=-1 (dynamic)', () => {
            const model = createModel('gemini-2.5-pro', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } });
            expect(result.thinkingConfig).to.deep.include({ thinkingBudget: -1, includeThoughts: true });
        });
        it('maps level=medium to a moderate positive budget', () => {
            const model = createModel('gemini-2.5-pro', 'budget');
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } });
            const config = result.thinkingConfig as { thinkingBudget: number };
            expect(config.thinkingBudget).to.be.greaterThan(0);
        });
    });

    describe('non-reasoning models', () => {
        it('ignores reasoning settings on gemini-1.5-flash', () => {
            const model = createModel('gemini-1.5-flash', undefined);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } });
            expect(result.thinkingConfig).to.equal(undefined);
        });
    });

    describe('vendor', () => {
        it('exposes the google vendor (used to key server tool selections and the capabilities UI)', () => {
            expect(createModel('gemini-3-pro').vendor).to.equal('google');
        });
    });
});

describe('GoogleModel non-streaming requests', () => {
    /** Model whose generateContent() resolves to the given response instead of calling the API. */
    class NonStreamingGoogleModel extends GoogleModel {
        constructor(protected readonly generateContentResponse: object) {
            super(
                'test-id', 'gemini-3-pro', { status: 'ready' }, false,
                () => 'test-key',
                () => ({ maxRetriesOnErrors: 0, retryDelayOnRateLimitError: -1, retryDelayOnOtherErrors: -1 }),
                GEMINI_REASONING_SUPPORT, 'effort'
            );
        }
        protected override initializeGemini(): GoogleGenAI {
            return { models: { generateContent: async () => this.generateContentResponse } } as unknown as GoogleGenAI;
        }
    }

    it('excludes thought parts from the response text', async () => {
        const model = new NonStreamingGoogleModel({
            candidates: [{ content: { role: 'model', parts: [{ text: 'Weighing the options.', thought: true }, { text: 'Answer' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
        });
        const response = await model.request({
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            reasoning: { level: 'medium' },
            agentId: 'test', sessionId: 'session', requestId: 'req'
        });
        expect((response as LanguageModelTextResponse).text).to.equal('Answer');
    });
});
