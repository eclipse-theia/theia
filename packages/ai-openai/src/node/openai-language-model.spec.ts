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
import { Container, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { LanguageModelRequest, LanguageModelResponse, ReasoningSupport, ToolCallExecutor, ToolCallExecutorImpl, UserRequest } from '@theia/ai-core';
import { OpenAI } from 'openai';
import { MistralFixedOpenAI, OpenAiModel, OpenAiModelParams } from './openai-language-model';
import { OpenAiModelUtils } from './openai-model-utils';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';
import { ChatCompletionStreamingAsyncIteratorFactory } from './openai-chat-completion-stream';
import { getOpenAiModelDefaults } from './openai-model-defaults';
import { OPENAI_WEB_SEARCH } from './openai-server-tools';
import type { FinalRequestOptions } from 'openai/internal/request-options';

const LEGACY_GPT5_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

const O_SERIES_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

@injectable()
class TestableOpenAiModel extends OpenAiModel {
    chatCompletionsRequests = 0;

    public callGetSettings(request: LanguageModelRequest, forResponseApi: boolean = false): Record<string, unknown> {
        return this.getSettings(request, forResponseApi);
    }
    public callCreateTools(request: LanguageModelRequest): unknown {
        return this.createTools(request);
    }
    public callApplyResponseApiCompaction(settings: Record<string, unknown>, request: LanguageModelRequest): Record<string, unknown> {
        return this.applyResponseApiCompaction(settings, request);
    }
    public callHandleResponseApiRequest(request: UserRequest): Promise<LanguageModelResponse> {
        return this.handleResponseApiRequest({} as OpenAI, request);
    }
    protected override async handleChatCompletionsRequest(): Promise<LanguageModelResponse> {
        this.chatCompletionsRequests++;
        return { text: 'fallback' };
    }
}

function buildModel<T extends OpenAiModel>(
    modelType: new (...args: never[]) => T,
    params: Partial<OpenAiModelParams> & Pick<OpenAiModelParams, 'model'>,
    responseApiUtils?: OpenAiResponseApiUtils
): T {
    const parent = new Container();
    parent.bind(OpenAiModelUtils).toSelf();
    if (responseApiUtils) {
        parent.bind(OpenAiResponseApiUtils).toConstantValue(responseApiUtils);
    } else {
        parent.bind(OpenAiResponseApiUtils).toSelf();
    }
    parent.bind(ToolCallExecutor).to(ToolCallExecutorImpl);
    parent.bind(ILogger).to(MockLogger);
    // These tests never issue a streaming request, so the iterator factory is never invoked.
    const iteratorFactory: ChatCompletionStreamingAsyncIteratorFactory = () => { throw new Error('iterator not used in these tests'); };
    parent.bind(ChatCompletionStreamingAsyncIteratorFactory).toConstantValue(iteratorFactory);
    parent.bind(modelType).toSelf().inTransientScope();

    const child = new Container();
    child.parent = parent;
    child.bind(OpenAiModelParams).toConstantValue({
        id: 'test-id',
        status: { status: 'ready' },
        enableStreaming: true,
        apiKey: () => 'test-key',
        apiVersion: () => undefined,
        supportsStructuredOutput: false,
        url: undefined,
        deployment: undefined,
        ...params
    });
    return child.get(modelType);
}

function createModel(modelId: string, reasoningSupport?: ReasoningSupport): TestableOpenAiModel {
    return buildModel(TestableOpenAiModel, { model: modelId, reasoningSupport });
}

function createCompactionModel(
    serverSideCompactionEnabledByDefault: boolean,
    useResponseApi: boolean = true,
    serverSideCompactionTokenThresholdByDefault?: number
): TestableOpenAiModel {
    return buildModel(TestableOpenAiModel, {
        model: 'gpt-5',
        useResponseApi,
        serverSideCompactionSupport: useResponseApi,
        serverSideCompactionEnabledByDefault,
        serverSideCompactionTokenThresholdByDefault
    });
}

describe('OpenAiModel reasoning translation', () => {

    for (const forResponseApi of [false, true]) {
        it(`clamps unsupported levels for direct calls using ${forResponseApi ? 'Responses' : 'Chat Completions'}`, async () => {
            const model = buildModel(OpenAiModel, {
                model: 'gpt-5', enableStreaming: false, useResponseApi: forResponseApi, reasoningSupport: LEGACY_GPT5_REASONING_SUPPORT
            });
            const captured: Record<string, unknown>[] = [];
            const fetch = async (_input: unknown, init?: RequestInit): Promise<Response> => {
                captured.push(JSON.parse(init?.body as string));
                return new Response(JSON.stringify(forResponseApi
                    ? { id: 'r', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] }
                    : { choices: [{ message: { content: 'ok' } }] }), { headers: { 'content-type': 'application/json' } });
            };
            const client = new OpenAI({ apiKey: 'test-key', fetch });
            Object.assign(model, { initializeOpenAi: () => client });
            for (const level of ['none', 'max'] as const) {
                await model.request({ messages: [], sessionId: 's', requestId: level, reasoning: { level } });
            }
            expect(captured).to.have.length(2);
            expect(forResponseApi ? captured[0].reasoning : captured[0].reasoning_effort).to.equal(undefined);
            expect(forResponseApi ? captured[1].reasoning : captured[1].reasoning_effort)
                .to.deep.equal(forResponseApi ? { effort: 'high', summary: 'auto' } : 'high');
        });
    }

    describe('family reasoning presets', () => {
        for (const modelId of ['gpt-5.1', 'gpt-5.5-pro', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna']) {
            const reasoningSupport = getOpenAiModelDefaults(modelId).reasoningSupport;
            for (const level of reasoningSupport?.supportedLevels ?? []) {
                it(`passes ${level} for ${modelId} through both APIs`, () => {
                    const model = createModel(modelId, reasoningSupport);
                    const request = { messages: [], reasoning: { level } };
                    expect(model.callGetSettings(request, true).reasoning).to.deep.equal(
                        level === 'off' ? undefined : level === 'auto' ? { summary: 'auto' } : { effort: level, summary: 'auto' }
                    );
                    expect(model.callGetSettings(request, false).reasoning_effort).to.equal(level === 'off' || level === 'auto' ? undefined : level);
                });
            }
        }

        it('preserves raw request settings when off is selected for a family preset', () => {
            const model = createModel('gpt-6-astra', getOpenAiModelDefaults('gpt-6-astra').reasoningSupport);
            const settings = { reasoning: { effort: 'high', summary: 'concise' }, reasoning_effort: 'medium' };
            for (const forResponseApi of [false, true]) {
                expect(model.callGetSettings({ messages: [], settings, reasoning: { level: 'off' } }, forResponseApi)).to.deep.equal(settings);
            }
        });

        it('keeps configured summaries while overriding effort with none', () => {
            const model = createModel('gpt-6-luna', getOpenAiModelDefaults('gpt-6-luna').reasoningSupport);
            const result = model.callGetSettings({
                messages: [], reasoning: { level: 'none' }, settings: { reasoning: { effort: 'high', summary: 'concise' } }
            }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'none', summary: 'concise' });
        });
    });

    describe('Responses API (GPT-5)', () => {
        it('maps level=minimal to reasoning.effort=minimal', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'minimal', summary: 'auto' });
        });
        it('maps level=high to reasoning.effort=high', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'high' } }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'high', summary: 'auto' });
        });
        it('omits reasoning entirely when level=off', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'off' } }, true);
            expect(result.reasoning).to.equal(undefined);
        });
        it('requests reasoning summaries for level=auto without constraining effort', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' } }, true);
            expect(result.reasoning).to.deep.equal({ summary: 'auto' });
        });
        it('keeps user-configured reasoning fields but lets the selected level decide effort', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({
                messages: [], reasoning: { level: 'high' }, settings: { reasoning: { effort: 'low', summary: 'concise' } }
            }, true);
            expect(result.reasoning).to.deep.equal({ effort: 'high', summary: 'concise' });
        });
        it('keeps a user-configured reasoning.summary for level=auto', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'auto' }, settings: { reasoning: { summary: 'detailed' } } }, true);
            expect(result.reasoning).to.deep.equal({ summary: 'detailed' });
        });
    });

    describe('Chat Completions API', () => {
        it('maps level=medium to reasoning_effort=medium', () => {
            const model = createModel('o3-mini', O_SERIES_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'medium' } }, false);
            expect(result.reasoning_effort).to.equal('medium');
        });
        it('passes minimal through (GPT-5 accepts it; models that do not exclude it from their supportedLevels)', () => {
            const model = createModel('gpt-5', LEGACY_GPT5_REASONING_SUPPORT);
            const result = model.callGetSettings({ messages: [], reasoning: { level: 'minimal' } }, false);
            expect(result.reasoning_effort).to.equal('minimal');
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

    describe('createTools', () => {
        it('produces plain function tool definitions without an embedded handler function', () => {
            const model = createModel('gpt-4o', undefined);
            const tools = model.callCreateTools({
                messages: [],
                tools: [{ id: 't', name: 't', parameters: { type: 'object', properties: {} }, handler: async () => 'x' }]
            }) as Array<{ type: string; function: Record<string, unknown> }>;

            expect(tools).to.have.lengthOf(1);
            expect(tools[0].type).to.equal('function');
            expect(tools[0].function.name).to.equal('t');
            // The SDK runTools() runner is no longer used, so no executable function is embedded.
            expect('function' in tools[0].function).to.equal(false);
        });
    });
});

