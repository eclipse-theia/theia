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

import 'reflect-metadata';

import { expect } from 'chai';
import {
    CapabilityAwareContext, GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID,
    LanguageModel, LanguageModelMessage, LanguageModelRegistry, LanguageModelRequirement, LanguageModelResponse,
    LanguageModelSelector, LanguageModelService, LanguageModelStreamResponsePart, PromptService, ResolvedAIVariable, ResolvedPromptFragment, ServerToolDescriptor, UserRequest
} from '@theia/ai-core';
import { AbstractChatAgent, AbstractStreamParsingChatAgent, ChatAgentLocation, ChatSessionContext, SystemMessageDescription } from './chat-agents';
import { CustomChatAgent } from './custom-chat-agent';
import {
    ChatResponseContent,
    CompactionChatResponseContent,
    MutableChatModel,
    MutableChatRequestModel,
    ChatModel,
    ChatRequest,
    TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
} from './chat-model';
import { ParsedChatRequest, ParsedChatRequestTextPart } from './parsed-chat-request';
import { FileReadTracker } from './file-read-tracker';
import { ILogger, Loggable } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

class RecordingLogger extends MockLogger {
    readonly warnings: string[] = [];
    override warn(arg: string | Loggable, ...params: unknown[]): Promise<void> {
        this.warnings.push(String(arg));
        return Promise.resolve();
    }
}

class TestChatAgent extends AbstractChatAgent {
    readonly id = 'test-agent';
    readonly name = 'Test Agent';
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    protected readonly defaultLanguageModelPurpose = 'chat';
    protected override logger: ILogger = new MockLogger();

    protected addContentsToResponse(): Promise<void> {
        return Promise.resolve();
    }

    public async exposeGetMessages(model: ChatModel, includeResponseInProgress = false): Promise<LanguageModelMessage[]> {
        return this.getMessages(model, includeResponseInProgress);
    }

    public exposeSendLlmRequest(request: MutableChatRequestModel, languageModel: LanguageModel): Promise<LanguageModelResponse> {
        return this.sendLlmRequest(request, [], [], undefined, languageModel);
    }

    public exposeGetLanguageModelForRequest(request: MutableChatRequestModel, purpose = 'chat'): Promise<LanguageModel> {
        return this.getLanguageModelForRequest(request, purpose);
    }

    public setLanguageModelRegistry(registry: LanguageModelRegistry): void {
        this.languageModelRegistry = registry;
    }

    public exposeAppendExternalFileChangeNotice(request: MutableChatRequestModel, messages: LanguageModelMessage[]): Promise<void> {
        return this.appendExternalFileChangeNotice(request, messages);
    }

    public setFileReadTracker(tracker: FileReadTracker): void {
        this.fileReadTracker = tracker;
    }

    public setTurnPromptId(id: string | undefined): void {
        this.turnPromptId = id;
    }

    public setSystemPromptId(id: string | undefined): void {
        this.systemPromptId = id;
    }

    public setPromptService(service: PromptService): void {
        this.promptService = service;
    }

    public exposeResolveTurnPrompt(context: ChatSessionContext): Promise<ResolvedPromptFragment | undefined> {
        return this.resolveTurnPrompt(context);
    }

    public useRecordingLogger(): RecordingLogger {
        const logger = new RecordingLogger();
        this.logger = logger;
        return logger;
    }

    public exposeWarnAboutVolatileSystemPromptVariables(description: SystemMessageDescription): void {
        this.warnAboutVolatileSystemPromptVariables(description);
    }

    public exposeAppendGenericCapabilities(systemMessage: SystemMessageDescription, context: CapabilityAwareContext): Promise<SystemMessageDescription> {
        return this.appendGenericCapabilities(systemMessage, context);
    }

}

function createParsedRequest(text: string, request?: Partial<ChatRequest>): ParsedChatRequest {
    return {
        request: { text, ...request },
        parts: [
            new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)
        ],
        toolRequests: new Map(),
        variables: []
    };
}

