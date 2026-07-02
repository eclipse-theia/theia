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
    LanguageModel, LanguageModelMessage, LanguageModelRequirement, LanguageModelResponse,
    LanguageModelService, LanguageModelStreamResponsePart, ServerToolDescriptor, UserRequest
} from '@theia/ai-core';
import { AbstractChatAgent, AbstractStreamParsingChatAgent, ChatAgentLocation } from './chat-agents';
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

class TestChatAgent extends AbstractChatAgent {
    readonly id = 'test-agent';
    readonly name = 'Test Agent';
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    protected readonly defaultLanguageModelPurpose = 'chat';

    protected addContentsToResponse(): Promise<void> {
        return Promise.resolve();
    }

    public async exposeGetMessages(model: ChatModel, includeResponseInProgress = false): Promise<LanguageModelMessage[]> {
        return this.getMessages(model, includeResponseInProgress);
    }

    public exposeSendLlmRequest(request: MutableChatRequestModel, languageModel: LanguageModel): Promise<LanguageModelResponse> {
        return this.sendLlmRequest(request, [], [], undefined, languageModel);
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
