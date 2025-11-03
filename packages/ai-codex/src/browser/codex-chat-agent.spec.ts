// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { ChatAgentLocation, MarkdownChatResponseContentImpl, ThinkingChatResponseContentImpl, ErrorChatResponseContentImpl, MutableChatRequestModel } from '@theia/ai-chat';
import { CodexFrontendService } from './codex-frontend-service';
import { CodexChatAgent, CODEX_CHAT_AGENT_ID, CODEX_TOOL_CALLS_KEY, CODEX_INPUT_TOKENS_KEY, CODEX_OUTPUT_TOKENS_KEY } from './codex-chat-agent';

import type {
    CommandExecutionItem,
    FileChangeItem,
    McpToolCallItem,
    WebSearchItem,
    TodoListItem,
    AgentMessageItem,
    ItemCompletedEvent,
    TurnCompletedEvent,
    ThreadEvent
} from '@openai/codex-sdk';

disableJSDOM();

/**
 * Helper interface to access protected methods for testing purposes.
 * This avoids using 'as any' casts when testing protected methods.
 */
interface CodexChatAgentTestAccess {
    getToolCalls(request: MutableChatRequestModel): Map<string, unknown>;
    isToolInvocation(item: unknown): boolean;
    extractToolArguments(item: CommandExecutionItem | FileChangeItem | McpToolCallItem | WebSearchItem | TodoListItem): string;
    extractSandboxMode(modeId?: string): 'read-only' | 'workspace-write' | 'danger-full-access';
    updateTokens(request: MutableChatRequestModel, inputTokens: number, outputTokens: number): void;
    getSessionTotalTokens(request: MutableChatRequestModel): { inputTokens: number; outputTokens: number };
}

