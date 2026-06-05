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
import { LanguageModelMessage, LanguageModelRequirement } from '@theia/ai-core';
import { AbstractChatAgent, ChatAgentLocation } from './chat-agents';
import {
    MutableChatModel,
    MutableChatRequestModel,
    ChatModel,
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
}

function createParsedRequest(text: string): ParsedChatRequest {
    return {
        request: { text },
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