describe('OpenAiModel Response API fallback', () => {
    function createFailingModel(): TestableOpenAiModel {
        const responseApiUtils = {
            handleRequest: async () => { throw new Error('Response API unavailable'); }
        } as unknown as OpenAiResponseApiUtils;
        return buildModel(TestableOpenAiModel, { model: 'gpt-5', useResponseApi: true }, responseApiUtils);
    }

    it('does not fall back to Chat Completions when a server tool is selected', async () => {
        const model = createFailingModel();
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [],
            serverTools: [OPENAI_WEB_SEARCH]
        };

        let error: unknown;
        try {
            await model.callHandleResponseApiRequest(request);
        } catch (caught) {
            error = caught;
        }

        expect(error).to.be.instanceOf(Error).with.property('message', 'Response API unavailable');
        expect(model.chatCompletionsRequests).to.equal(0);
    });

    it('retains Chat Completions fallback when no server tool is selected', async () => {
        const model = createFailingModel();
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: []
        };

        expect(await model.callHandleResponseApiRequest(request)).to.deep.equal({ text: 'fallback' });
        expect(model.chatCompletionsRequests).to.equal(1);
    });
});

class TestableMistralFixedOpenAI extends MistralFixedOpenAI {
    callPrepareOptions(options: FinalRequestOptions): Promise<void> {
        return this.prepareOptions(options);
    }
}