describe('AbstractChatAgent.getMessages', () => {

    let agent: TestChatAgent;

    beforeEach(() => {
        agent = new TestChatAgent();
    });

    function addThinkingResponse(request: MutableChatRequestModel, content: string, signature: string): void {
        request.response.response.addContent(new ThinkingChatResponseContentImpl(content, signature));
    }

    function addTextResponse(request: MutableChatRequestModel, text: string): void {
        request.response.response.addContent(new TextChatResponseContentImpl(text));
    }

    it('filters out incomplete thinking blocks (empty signature) from a cancelled stream', async () => {
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const request = model.addRequest(createParsedRequest('Hello'));

        addThinkingResponse(request, 'Some thinking that was cancelled', '');
        request.response.cancel();

        const messages = await agent.exposeGetMessages(model);

        expect(messages.filter(LanguageModelMessage.isThinkingMessage)).to.have.lengthOf(0);
        // The user text message should still be included
        const userTextMessages = messages
            .filter(LanguageModelMessage.isTextMessage)
            .filter(m => m.actor === 'user');
        expect(userTextMessages).to.have.lengthOf(1);
    });

    it('keeps thinking blocks with a valid signature', async () => {
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const request = model.addRequest(createParsedRequest('Hello'));

        addThinkingResponse(request, 'Complete thought', 'sig-abc');
        addTextResponse(request, 'Hi there');
        request.response.complete();

        const messages = await agent.exposeGetMessages(model);

        const thinkingMessages = messages.filter(LanguageModelMessage.isThinkingMessage);
        expect(thinkingMessages).to.have.lengthOf(1);
        expect(thinkingMessages[0].thinking).to.equal('Complete thought');
        expect(thinkingMessages[0].signature).to.equal('sig-abc');
    });

    it('filters incomplete thinking but preserves following text content from the same response', async () => {
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const request = model.addRequest(createParsedRequest('Hello'));

        addThinkingResponse(request, 'Cancelled thought', '');
        addTextResponse(request, 'Partial reply before cancel');
        request.response.cancel();

        const messages = await agent.exposeGetMessages(model);

        expect(messages.filter(LanguageModelMessage.isThinkingMessage)).to.have.lengthOf(0);

        const aiTextMessages = messages
            .filter(LanguageModelMessage.isTextMessage)
            .filter(m => m.actor === 'ai');
        expect(aiTextMessages).to.have.lengthOf(1);
        expect(aiTextMessages[0].text).to.equal('Partial reply before cancel');
    });
});

