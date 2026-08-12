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
import { LanguageModelMessage, LanguageModelResponse, ReasoningSupport, UserRequest } from '@theia/ai-core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-language-model';
import { OPENAI_WEB_SEARCH } from '@theia/ai-openai/lib/node/openai-server-tools';
import { OpenAI } from 'openai';
import { CHATGPT_RESPONSES_BASE_URL, ChatGptCredentials } from '../common';
import { CHATGPT_ORIGINATOR } from './chatgpt-oauth';
import { ChatGptModel } from './chatgpt-language-model';
import { ChatGptResponseApiUtils, DEFAULT_CHATGPT_INSTRUCTIONS } from './chatgpt-response-api-utils';

interface CapturedRequest {
    openai: OpenAI;
    settings: Record<string, unknown>;
    model: string;
    developerMessageSettings: string;
    modelId: string;
    isStreaming: boolean;
}

class CapturingResponseApiUtils extends ChatGptResponseApiUtils {
    captured: CapturedRequest | undefined;

    override async handleRequest(
        openai: OpenAI,
        request: UserRequest,
        settings: Record<string, unknown>,
        model: string,
        modelUtils: OpenAiModelUtils,
        developerMessageSettings: Parameters<ChatGptResponseApiUtils['handleRequest']>[5],
        runnerOptions: Parameters<ChatGptResponseApiUtils['handleRequest']>[6],
        modelId: string,
        isStreaming: boolean
    ): Promise<LanguageModelResponse> {
        this.captured = { openai, settings, model, developerMessageSettings, modelId, isStreaming };
        return { text: '' };
    }
}

const CREDENTIALS: ChatGptCredentials = { accessToken: 'access-token', accountId: 'account-id' };

const GPT5_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

function createModel(
    credentials: () => Promise<ChatGptCredentials | undefined> = async () => CREDENTIALS,
    reasoningSupport?: ReasoningSupport
): { model: ChatGptModel, utils: CapturingResponseApiUtils } {
    const utils = new CapturingResponseApiUtils();
    const model = new ChatGptModel(
        'chatgpt/gpt-5.5', 'gpt-5.5', { status: 'ready' }, credentials, utils, new OpenAiModelUtils(), 3, undefined, reasoningSupport
    );
    return { model, utils };
}

function createRequest(settings?: Record<string, unknown>, messages: LanguageModelMessage[] = []): UserRequest {
    return { messages, settings, sessionId: 'session', requestId: 'request' };
}

function defaultHeadersOf(openai: OpenAI): Record<string, string> {
    return (openai as unknown as { _options: { defaultHeaders: Record<string, string> } })._options.defaultHeaders;
}

describe('ChatGptModel', () => {

    it('rejects the request when the user is not signed in', async () => {
        const { model } = createModel(async () => undefined);
        let error: unknown;
        try {
            await model.request(createRequest());
        } catch (caught) {
            error = caught;
        }
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/not signed in with chatgpt/i);
    });

    it('always requests an unstored, streamed response through the Response API', async () => {
        const { model, utils } = createModel();
        await model.request(createRequest());

        expect(utils.captured!.settings.store).to.equal(false);
        expect(utils.captured!.settings.stream).to.equal(true);
        expect(utils.captured!.isStreaming).to.equal(true);
        expect(utils.captured!.model).to.equal('gpt-5.5');
        expect(utils.captured!.modelId).to.equal('chatgpt/gpt-5.5');
    });

    it('keeps the system messages available as instructions', async () => {
        const { model, utils } = createModel();
        await model.request(createRequest());
        expect(utils.captured!.developerMessageSettings).to.equal('developer');
    });

    it('does not let request settings opt out of the endpoint invariants', async () => {
        const { model, utils } = createModel();
        await model.request(createRequest({ store: true, stream: false, temperature: 0.5 }));

        expect(utils.captured!.settings.store).to.equal(false);
        expect(utils.captured!.settings.stream).to.equal(true);
        expect(utils.captured!.settings.temperature).to.equal(0.5);
    });

    it('translates the reasoning level for models that support reasoning', async () => {
        const { model, utils } = createModel(async () => CREDENTIALS, GPT5_REASONING_SUPPORT);
        await model.request({ ...createRequest(), reasoning: { level: 'high' } });
        expect(utils.captured!.settings.reasoning).to.deep.equal({ effort: 'high' });
    });

    it('omits reasoning for models without reasoning support', async () => {
        const { model, utils } = createModel();
        await model.request({ ...createRequest(), reasoning: { level: 'high' } });
        expect(utils.captured!.settings.reasoning).to.equal(undefined);
    });

    it('talks to the ChatGPT endpoint on behalf of the signed in account', async () => {
        const { model, utils } = createModel();
        await model.request(createRequest());

        const openai = utils.captured!.openai;
        expect(openai.baseURL).to.equal(CHATGPT_RESPONSES_BASE_URL);
        const headers = defaultHeadersOf(openai);
        expect(headers['chatgpt-account-id']).to.equal('account-id');
        expect(headers['OpenAI-Beta']).to.equal('responses=experimental');
        expect(headers.originator).to.equal(CHATGPT_ORIGINATOR);
        expect(headers.session_id).to.have.length.greaterThan(0);
    });

    it('offers the server-side web search of the endpoint', () => {
        const { model } = createModel();
        expect(model.serverTools.map(tool => tool.id)).to.include(OPENAI_WEB_SEARCH);
    });

    it('resolves the access token per request, so a refreshed token is picked up', async () => {
        const tokens = ['first-token', 'second-token'];
        const { model, utils } = createModel(async () => ({ accessToken: tokens.shift() ?? 'exhausted', accountId: 'account-id' }));
        await model.request(createRequest());

        const apiKey = (utils.captured!.openai as unknown as { _options: { apiKey: () => Promise<string> } })._options.apiKey;
        expect(await apiKey()).to.equal('second-token');
    });
});

describe('ChatGptResponseApiUtils', () => {

    const utils = new ChatGptResponseApiUtils();

    it('substitutes default instructions when the request carries no system message', () => {
        const result = utils.processMessages([{ actor: 'user', type: 'text', text: 'Hello' }], 'developer', 'gpt-5.5');
        expect(result.instructions).to.equal(DEFAULT_CHATGPT_INSTRUCTIONS);
    });

    it('substitutes default instructions when the system message is blank', () => {
        const result = utils.processMessages([{ actor: 'system', type: 'text', text: '   ' }], 'developer', 'gpt-5.5');
        expect(result.instructions).to.equal(DEFAULT_CHATGPT_INSTRUCTIONS);
    });

    it('turns the system messages into instructions and keeps them out of the input', () => {
        const result = utils.processMessages([
            { actor: 'system', type: 'text', text: 'Be terse.' },
            { actor: 'user', type: 'text', text: 'Hello' }
        ], 'developer', 'gpt-5.5');

        expect(result.instructions).to.equal('Be terse.');
        expect(result.input).to.have.lengthOf(1);
        expect(result.input.every(item => !('role' in item) || item.role !== 'system')).to.equal(true);
    });
});
