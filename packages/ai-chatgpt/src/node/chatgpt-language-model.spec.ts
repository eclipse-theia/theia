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
import {
    isCompactionResponsePart, LanguageModelMessage, LanguageModelResponse, LanguageModelStreamResponsePart, ReasoningSupport,
    ToolCallExecutor, ToolCallExecutorImpl, UserRequest
} from '@theia/ai-core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-model-utils';
import { OPENAI_WEB_SEARCH } from '@theia/ai-openai/lib/node/openai-server-tools';
import { OpenAI } from 'openai';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
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

    it('advertises and enables automatic compaction without an explicit threshold by default', async () => {
        const { model, utils } = createModel();
        expect(model.serverSideCompactionSupport).to.equal(true);
        await model.request(createRequest());
        expect(utils.captured!.settings.context_management).to.deep.equal([{ type: 'compaction' }]);
    });

    for (const defaultEnabled of [true, false]) {
        for (const enabled of [undefined, true, false]) {
            it(`resolves session compaction ${enabled} against model default ${defaultEnabled}`, async () => {
                const { model, utils } = createModel();
                model.serverSideCompactionEnabledByDefault = defaultEnabled;
                await model.request({ ...createRequest(), compaction: { enabled } });
                expect(utils.captured!.settings.context_management).to.deep.equal(
                    (enabled ?? defaultEnabled) ? [{ type: 'compaction' }] : undefined
                );
            });
        }
    }

    it('uses the model threshold unless the session overrides it', async () => {
        const { model, utils } = createModel();
        model.serverSideCompactionTokenThresholdByDefault = 100_000;
        await model.request(createRequest());
        expect(utils.captured!.settings.context_management).to.deep.equal([{ type: 'compaction', compact_threshold: 100_000 }]);
        await model.request({ ...createRequest(), compaction: { tokenThreshold: 150_000 } });
        expect(utils.captured!.settings.context_management).to.deep.equal([{ type: 'compaction', compact_threshold: 150_000 }]);
        await model.request({ ...createRequest(), compaction: { enabled: false, tokenThreshold: 150_000 } });
        expect(utils.captured!.settings.context_management).to.equal(undefined);
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
        expect(utils.captured!.settings.reasoning).to.deep.equal({ effort: 'high', summary: 'auto' });
    });

    it('preserves custom reasoning fields while the selected level determines effort', async () => {
        const { model, utils } = createModel(async () => CREDENTIALS, GPT5_REASONING_SUPPORT);
        await model.request({
            ...createRequest({ reasoning: { effort: 'low', summary: 'detailed' }, store: true, stream: false }),
            reasoning: { level: 'high' }
        });
        expect(utils.captured!.settings.reasoning).to.deep.equal({ effort: 'high', summary: 'detailed' });
        expect(utils.captured!.settings.context_management).to.deep.equal([{ type: 'compaction' }]);
        expect(utils.captured!.settings).to.include({ store: false, stream: true });
    });

    it('preserves custom reasoning effort when the selected level is auto', async () => {
        const { model, utils } = createModel(async () => CREDENTIALS, GPT5_REASONING_SUPPORT);
        await model.request({ ...createRequest({ reasoning: { effort: 'low', summary: 'detailed' } }), reasoning: { level: 'auto' } });
        expect(utils.captured!.settings.reasoning).to.deep.equal({ effort: 'low', summary: 'detailed' });
    });

    it('preserves raw compaction settings when automatic compaction is disabled', async () => {
        const { model, utils } = createModel();
        const contextManagement = [{ type: 'compaction', compact_threshold: 120_000 }];
        await model.request({ ...createRequest({ context_management: contextManagement }), compaction: { enabled: false } });
        expect(utils.captured!.settings.context_management).to.equal(contextManagement);
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

    for (const withTools of [false, true]) {
        it(`streams and replays encrypted compaction through the ChatGPT model ${withTools ? 'with client tools' : 'without tools'}`, async () => {
            const container = new Container();
            container.bind(ILogger).to(MockLogger);
            container.bind(ToolCallExecutor).to(ToolCallExecutorImpl).inSingletonScope();
            container.bind(ChatGptResponseApiUtils).toSelf();
            const responseUtils = container.get(ChatGptResponseApiUtils);
            const payloads: Record<string, unknown>[] = [];
            const openai = {
                responses: {
                    stream: (payload: Record<string, unknown>) => {
                        payloads.push(payload);
                        return (async function* (): AsyncIterable<unknown> {
                            yield { type: 'response.output_item.done', item: { type: 'compaction', id: 'c1', encrypted_content: 'encrypted' } };
                            yield { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } };
                        })();
                    }
                }
            } as unknown as OpenAI;
            class StreamingModel extends ChatGptModel {
                protected override async initializeOpenAi(): Promise<OpenAI> { return openai; }
            }
            const model = new StreamingModel('chatgpt/gpt-5.5', 'gpt-5.5', { status: 'ready' }, async () => CREDENTIALS,
                responseUtils, new OpenAiModelUtils());
            const request = {
                ...createRequest(undefined, [{ actor: 'user', type: 'text', text: 'Old turn' }]),
                tools: withTools ? [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }] : undefined
            } satisfies UserRequest;
            const response = await model.request(request);
            const parts: LanguageModelStreamResponsePart[] = [];
            expect('stream' in response).to.equal(true);
            if ('stream' in response) {
                for await (const part of response.stream) { parts.push(part); }
            }
            const compaction = parts.filter(isCompactionResponsePart);
            expect(compaction).to.deep.equal([{ compaction: { provider: 'openai-responses', data: { id: 'c1', encrypted_content: 'encrypted' } } }]);
            const replay = await model.request({
                ...request,
                messages: [
                    ...request.messages,
                    { actor: 'ai', type: 'compaction', ...compaction[0].compaction },
                    { actor: 'user', type: 'text', text: 'Next turn' }
                ]
            });
            if ('stream' in replay) {
                for await (const part of replay.stream) { parts.push(part); }
            }
            expect(payloads).to.have.lengthOf(2);
            expect(payloads[1]).to.include({ store: false, stream: true, instructions: DEFAULT_CHATGPT_INSTRUCTIONS });
            expect(payloads[1].context_management).to.deep.equal([{ type: 'compaction' }]);
            expect(payloads[1].input).to.deep.equal([
                { type: 'compaction', id: 'c1', encrypted_content: 'encrypted' },
                { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Next turn' }] }
            ]);
        });
    }

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