describe('AbstractChatAgent turn prompt', () => {

    function summarize(messages: LanguageModelMessage[]): string[] {
        return messages.map(message => message.type === 'text' ? `${message.actor}:${message.text}` : message.type);
    }

    it('appends a stored turn prompt to the user text of its request, in the same user message, for every request', async () => {
        const agent = new TestChatAgent();
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const first = model.addRequest(createParsedRequest('First'));
        first.setTurnPrompt('editors: a.ts');
        first.response.response.addContent(new TextChatResponseContentImpl('Reply 1'));
        first.response.complete();
        const second = model.addRequest(createParsedRequest('Second'));
        second.response.response.addContent(new TextChatResponseContentImpl('Reply 2'));
        second.response.complete();
        const third = model.addRequest(createParsedRequest('Third'));
        third.setTurnPrompt('editors: b.ts');

        const messages = await agent.exposeGetMessages(model);

        expect(summarize(messages)).to.deep.equal([
            'user:First\n\neditors: a.ts', 'ai:Reply 1',
            'user:Second', 'ai:Reply 2',
            'user:Third\n\neditors: b.ts'
        ]);
    });

    it('sends the turn prompt alone when the request has no text', async () => {
        const agent = new TestChatAgent();
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        model.addRequest(createParsedRequest('')).setTurnPrompt('editors: c.ts');

        const messages = await agent.exposeGetMessages(model);

        expect(summarize(messages)).to.deep.equal(['user:editors: c.ts']);
    });

    it('resolves the declared turn prompt fragment with the session context', async () => {
        const agent = new TestChatAgent();
        agent.setTurnPromptId('my-turn-prompt');
        const calls: unknown[][] = [];
        agent.setPromptService({
            getResolvedPromptFragment: async (id: string, args: unknown, ctx: unknown) => {
                calls.push([id, args, ctx]);
                return { id, text: 'current state' };
            }
        } as unknown as PromptService);
        const context: ChatSessionContext = { model: new MutableChatModel(ChatAgentLocation.Panel) };

        const resolved = await agent.exposeResolveTurnPrompt(context);

        expect(resolved?.text).to.equal('current state');
        expect(calls).to.deep.equal([['my-turn-prompt', undefined, context]]);
    });

    it('resolves nothing when no turn prompt is declared', async () => {
        const agent = new TestChatAgent();
        agent.setPromptService({
            getResolvedPromptFragment: async () => { throw new Error('must not be called'); }
        } as unknown as PromptService);

        const resolved = await agent.exposeResolveTurnPrompt({ model: new MutableChatModel(ChatAgentLocation.Panel) });

        expect(resolved).to.equal(undefined);
    });

    it('warns once when the declared turn prompt id names no existing fragment, naming the agent and the fragment id', async () => {
        const agent = new TestChatAgent();
        const logger = agent.useRecordingLogger();
        agent.setTurnPromptId('no-such-fragment');
        agent.setPromptService({
            getResolvedPromptFragment: async () => undefined
        } as unknown as PromptService);
        const context: ChatSessionContext = { model: new MutableChatModel(ChatAgentLocation.Panel) };

        const first = await agent.exposeResolveTurnPrompt(context);
        const second = await agent.exposeResolveTurnPrompt(context);

        expect(first).to.equal(undefined);
        expect(second).to.equal(undefined);
        expect(logger.warnings).to.have.lengthOf(1);
        expect(logger.warnings[0]).to.contain('test-agent').and.to.contain('no-such-fragment');
    });

    it('a custom agent exposes the turn prompt id through its setter', async () => {
        const agent = new CustomChatAgent();
        agent.turnPrompt = 'open-editors-hint';
        const calls: string[] = [];
        (agent as unknown as { promptService: PromptService }).promptService = {
            getResolvedPromptFragment: async (id: string) => { calls.push(id); return { id, text: 'state' }; }
        } as unknown as PromptService;

        const resolved = await (agent as unknown as { resolveTurnPrompt(c: ChatSessionContext): Promise<ResolvedPromptFragment | undefined> })
            .resolveTurnPrompt({ model: new MutableChatModel(ChatAgentLocation.Panel) });

        expect(resolved?.text).to.equal('state');
        expect(calls).to.deep.equal(['open-editors-hint']);
    });
});