describe('MistralFixedOpenAI request preparation', () => {

    const client = new TestableMistralFixedOpenAI({ apiKey: 'test-key' });

    it('leaves a request without a body alone', async () => {
        // `GET /models`, which model discovery issues, carries no body at all.
        const options = { method: 'get', path: '/models' } as FinalRequestOptions;
        await client.callPrepareOptions(options);
        expect(options.body).to.equal(undefined);
    });

    it('leaves a body without messages alone', async () => {
        const options = { method: 'post', path: '/embeddings', body: { input: 'hello' } } as FinalRequestOptions;
        await client.callPrepareOptions(options);
        expect(options.body).to.deep.equal({ input: 'hello' });
    });

    it('replaces the null refusal of an assistant tool call with undefined', async () => {
        const options = {
            method: 'post',
            path: '/chat/completions',
            body: {
                messages: [
                    // eslint-disable-next-line no-null/no-null
                    { role: 'assistant', tool_calls: [{ id: 't1' }], refusal: null, parsed: null }
                ]
            }
        } as FinalRequestOptions;
        await client.callPrepareOptions(options);
        const message = (options.body as { messages: Array<Record<string, unknown>> }).messages[0];
        expect(message.refusal).to.equal(undefined);
        expect(message.parsed).to.equal(undefined);
    });
});

describe('OpenAiModel server-side compaction (Response API)', () => {

    it('adds context_management when model default is on and request has no compaction setting', () => {
        const model = createCompactionModel(true);
        const result = model.callApplyResponseApiCompaction({ stream: true }, { messages: [] });
        expect(result.context_management).to.deep.equal([{ type: 'compaction' }]);
        expect(result.stream).to.equal(true);
    });

    it('adds the model default token threshold', () => {
        const model = createCompactionModel(true, true, 200_000);
        const result = model.callApplyResponseApiCompaction({}, { messages: [] });
        expect(result.context_management).to.deep.equal([{ type: 'compaction', compact_threshold: 200_000 }]);
    });

    it('uses the session token threshold over the model default', () => {
        const model = createCompactionModel(true, true, 200_000);
        const result = model.callApplyResponseApiCompaction({}, { messages: [], compaction: { tokenThreshold: 300_000 } });
        expect(result.context_management).to.deep.equal([{ type: 'compaction', compact_threshold: 300_000 }]);
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