describe('CodexChatAgent', () => {
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

        const mockTokenUsageService = {
            recordTokenUsage: sinon.stub().resolves(),
            getTokenUsages: sinon.stub().resolves([]),
            setClient: sinon.stub()
        };

        const mockFileService = {
            exists: sinon.stub().resolves(true),
            read: sinon.stub().resolves({ value: { toString: () => 'content' } })
        } as unknown as FileService;

        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///test') }])
        } as unknown as WorkspaceService;

        const mockFileChangeFactory = sinon.stub();

        container.bind(CodexFrontendService).toConstantValue(mockCodexService);
        container.bind(TokenUsageService).toConstantValue(mockTokenUsageService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(ChangeSetFileElementFactory).toConstantValue(mockFileChangeFactory);
        container.bind(CodexChatAgent).toSelf();

        const addContentStub = sinon.stub();
        const responseContentChangedStub = sinon.stub();
        const completeStub = sinon.stub();
        const errorStub = sinon.stub();
        const getRequestsStub = sinon.stub().returns([]);
        const setSuggestionsStub = sinon.stub();
        const addDataStub = sinon.stub();
        const getDataByKeyStub = sinon.stub();

        mockRequest = {
            id: 'test-request-id',
            request: { text: 'test prompt' },
            session: {
                id: 'test-session-id',
                getRequests: getRequestsStub,
                setSuggestions: setSuggestionsStub
            },
            response: {
                response: {
                    addContent: addContentStub,
                    responseContentChanged: responseContentChangedStub
                },
                complete: completeStub,
                error: errorStub,
                cancellationToken: { isCancellationRequested: false }
            },
            addData: addDataStub,
            getDataByKey: getDataByKeyStub
        } as unknown as MutableChatRequestModel;
    });

    afterEach(() => {
        sinon.restore();
    });

    after(() => {
        disableJSDOM();
    });

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

    function createReasoningEvent(text: string, id: string = 'reason-1'): ItemCompletedEvent {
        return {
            type: 'item.completed',
            item: {
                type: 'reasoning',
                id,
                text
            }
        };
    }

    function createCommandExecutionCompletedEvent(command: string, exitCode: number, output: string, id: string = 'cmd-1'): ItemCompletedEvent {
        return {
            type: 'item.completed',
            item: {
                type: 'command_execution',
                id,
                command,
                status: 'completed' as const,
                exit_code: exitCode,
                aggregated_output: output
            } as unknown as CommandExecutionItem
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

    async function* createMockStream(events: ThreadEvent[]): AsyncIterable<ThreadEvent> {
        for (const event of events) {
            yield event;
        }
    }

    describe('agent metadata', () => {
        it('should have correct id', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            expect(agent.id).to.equal(CODEX_CHAT_AGENT_ID);
        });

        it('should have correct name', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            expect(agent.name).to.equal('Codex');
        });

        it('should have correct description', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            expect(agent.description).to.include('OpenAI');
            expect(agent.description).to.include('Codex');
        });

        it('should support all chat locations', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            expect(agent.locations).to.deep.equal(ChatAgentLocation.ALL);
        });

        it('should have three modes', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            expect(agent.modes).to.have.lengthOf(3);
            expect(agent.modes![0].id).to.equal('workspace-write');
            expect(agent.modes![1].id).to.equal('read-only');
            expect(agent.modes![2].id).to.equal('danger-full-access');
        });
    });

    describe('invoke() integration tests', () => {
        it('should process agent_message events through invoke', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const events = [
                createAgentMessageEvent('Hello, I can help you with that.'),
                createTurnCompletedEvent(50, 25)
            ];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(mockRequest);

            const addContentStub = (mockRequest.response.response.addContent as sinon.SinonStub);
            const completeStub = (mockRequest.response.complete as sinon.SinonStub);
            expect(addContentStub.calledOnce).to.be.true;
            const addedContent = addContentStub.firstCall.args[0];
            expect(addedContent).to.be.instanceOf(MarkdownChatResponseContentImpl);
            expect(addedContent.content.value).to.equal('Hello, I can help you with that.');
            expect(completeStub.calledOnce).to.be.true;
        });

        it('should process reasoning events through invoke', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const events = [
                createReasoningEvent('Let me think about the best approach...'),
                createTurnCompletedEvent(30, 15)
            ];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(mockRequest);

            const addContentStub = (mockRequest.response.response.addContent as sinon.SinonStub);
            const completeStub = (mockRequest.response.complete as sinon.SinonStub);
            expect(addContentStub.calledOnce).to.be.true;
            const addedContent = addContentStub.firstCall.args[0];
            expect(addedContent).to.be.instanceOf(ThinkingChatResponseContentImpl);
            expect(addedContent.content).to.equal('Let me think about the best approach...');
            expect(completeStub.calledOnce).to.be.true;
        });

        it('should process command_execution tool calls through invoke', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_TOOL_CALLS_KEY).returns(undefined);

            const events = [
                {
                    type: 'item.started' as const,
                    item: {
                        type: 'command_execution' as const,
                        id: 'cmd-1',
                        command: 'npm test',
                        status: 'running' as const,
                        aggregated_output: ''
                    } as unknown as CommandExecutionItem
                },
                createCommandExecutionCompletedEvent('npm test', 0, 'All tests passed'),
                createTurnCompletedEvent(100, 50)
            ];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(mockRequest);

            // Should add tool call twice: once on start (pending), once on completion
            const addContentStub = (mockRequest.response.response.addContent as sinon.SinonStub);
            const completeStub = (mockRequest.response.complete as sinon.SinonStub);
            expect(addContentStub.callCount).to.equal(2);
            expect(completeStub.calledOnce).to.be.true;
        });

        it('should process turn.completed events through invoke', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const events = [
                createAgentMessageEvent('Done!'),
                createTurnCompletedEvent(150, 75)
            ];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));
            (mockRequest.session.getRequests as sinon.SinonStub).returns([mockRequest]);
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_INPUT_TOKENS_KEY).returns(0);
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_OUTPUT_TOKENS_KEY).returns(0);

            await agent.invoke(mockRequest);

            const addDataStub = (mockRequest.addData as sinon.SinonStub);
            const completeStub = (mockRequest.response.complete as sinon.SinonStub);
            expect(addDataStub.calledWith(CODEX_INPUT_TOKENS_KEY, 150)).to.be.true;
            expect(addDataStub.calledWith(CODEX_OUTPUT_TOKENS_KEY, 75)).to.be.true;
            expect(completeStub.calledOnce).to.be.true;
        });

        it('should handle errors from codexService.send', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const testError = new Error('Network failure');
            (mockCodexService.send as sinon.SinonStub).rejects(testError);

            await agent.invoke(mockRequest);

            const addContentStub = (mockRequest.response.response.addContent as sinon.SinonStub);
            const errorStub = (mockRequest.response.error as sinon.SinonStub);
            expect(addContentStub.calledOnce).to.be.true;
            const addedContent = addContentStub.firstCall.args[0];
            expect(addedContent).to.be.instanceOf(ErrorChatResponseContentImpl);
            expect(errorStub.calledWith(testError)).to.be.true;
        });

        it('should call response.complete() on successful completion', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const events = [
                createAgentMessageEvent('Success'),
                createTurnCompletedEvent(10, 5)
            ];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(mockRequest);

            const completeStub = (mockRequest.response.complete as sinon.SinonStub);
            const errorStub = (mockRequest.response.error as sinon.SinonStub);
            expect(completeStub.calledOnce).to.be.true;
            expect(errorStub.called).to.be.false;
        });

        it('should call response.error() on failure', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const error = new Error('Test error');
            (mockCodexService.send as sinon.SinonStub).rejects(error);

            await agent.invoke(mockRequest);

            const errorStub = (mockRequest.response.error as sinon.SinonStub);
            expect(errorStub.calledWith(error)).to.be.true;
        });

        it('should extract prompt and session ID correctly', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const customRequest = {
                ...mockRequest,
                request: { text: '@Codex write a test' },
                session: {
                    id: 'session-123',
                    getRequests: mockRequest.session.getRequests,
                    setSuggestions: mockRequest.session.setSuggestions
                }
            } as unknown as MutableChatRequestModel;
            const events = [createTurnCompletedEvent(10, 5)];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(customRequest);

            expect((mockCodexService.send as sinon.SinonStub).calledOnce).to.be.true;
            const callArgs = (mockCodexService.send as sinon.SinonStub).firstCall.args[0];
            expect(callArgs.prompt).to.equal('write a test');
            expect(callArgs.sessionId).to.equal('session-123');
        });

        it('should pass sandboxMode from modeId to codexService.send', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const customRequest = {
                ...mockRequest,
                request: { text: 'test prompt', modeId: 'read-only' },
                session: mockRequest.session
            } as unknown as MutableChatRequestModel;
            const events = [createTurnCompletedEvent(10, 5)];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(customRequest);

            expect((mockCodexService.send as sinon.SinonStub).calledOnce).to.be.true;
            const callArgs = (mockCodexService.send as sinon.SinonStub).firstCall.args[0];
            expect(callArgs.sandboxMode).to.equal('read-only');
        });

        it('should default sandboxMode to workspace-write when modeId is undefined', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const customRequest = {
                ...mockRequest,
                request: { text: 'test prompt' },
                session: mockRequest.session
            } as unknown as MutableChatRequestModel;
            const events = [createTurnCompletedEvent(10, 5)];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(customRequest);

            expect((mockCodexService.send as sinon.SinonStub).calledOnce).to.be.true;
            const callArgs = (mockCodexService.send as sinon.SinonStub).firstCall.args[0];
            expect(callArgs.sandboxMode).to.equal('workspace-write');
        });

        it('should default sandboxMode to workspace-write when modeId is invalid', async () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const mockCodexService = container.get<CodexFrontendService>(CodexFrontendService);

            const customRequest = {
                ...mockRequest,
                request: { text: 'test prompt', modeId: 'invalid-mode' },
                session: mockRequest.session
            } as unknown as MutableChatRequestModel;
            const events = [createTurnCompletedEvent(10, 5)];
            (mockCodexService.send as sinon.SinonStub).resolves(createMockStream(events));

            await agent.invoke(customRequest);

            expect((mockCodexService.send as sinon.SinonStub).calledOnce).to.be.true;
            const callArgs = (mockCodexService.send as sinon.SinonStub).firstCall.args[0];
            expect(callArgs.sandboxMode).to.equal('workspace-write');
        });
    });

    describe('protected methods', () => {
        it('getToolCalls should create new map if not exists', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_TOOL_CALLS_KEY).returns(undefined);

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.getToolCalls(mockRequest);

            expect(result).to.be.instanceOf(Map);
            expect(result.size).to.equal(0);
            expect((mockRequest.addData as sinon.SinonStub).calledWith(CODEX_TOOL_CALLS_KEY, result)).to.be.true;
        });

        it('getToolCalls should return existing map', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const existingMap = new Map<string, unknown>();
            existingMap.set('test-id', {});
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_TOOL_CALLS_KEY).returns(existingMap);

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.getToolCalls(mockRequest);

            expect(result).to.equal(existingMap);
            expect(result.size).to.equal(1);
            expect((mockRequest.addData as sinon.SinonStub).called).to.be.false;
        });

        it('isToolInvocation should return true for command_execution item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item = {
                type: 'command_execution',
                id: 'cmd-1',
                command: 'npm test',
                status: 'running',
                aggregated_output: ''
            } as unknown as CommandExecutionItem;

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.true;
        });

        it('isToolInvocation should return true for file_change item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item = {
                type: 'file_change',
                id: 'file-1',
                changes: [],
                status: 'running'
            } as unknown as FileChangeItem;

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.true;
        });

        it('isToolInvocation should return true for mcp_tool_call item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item = {
                type: 'mcp_tool_call',
                id: 'mcp-1',
                server: 'test-server',
                tool: 'test-tool',
                status: 'running'
            } as unknown as McpToolCallItem;

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.true;
        });

        it('isToolInvocation should return true for web_search item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item: WebSearchItem = {
                type: 'web_search',
                id: 'search-1',
                query: 'test query'
            };

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.true;
        });

        it('isToolInvocation should return true for todo_list item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item: TodoListItem = {
                type: 'todo_list',
                id: 'todo-1',
                items: []
            };

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.true;
        });

        it('isToolInvocation should return false for agent_message item', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item: AgentMessageItem = {
                type: 'agent_message',
                id: 'msg-1',
                text: 'Hello'
            };

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.isToolInvocation(item)).to.be.false;
        });

        it('extractToolArguments should extract command_execution arguments', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item: CommandExecutionItem = {
                type: 'command_execution',
                id: 'cmd-1',
                command: 'npm test',
                status: 'completed',
                exit_code: 0,
                aggregated_output: 'test output'
            };

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.extractToolArguments(item);
            const parsed = JSON.parse(result);

            expect(parsed.command).to.equal('npm test');
            expect(parsed.status).to.equal('completed');
            expect(parsed.exit_code).to.equal(0);
        });

        it('extractToolArguments should extract file_change arguments', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const item: FileChangeItem = {
                type: 'file_change',
                id: 'file-1',
                changes: [{ path: '/test/file.ts', kind: 'add' }],
                status: 'completed'
            };

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.extractToolArguments(item);
            const parsed = JSON.parse(result);

            expect(parsed.changes).to.deep.equal([{ path: '/test/file.ts', kind: 'add' }]);
            expect(parsed.status).to.equal('completed');
        });

        it('updateTokens should store token data and update session suggestion', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            (mockRequest.session.getRequests as sinon.SinonStub).returns([mockRequest]);
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_INPUT_TOKENS_KEY).returns(100);
            (mockRequest.getDataByKey as sinon.SinonStub).withArgs(CODEX_OUTPUT_TOKENS_KEY).returns(50);

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            testAccess.updateTokens(mockRequest, 100, 50);

            expect((mockRequest.addData as sinon.SinonStub).calledWith(CODEX_INPUT_TOKENS_KEY, 100)).to.be.true;
            expect((mockRequest.addData as sinon.SinonStub).calledWith(CODEX_OUTPUT_TOKENS_KEY, 50)).to.be.true;
            expect((mockRequest.session.setSuggestions as sinon.SinonStub).called).to.be.true;
        });

        it('getSessionTotalTokens should sum tokens across multiple requests', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const request1 = {
                getDataByKey: sinon.stub()
            };
            (request1.getDataByKey as sinon.SinonStub).withArgs(CODEX_INPUT_TOKENS_KEY).returns(100);
            (request1.getDataByKey as sinon.SinonStub).withArgs(CODEX_OUTPUT_TOKENS_KEY).returns(50);

            const request2 = {
                getDataByKey: sinon.stub()
            };
            (request2.getDataByKey as sinon.SinonStub).withArgs(CODEX_INPUT_TOKENS_KEY).returns(200);
            (request2.getDataByKey as sinon.SinonStub).withArgs(CODEX_OUTPUT_TOKENS_KEY).returns(75);

            (mockRequest.session.getRequests as sinon.SinonStub).returns([request1, request2]);

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.getSessionTotalTokens(mockRequest);

            expect(result.inputTokens).to.equal(300);
            expect(result.outputTokens).to.equal(125);
        });

        it('getSessionTotalTokens should handle requests with no token data', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const request1 = {
                getDataByKey: sinon.stub().returns(undefined)
            };

            (mockRequest.session.getRequests as sinon.SinonStub).returns([request1]);

            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            const result = testAccess.getSessionTotalTokens(mockRequest);

            expect(result.inputTokens).to.equal(0);
            expect(result.outputTokens).to.equal(0);
        });

        it('extractSandboxMode should return read-only for read-only modeId', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.extractSandboxMode('read-only')).to.equal('read-only');
        });

        it('extractSandboxMode should return workspace-write for workspace-write modeId', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.extractSandboxMode('workspace-write')).to.equal('workspace-write');
        });

        it('extractSandboxMode should return danger-full-access for danger-full-access modeId', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.extractSandboxMode('danger-full-access')).to.equal('danger-full-access');
        });

        it('extractSandboxMode should default to workspace-write for undefined modeId', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.extractSandboxMode(undefined)).to.equal('workspace-write');
        });

        it('extractSandboxMode should default to workspace-write for invalid modeId', () => {
            const agent = container.get<CodexChatAgent>(CodexChatAgent);
            const testAccess = agent as unknown as CodexChatAgentTestAccess;
            expect(testAccess.extractSandboxMode('invalid-mode')).to.equal('workspace-write');
        });
    });
});