describe('AbstractChatAgent.sendLlmRequest server tools', () => {

    const ANTHROPIC_SERVER_TOOLS: ServerToolDescriptor[] = [
        { id: 'web_fetch', name: 'Web Fetch' },
        { id: 'web_search', name: 'Web Search' }
    ];

    function createModel(vendor: string, serverTools?: ServerToolDescriptor[]): LanguageModel {
        return {
            id: `${vendor}/model`,
            vendor,
            status: { status: 'ready' as const },
            serverTools,
            async request(): Promise<LanguageModelResponse> { return { text: '' }; }
        } as unknown as LanguageModel;
    }

    function setup(languageModel: LanguageModel, serverToolSelections?: Record<string, string[]>): { agent: TestChatAgent; captured: () => UserRequest | undefined } {
        const agent = new TestChatAgent();
        let capturedRequest: UserRequest | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (agent as any).languageModelService = {
            sessions: [],
            onSessionChanged: () => ({ dispose: () => { } }),
            async sendRequest(_model: LanguageModel, sentRequest: UserRequest): Promise<LanguageModelResponse> {
                capturedRequest = sentRequest;
                return { text: '' };
            }
        } as unknown as LanguageModelService;

        const chatModel = new MutableChatModel(ChatAgentLocation.Panel);
        const request = chatModel.addRequest(createParsedRequest('Hello', { serverToolSelections }));
        agent.exposeSendLlmRequest(request, languageModel);
        return { agent, captured: () => capturedRequest };
    }

    it('sends server tools for the selected model vendor, intersected with the model\'s declared tools', () => {
        const model = createModel('anthropic', ANTHROPIC_SERVER_TOOLS);
        const { captured } = setup(model, { anthropic: ['web_fetch', 'unknown_tool'] });
        expect(captured()!.serverTools).to.deep.equal(['web_fetch']);
    });

    it('does not send selections stored for a different vendor', () => {
        const model = createModel('google', [{ id: 'url_context', name: 'URL Context' }]);
        const { captured } = setup(model, { anthropic: ['web_fetch'] });
        expect(captured()!.serverTools).to.equal(undefined);
    });

    it('leaves serverTools undefined when there are no selections', () => {
        const model = createModel('anthropic', ANTHROPIC_SERVER_TOOLS);
        const { captured } = setup(model, undefined);
        expect(captured()!.serverTools).to.equal(undefined);
    });
});

class StreamParsingTestChatAgent extends AbstractStreamParsingChatAgent {
    readonly id = 'stream-test-agent';
    readonly name = 'Stream Test Agent';
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    protected readonly defaultLanguageModelPurpose = 'chat';
    protected override logger: ILogger = new MockLogger();

    exposeParse(token: LanguageModelStreamResponsePart): ChatResponseContent | ChatResponseContent[] {
        return this.parse(token, undefined as never);
    }
}

describe('AbstractChatAgent.parse compaction', () => {
    it('creates compaction content from a compaction response part', () => {
        const agent = new StreamParsingTestChatAgent();
        const content = agent.exposeParse({ compaction: { provider: 'anthropic', data: { b: 1 }, summary: 's' } });
        expect(ChatResponseContent.is(content)).to.equal(true);
        expect(CompactionChatResponseContent.is(content)).to.equal(true);
        const compaction = content as CompactionChatResponseContent;
        expect(compaction.provider).to.equal('anthropic');
        expect(compaction.data).to.deep.equal({ b: 1 });
        expect(compaction.summary).to.equal('s');
    });
});

