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
import * as sinon from 'sinon';
import {
    isCompactionResponsePart, isTextResponsePart, LanguageModelMessage, LanguageModelResponse, LanguageModelStreamResponsePart, ReasoningSupport,
    ToolCallExecutor, ToolCallExecutorImpl, UserRequest
} from '@theia/ai-core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-model-utils';
import { OPENAI_WEB_SEARCH } from '@theia/ai-openai/lib/node/openai-server-tools';
import { OpenAI } from 'openai';
import { CancellationTokenSource, ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { CHATGPT_CODEX_RESPONSES_BASE_URL, CHATGPT_RESPONSES_BASE_URL, ChatGptCredentials } from '../common';
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

const CREDENTIALS: ChatGptCredentials = { accessToken: 'access-token', clientId: 'dynamic_agent_client_test' };

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

function defaultHeadersOf(openai: OpenAI): Record<string, string> | undefined {
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
        expect(headers).to.deep.equal({
            'session-id': 'session',
            'thread-id': 'session',
            'x-client-request-id': 'request'
        });
    });

    it('uses Codex routing and legacy headers without changing the OSS receiver', async () => {
        const { model, utils } = createModel(async () => ({ ...CREDENTIALS, authenticationMode: 'codex', accountId: 'legacy-account' }));
        const select = sinon.spy(utils, 'forAuthenticationMode');
        await model.request({ ...createRequest(), parentSessionId: 'parent' });
        const codexUtils = select.returnValues[0] as CapturingResponseApiUtils;
        expect(codexUtils).not.to.equal(utils);
        expect(codexUtils.compactionProvider).to.equal('chatgpt-responses');
        expect(utils.compactionProvider).to.equal('chatgpt-oss-responses');
        expect(codexUtils.captured!.openai.baseURL).to.equal(CHATGPT_CODEX_RESPONSES_BASE_URL);
        expect(defaultHeadersOf(codexUtils.captured!.openai)).to.deep.equal({
            'chatgpt-account-id': 'legacy-account', 'OpenAI-Beta': 'responses=experimental', originator: 'theia',
            session_id: 'parent', 'session-id': 'parent', 'thread-id': 'session', 'x-client-request-id': 'request'
        });
    });

    it('refuses a mode change before SDK transport without sending either token', async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}'));
        let credentials: ChatGptCredentials = { ...CREDENTIALS, authenticationMode: 'codex', accountId: 'account' };
        try {
            const { model, utils } = createModel(async () => credentials);
            const select = sinon.spy(utils, 'forAuthenticationMode');
            await model.request(createRequest());
            const receiver = select.returnValues[0] as CapturingResponseApiUtils;
            const transport = (receiver.captured!.openai as unknown as { _options: { fetch: typeof fetch } })._options.fetch;
            credentials = { ...CREDENTIALS, authenticationMode: 'oss' };
            let error: unknown;
            try { await transport(`${CHATGPT_CODEX_RESPONSES_BASE_URL}/responses`); } catch (caught) { error = caught; }
            expect((error as Error).message).to.contain('account changed or disconnected');
            expect(fetchStub.called).to.equal(false);
        } finally { fetchStub.restore(); }
    });

    it('shares cache affinity with the immediate parent while retaining the child thread', async () => {
        const { model, utils } = createModel();
        await model.request({ ...createRequest(), sessionId: 'child', parentSessionId: 'parent' });
        expect(defaultHeadersOf(utils.captured!.openai)).to.deep.equal({
            'session-id': 'parent',
            'thread-id': 'child',
            'x-client-request-id': 'request'
        });
    });

    it('uses the subrequest identifier for request tracing when available', async () => {
        const { model, utils } = createModel();
        await model.request({ ...createRequest(), subRequestId: 'subrequest' });
        expect(defaultHeadersOf(utils.captured!.openai)!['x-client-request-id']).to.equal('subrequest');
    });

    it('keeps cache affinity stable across turns while updating request tracing', async () => {
        const { model, utils } = createModel();
        await model.request(createRequest());
        const firstHeaders = defaultHeadersOf(utils.captured!.openai);
        await model.request({ ...createRequest(), requestId: 'next-request' });
        expect(defaultHeadersOf(utils.captured!.openai)).to.deep.equal({
            'session-id': 'session',
            'thread-id': 'session',
            'x-client-request-id': 'next-request'
        });
        expect(firstHeaders).to.deep.equal({
            'session-id': 'session',
            'thread-id': 'session',
            'x-client-request-id': 'request'
        });
    });

    it('keeps headers isolated when another chat uses the same model', async () => {
        const { model, utils } = createModel();
        await model.request({ ...createRequest(), sessionId: 'child', parentSessionId: 'parent' });
        const childHeaders = defaultHeadersOf(utils.captured!.openai);
        await model.request({ ...createRequest(), sessionId: 'unrelated', requestId: 'other-request' });
        expect(defaultHeadersOf(utils.captured!.openai)).to.deep.equal({
            'session-id': 'unrelated',
            'thread-id': 'unrelated',
            'x-client-request-id': 'other-request'
        });
        expect(childHeaders).to.deep.equal({
            'session-id': 'parent',
            'thread-id': 'child',
            'x-client-request-id': 'request'
        });
    });

    it('sends stable cache headers through SDK retries while renewing the OAuth bearer', async () => {
        let credentials = { ...CREDENTIALS };
        const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => {
            if (fetchStub.callCount === 1) {
                credentials = { ...CREDENTIALS, accessToken: 'renewed-oauth' };
                return new Response('{}', { status: 429, headers: { 'retry-after-ms': '1' } });
            }
            const event = { type: 'response.completed', response: { id: 'response', object: 'response', status: 'completed', output: [] } };
            return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
        });
        try {
            const { model, utils } = createModel(async () => credentials);
            model.maxRetries = 1;
            await model.request({ ...createRequest(), sessionId: 'child', parentSessionId: 'parent' });
            const stream = await utils.captured!.openai.responses.create({ model: 'gpt-5.5', input: 'Hello', store: false, stream: true });
            for await (const _event of stream) { /* Consume the successful streamed response. */ }
            expect(fetchStub.calledTwice).to.equal(true);
            for (const [index, call] of fetchStub.getCalls().entries()) {
                const headers = new Headers(call.args[1]?.headers);
                expect(headers.get('session-id')).to.equal('parent');
                expect(headers.get('thread-id')).to.equal('child');
                expect(headers.get('x-client-request-id')).to.equal('request');
                expect(headers.get('Authorization')).to.equal(`Bearer ${index === 0 ? 'access-token' : 'renewed-oauth'}`);
            }
        } finally { fetchStub.restore(); }
    });

    it('offers the server-side web search of the endpoint', () => {
        const { model } = createModel();
        expect(model.serverTools.map(tool => tool.id)).to.include(OPENAI_WEB_SEARCH);
    });

    it('rejects credentials from a different account during an SDK request', async () => {
        let clientId = 'dynamic_agent_client_test';
        const { model, utils } = createModel(async () => ({ accessToken: 'token', clientId }));
        await model.request(createRequest());
        clientId = 'dynamic_agent_client_other';
        const apiKey = (utils.captured!.openai as unknown as { _options: { apiKey: () => Promise<string> } })._options.apiKey;
        let error: unknown;
        try { await apiKey(); } catch (caught) { error = caught; }
        expect((error as Error).message).to.contain('account changed or disconnected');
    });

    it('rejects a reconnected session even when its client id is unchanged', async () => {
        let sessionId = 'original';
        const { model, utils } = createModel(async () => ({ ...CREDENTIALS, sessionId }));
        await model.request(createRequest());
        sessionId = 'replacement';
        const apiKey = (utils.captured!.openai as unknown as { _options: { apiKey: () => Promise<string> } })._options.apiKey;
        let error: unknown;
        try { await apiKey(); } catch (caught) { error = caught; }
        expect((error as Error).message).to.contain('account changed or disconnected');
    });

    it('rejects a disconnected session instead of sending an empty credential', async () => {
        let connected = true;
        const { model, utils } = createModel(async () => connected ? CREDENTIALS : undefined);
        await model.request(createRequest());
        connected = false;
        const apiKey = (utils.captured!.openai as unknown as { _options: { apiKey: () => Promise<string> } })._options.apiKey;
        let error: unknown;
        try { await apiKey(); } catch (caught) { error = caught; }
        expect((error as Error).message).to.contain('account changed or disconnected');
    });

    it('renews the OAuth bearer before sending HTTP', async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('{}'));
        let credentials: ChatGptCredentials = { ...CREDENTIALS };
        try {
            const { model, utils } = createModel(async () => credentials);
            await model.request(createRequest());
            credentials = { ...CREDENTIALS, accessToken: 'renewed-oauth' };
            const transport = (utils.captured!.openai as unknown as { _options: { fetch: typeof fetch } })._options.fetch;
            await transport('https://api.openai.com/v1/responses', { headers: { Authorization: 'Bearer stale-oauth', Accept: 'application/json' } });
            const headers = new Headers(fetchStub.firstCall.args[1]?.headers);
            expect(headers.get('Authorization')).to.equal('Bearer renewed-oauth');
            expect(headers.get('Accept')).to.equal('application/json');
            expect(headers.has('chatgpt-account-id')).to.equal(false);
        } finally { fetchStub.restore(); }
    });

    it('resolves the access token per request, so a refreshed token is picked up', async () => {
        const tokens = ['first-token', 'second-token'];
        const { model, utils } = createModel(async () => ({ accessToken: tokens.shift() ?? 'exhausted', clientId: 'dynamic_agent_client_test' }));
        await model.request(createRequest());

        const apiKey = (utils.captured!.openai as unknown as { _options: { apiKey: () => Promise<string> } })._options.apiKey;
        expect(await apiKey()).to.equal('second-token');
    });
});

