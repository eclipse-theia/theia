// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { TokenUsageService } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { MarkdownChatResponseContentImpl, MutableChatRequestModel } from '@theia/ai-chat';
import { CodexFrontendService } from '@theia/ai-codex/lib/browser/codex-frontend-service';
import type { AgentMessageItem, ItemCompletedEvent, ItemUpdatedEvent, TurnCompletedEvent } from '@openai/codex-sdk';
import { QaapCodexChatAgent } from './qaap-codex-chat-agent';

disableJSDOM();

describe('QaapCodexChatAgent', () => {
    let container: Container;
    let mockRequest: MutableChatRequestModel;

    before(async () => {
        disableJSDOM = enableJSDOM();
    });

    beforeEach(() => {
        container = new Container();

        const mockCodexService = {
            send: sinon.stub()
        } as unknown as CodexFrontendService;

        container.bind(CodexFrontendService).toConstantValue(mockCodexService);
        container.bind(TokenUsageService).toConstantValue({
            recordTokenUsage: sinon.stub().resolves(),
            getTokenUsages: sinon.stub().resolves([]),
            setClient: sinon.stub()
        });
        container.bind(FileService).toConstantValue({
            exists: sinon.stub().resolves(true),
            read: sinon.stub().resolves({ value: { toString: () => 'content' } })
        } as unknown as FileService);
        container.bind(WorkspaceService).toConstantValue({
            roots: Promise.resolve([{ resource: new URI('file:///test') }])
        } as unknown as WorkspaceService);
        container.bind(ChangeSetFileElementFactory).toConstantValue(sinon.stub());
        container.bind(QaapCodexChatAgent).toSelf();

        mockRequest = {
            id: 'test-request-id',
            request: { text: 'test prompt' },
            session: {
                id: 'test-session-id',
                getRequests: sinon.stub().returns([]),
                setSuggestions: sinon.stub()
            },
            response: {
                response: {
                    addContent: sinon.stub(),
                    responseContentChanged: sinon.stub()
                },
                complete: sinon.stub(),
                error: sinon.stub(),
                setTokenUsage: sinon.stub(),
                cancellationToken: { isCancellationRequested: false }
            },
            addData: sinon.stub(),
            getDataByKey: sinon.stub()
        } as unknown as MutableChatRequestModel;
    });

    afterEach(() => {
        sinon.restore();
    });

    after(() => {
        disableJSDOM();
    });

    function createAgentMessageUpdatedEvent(text: string, id: string = 'msg-1'): ItemUpdatedEvent {
        return {
            type: 'item.updated',
            item: {
                type: 'agent_message',
                id,
                text
            } as AgentMessageItem
        };
    }

    function createAgentMessageEvent(text: string, id: string = 'msg-1'): ItemCompletedEvent {
        return {
            type: 'item.completed',
            item: {
                type: 'agent_message',
                id,
                text
            } as AgentMessageItem
        };
    }

    function createTurnCompletedEvent(inputTokens: number, outputTokens: number): TurnCompletedEvent {
        return {
            type: 'turn.completed',
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cached_input_tokens: 0
            }
        };
    }

    async function* createMockStream(events: unknown[]): AsyncIterable<unknown> {
        for (const event of events) {
            yield event;
        }
    }

    it('streams agent_message updates without duplicating completed content', async () => {
        const agent = container.get(QaapCodexChatAgent);
        const mockCodexService = container.get(CodexFrontendService);
        const requestData = new Map<string, unknown>();
        (mockRequest.addData as sinon.SinonStub).callsFake((key: string, value: unknown) => requestData.set(key, value));
        (mockRequest.getDataByKey as sinon.SinonStub).callsFake((key: string) => requestData.get(key));

        const events = [
            createAgentMessageUpdatedEvent('Hel'),
            createAgentMessageUpdatedEvent('Hello'),
            createAgentMessageEvent('Hello'),
            createTurnCompletedEvent(50, 25)
        ];
        (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

        await agent.invoke(mockRequest);

        const addContentStub = (mockRequest.response.response.addContent as sinon.SinonStub);
        const completeStub = (mockRequest.response.complete as sinon.SinonStub);
        expect(addContentStub.callCount).to.equal(2);
        expect(addContentStub.firstCall.args[0]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect(addContentStub.firstCall.args[0].content.value).to.equal('Hel');
        expect(addContentStub.secondCall.args[0]).to.be.instanceOf(MarkdownChatResponseContentImpl);
        expect(addContentStub.secondCall.args[0].content.value).to.equal('lo');
        expect(completeStub.calledOnce).to.be.true;
    });
});