describe('AbstractChatAgent.getLanguageModelForRequest', () => {

    const DEFAULT_MODEL = 'default-model';
    const OVERRIDE_MODEL = 'override-model';

    let agent: TestChatAgent;
    let requestedIdentifiers: (string | undefined)[];

    function fakeModel(id: string): LanguageModel {
        return { id } as LanguageModel;
    }

    beforeEach(() => {
        agent = new TestChatAgent();
        agent.languageModelRequirements.push({ purpose: 'chat', identifier: DEFAULT_MODEL });
        requestedIdentifiers = [];
        // Resolve any of the known model ids; anything else (e.g. an unavailable override) resolves to undefined.
        const known = new Set([DEFAULT_MODEL, OVERRIDE_MODEL]);
        agent.setLanguageModelRegistry({
            // Settings-aware selection used for the agent default (fallback) path.
            async selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined> {
                requestedIdentifiers.push(request.identifier);
                return request.identifier && known.has(request.identifier) ? fakeModel(request.identifier) : undefined;
            },
            // Direct resolution used for the per-session override path (bypasses agent settings).
            async getReadyLanguageModel(idOrAlias: string): Promise<LanguageModel | undefined> {
                requestedIdentifiers.push(idOrAlias);
                return known.has(idOrAlias) ? fakeModel(idOrAlias) : undefined;
            }
        } as unknown as LanguageModelRegistry);
    });

    function createRequest(modelOverride?: string): MutableChatRequestModel {
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const request = model.addRequest(createParsedRequest('Hello'));
        if (modelOverride !== undefined) {
            model.setSettings({ commonSettings: { modelId: modelOverride } });
        }
        return request;
    }

    it('uses the agent default when no session override is set', async () => {
        const resolved = await agent.exposeGetLanguageModelForRequest(createRequest());
        expect(resolved.id).to.equal(DEFAULT_MODEL);
    });

    it('honors the session model override when it resolves', async () => {
        const resolved = await agent.exposeGetLanguageModelForRequest(createRequest(OVERRIDE_MODEL));
        expect(resolved.id).to.equal(OVERRIDE_MODEL);
        // The override id must be the first thing tried.
        expect(requestedIdentifiers[0]).to.equal(OVERRIDE_MODEL);
    });

    it('falls back to the agent default when the session override does not resolve', async () => {
        const resolved = await agent.exposeGetLanguageModelForRequest(createRequest('no-such-model'));
        expect(resolved.id).to.equal(DEFAULT_MODEL);
        // First the unavailable override is attempted, then the agent default.
        expect(requestedIdentifiers).to.deep.equal(['no-such-model', DEFAULT_MODEL]);
    });

    it('throws when neither the override nor the default resolves', async () => {
        agent.languageModelRequirements.length = 0;
        agent.languageModelRequirements.push({ purpose: 'chat', identifier: 'missing-default' });
        let error: Error | undefined;
        try {
            await agent.exposeGetLanguageModelForRequest(createRequest('also-missing'));
        } catch (e) {
            error = e as Error;
        }
        expect(error).to.be.an('error');
    });
});

describe('AbstractChatAgent.appendExternalFileChangeNotice', () => {

    function createAgent(getChangedFiles: () => Promise<string[]>): TestChatAgent {
        const agent = new TestChatAgent();
        agent.setFileReadTracker({
            recordRead: async () => { },
            isStale: async () => false,
            getChangedFiles
        });
        return agent;
    }

    function createRequest(): MutableChatRequestModel {
        return new MutableChatModel(ChatAgentLocation.Panel).addRequest(createParsedRequest('Hello'));
    }

    function textsOf(messages: LanguageModelMessage[]): string[] {
        return messages.flatMap(message => message.type === 'text' ? [message.text] : []);
    }

    it('appends a trailing user message listing the changed files', async () => {
        const agent = createAgent(async () => ['/workspace/a.ts', '/workspace/b.ts']);
        const messages: LanguageModelMessage[] = [];

        await agent.exposeAppendExternalFileChangeNotice(createRequest(), messages);

        expect(messages).to.have.lengthOf(1);
        expect(messages[0].actor).to.equal('user');
        expect(textsOf(messages)[0]).to.contain('/workspace/a.ts').and.to.contain('/workspace/b.ts');
    });

    it('appends nothing when no file changed', async () => {
        const agent = createAgent(async () => []);
        const messages: LanguageModelMessage[] = [];

        await agent.exposeAppendExternalFileChangeNotice(createRequest(), messages);

        expect(messages).to.be.empty;
    });

    it('appends nothing when no tracker is bound', async () => {
        const messages: LanguageModelMessage[] = [];

        await new TestChatAgent().exposeAppendExternalFileChangeNotice(createRequest(), messages);

        expect(messages).to.be.empty;
    });

    it('does not fail the request when the changed files cannot be determined', async () => {
        const agent = createAgent(async () => { throw new Error('tracker unavailable'); });
        const messages: LanguageModelMessage[] = [];

        await agent.exposeAppendExternalFileChangeNotice(createRequest(), messages);

        expect(messages).to.be.empty;
    });
});