describe('ChatGptResponseApiUtils', () => {

    const utils = new ChatGptResponseApiUtils();

    it('does not log a provider failure when a ChatGPT stream is cancelled', async () => {
        const container = new Container();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(ToolCallExecutor).to(ToolCallExecutorImpl).inSingletonScope();
        container.bind(ChatGptResponseApiUtils).toSelf();
        const responseUtils = container.get(ChatGptResponseApiUtils);
        const logError = sinon.spy(container.get<ILogger>(ILogger), 'error');
        const cancellation = new CancellationTokenSource();
        const providerError = new Error('Cancelled provider request');
        cancellation.cancel();
        try {
            let error: unknown;
            try {
                const stream = responseUtils.streamWithReasoningSummaryFallback({}, 'chatgpt/gpt-5.5', async function* (): AsyncIterable<never> {
                    throw providerError;
                }, cancellation.token);
                for await (const _event of stream) { /* Consume until the provider throws. */ }
            } catch (caught) { error = caught; }
            expect(error).to.equal(providerError);
            expect(logError.called).to.equal(false);
        } finally {
            logError.restore();
            cancellation.dispose();
        }
    });

    for (const [mode, withTools] of (['oss', 'codex'] as const).flatMap(selectedMode => [false, true].map(toolsEnabled => [selectedMode, toolsEnabled] as const))) {
        it(`streams and replays encrypted compaction through ${mode} ${withTools ? 'with client tools' : 'without tools'}`, async () => {
            const container = new Container();
            container.bind(ILogger).to(MockLogger);
            container.bind(ToolCallExecutor).to(ToolCallExecutorImpl).inSingletonScope();
            container.bind(ChatGptResponseApiUtils).toSelf();
            const responseUtils = container.get(ChatGptResponseApiUtils);
            const payloads: Record<string, unknown>[] = [];
            const openai = {
                baseURL: mode === 'codex' ? CHATGPT_CODEX_RESPONSES_BASE_URL : CHATGPT_RESPONSES_BASE_URL,
                responses: {
                    stream: (payload: Record<string, unknown>) => {
                        payloads.push(payload);
                        return (async function* (): AsyncIterable<unknown> {
                            if (payloads.length === 1) {
                                yield { type: 'response.output_item.done', item: { type: 'compaction', id: 'c1', encrypted_content: 'encrypted' } };
                            } else {
                                yield { type: 'response.output_text.delta', delta: 'Continued answer' };
                            }
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
            expect(compaction).to.deep.equal([{
                compaction: { provider: mode === 'codex' ? 'chatgpt-responses' : 'chatgpt-oss-responses', data: { id: 'c1', encrypted_content: 'encrypted' } }
            }]);
            const replay = await model.request({
                ...request,
                messages: [
                    ...request.messages,
                    { actor: 'ai', type: 'compaction', ...compaction[0].compaction },
                    { actor: 'user', type: 'text', text: 'Next turn' }
                ]
            });
            const replayParts: LanguageModelStreamResponsePart[] = [];
            expect('stream' in replay).to.equal(true);
            if ('stream' in replay) {
                for await (const part of replay.stream) { replayParts.push(part); }
            }
            expect(replayParts.filter(isTextResponsePart)).to.deep.equal([{ content: 'Continued answer' }]);
            expect(replayParts.filter(isCompactionResponsePart)).to.be.empty;
            expect(payloads).to.have.lengthOf(2);
            expect(payloads[1]).to.include({ store: false, stream: true, instructions: DEFAULT_CHATGPT_INSTRUCTIONS });
            expect(payloads[1].context_management).to.deep.equal([{ type: 'compaction' }]);
            expect(payloads[1].input).to.deep.equal([
                { type: 'compaction', id: 'c1', encrypted_content: 'encrypted' },
                { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Next turn' }] }
            ]);
        });
    }

    for (const withTools of [false, true]) {
        for (const eventType of ['response.failed', 'response.incomplete'] as const) {
            it(`propagates ${eventType} ${withTools ? 'with tools' : 'without tools'}`, async () => {
                const container = new Container();
                container.bind(ILogger).to(MockLogger);
                container.bind(ToolCallExecutor).to(ToolCallExecutorImpl).inSingletonScope();
                container.bind(ChatGptResponseApiUtils).toSelf();
                const responseUtils = container.get(ChatGptResponseApiUtils);
                const openai = {
                    responses: {
                        stream: () => (async function* (): AsyncIterable<unknown> {
                            yield { type: 'response.output_text.delta', delta: 'Partial text' };
                            yield {
                                type: eventType, response: {
                                    error: { code: 'usage_limit_reached', message: 'usage_limit_reached' }, incomplete_details: { reason: 'max_output_tokens' }
                                }
                            };
                        })()
                    }
                } as unknown as OpenAI;
                const request: UserRequest = {
                    ...createRequest(),
                    tools: withTools ? [{ id: 'lookup', name: 'lookup', parameters: { type: 'object', properties: {} }, handler: async () => 'result' }] : undefined
                };
                const response = await responseUtils.handleRequest(openai, request, {}, 'gpt-5.5', new OpenAiModelUtils(),
                    'developer', 'chatgpt/gpt-5.5', true);
                let error: unknown;
                try {
                    if ('stream' in response) {
                        for await (const _part of response.stream) { /* Consume until the terminal event. */ }
                    }
                } catch (caught) { error = caught; }
                expect((error as Error).message).to.contain(eventType === 'response.failed' ? 'usage_limit_reached' : 'max_output_tokens');
            });
        }
    }

    it('keeps concurrent mode receivers isolated and never replays OSS context through Codex', () => {
        const codexUtils = utils.forAuthenticationMode('codex');
        const ossUtils = utils.forAuthenticationMode('oss');
        expect(codexUtils.compactionProvider).to.equal('chatgpt-responses');
        expect(ossUtils.compactionProvider).to.equal('chatgpt-oss-responses');
        const { input } = codexUtils.processMessages([
            { actor: 'user', type: 'text', text: 'Old turn' },
            { actor: 'ai', type: 'compaction', provider: 'chatgpt-oss-responses', data: { encrypted_content: 'public' } },
            { actor: 'user', type: 'text', text: 'Next turn' }
        ], 'developer', 'gpt-5.5');
        expect(input).to.have.lengthOf(2);
        expect(input.every(item => item.type === 'message')).to.equal(true);
        expect(utils.compactionProvider).to.equal('chatgpt-oss-responses');
    });

    it('ignores legacy private-endpoint compaction without dropping history', () => {
        const { input } = utils.processMessages([
            { actor: 'user', type: 'text', text: 'Old turn' },
            { actor: 'ai', type: 'compaction', provider: 'chatgpt-responses', data: { encrypted_content: 'private' } },
            { actor: 'user', type: 'text', text: 'Next turn' }
        ], 'developer', 'gpt-5.5');
        expect(input).to.have.lengthOf(2);
        expect(input.every(item => item.type === 'message')).to.equal(true);
    });

    it('ignores OpenAI compaction without dropping earlier conversation history', () => {
        const { input } = utils.processMessages([
            { actor: 'user', type: 'text', text: 'Old turn' },
            { actor: 'ai', type: 'compaction', provider: 'openai-responses', data: { id: 'c1', encrypted_content: 'foreign' } },
            { actor: 'user', type: 'text', text: 'Next turn' }
        ], 'developer', 'gpt-5.5');
        expect(input).to.deep.equal([
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Old turn' }] },
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Next turn' }] }
        ]);
    });

    it('replays only the latest ChatGPT compaction among mixed provider markers', () => {
        const { input } = utils.processMessages([
            { actor: 'user', type: 'text', text: 'Old turn' },
            { actor: 'ai', type: 'compaction', provider: 'chatgpt-oss-responses', data: { id: 'c1', encrypted_content: 'old' } },
            { actor: 'ai', type: 'compaction', provider: 'openai-responses', data: { encrypted_content: 'foreign1' } },
            { actor: 'user', type: 'text', text: 'Middle turn' },
            { actor: 'ai', type: 'compaction', provider: 'chatgpt-oss-responses', data: { id: 'c2', encrypted_content: 'latest' } },
            { actor: 'ai', type: 'compaction', provider: 'openai-responses', data: { encrypted_content: 'foreign2' } },
            { actor: 'user', type: 'text', text: 'Next turn' }
        ], 'developer', 'gpt-5.5');
        expect(input).to.deep.equal([
            { type: 'compaction', id: 'c2', encrypted_content: 'latest' },
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Next turn' }] }
        ]);
    });

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