describe('AbstractChatAgent.appendGenericCapabilities', () => {
    it('merges the resolved capability fragments\' variables into the returned description', async () => {
        const agent = new TestChatAgent();
        const editors: ResolvedAIVariable = { variable: { id: 'openEditors', name: 'openEditors', description: '', isVolatile: true }, value: '"a.ts"' };
        agent.setPromptService({
            getResolvedPromptFragment: async (id: string) => id === GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID
                ? { id, text: 'functions text', variables: [editors] }
                : undefined
        } as unknown as PromptService);
        const systemMessage: SystemMessageDescription = { text: 'base', variables: [] };
        const context: CapabilityAwareContext = { genericCapabilitySelections: { functions: ['foo'] } };

        const result = await agent.exposeAppendGenericCapabilities(systemMessage, context);

        expect(result.text).to.equal('base\n\nfunctions text');
        expect(result.variables).to.deep.equal([editors]);
    });

    it('returns the description unchanged when there are no selections', async () => {
        const agent = new TestChatAgent();
        const systemMessage: SystemMessageDescription = { text: 'base', variables: [] };

        const result = await agent.exposeAppendGenericCapabilities(systemMessage, {});

        expect(result).to.equal(systemMessage);
    });
});

describe('AbstractChatAgent volatile system prompt warning', () => {
    const editors: ResolvedAIVariable = { variable: { id: 'openEditors', name: 'openEditors', description: '', isVolatile: true }, value: '"a.ts"' };
    const stable: ResolvedAIVariable = { variable: { id: 'productName', name: 'productName', description: '' }, value: 'Theia' };

    it('warns once per agent and prompt variant, naming the variables', () => {
        const agent = new TestChatAgent();
        const logger = agent.useRecordingLogger();
        const description: SystemMessageDescription = { text: '...', promptVariantId: 'coder-system-agent-mode', variables: [stable, editors] };

        agent.exposeWarnAboutVolatileSystemPromptVariables(description);
        agent.exposeWarnAboutVolatileSystemPromptVariables(description);

        expect(logger.warnings).to.have.lengthOf(1);
        expect(logger.warnings[0]).to.contain('test-agent').and.to.contain('coder-system-agent-mode').and.to.contain('openEditors').and.to.contain('turnPromptId');
    });

    it('warns again for a different prompt variant', () => {
        const agent = new TestChatAgent();
        const logger = agent.useRecordingLogger();

        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', promptVariantId: 'variant-a', variables: [editors] });
        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', promptVariantId: 'variant-b', variables: [editors] });

        expect(logger.warnings).to.have.lengthOf(2);
    });

    it('falls back to systemPromptId when there is no prompt variant, and warns again for a different systemPromptId', () => {
        const agent = new TestChatAgent();
        const logger = agent.useRecordingLogger();
        agent.setSystemPromptId('coder-system');

        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', variables: [editors] });
        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', variables: [editors] });

        expect(logger.warnings).to.have.lengthOf(1);
        expect(logger.warnings[0]).to.contain('test-agent').and.to.contain('coder-system').and.to.contain('openEditors');

        agent.setSystemPromptId('other-system');
        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', variables: [editors] });

        expect(logger.warnings).to.have.lengthOf(2);
        expect(logger.warnings[1]).to.contain('other-system');
    });

    it('stays silent without volatile variables', () => {
        const agent = new TestChatAgent();
        const logger = agent.useRecordingLogger();

        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', promptVariantId: 'variant-a', variables: [stable] });
        agent.exposeWarnAboutVolatileSystemPromptVariables({ text: '', promptVariantId: 'variant-a' });

        expect(logger.warnings).to.be.empty;
    });

    it('fromResolvedPromptFragment carries the resolved variables', () => {
        const description = SystemMessageDescription.fromResolvedPromptFragment({ id: 'x', text: 'y', variables: [editors] }, 'x', false);
        expect(description.variables).to.deep.equal([editors]);
    });
});
