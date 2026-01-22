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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { Emitter, ILogger } from '@theia/core';
import { ToolCall, ToolCallResult, UsageResponsePart } from '@theia/ai-core';
import { ChatSessionSummarizationServiceImpl } from './chat-session-summarization-service';
import { ChatSessionTokenTracker } from './chat-session-token-tracker';
import { ChatService, SessionCreatedEvent, SessionDeletedEvent } from '../common/chat-service';
import { ChatSession } from '../common';
import { ChatSessionStore } from '../common/chat-session-store';

describe('ChatSessionSummarizationServiceImpl', () => {
    let container: Container;
    let service: ChatSessionSummarizationServiceImpl;
    let tokenTracker: sinon.SinonStubbedInstance<ChatSessionTokenTracker>;
    let chatService: sinon.SinonStubbedInstance<ChatService>;
    let logger: sinon.SinonStubbedInstance<ILogger>;

    let sessionEventEmitter: Emitter<SessionCreatedEvent | SessionDeletedEvent>;
    let sessionRegistry: Map<string, ChatSession>;
    let sessionStore: sinon.SinonStubbedInstance<ChatSessionStore>;

    // Helper to create a mock UsageResponsePart
    function createUsageResponsePart(params: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
    }): UsageResponsePart {
        return {
            input_tokens: params.input_tokens,
            output_tokens: params.output_tokens,
            cache_creation_input_tokens: params.cache_creation_input_tokens,
            cache_read_input_tokens: params.cache_read_input_tokens
        };
    }

    // Helper to create a mock session
    function createMockSession(sessionId: string, activeBranchId: string, branches: { id: string }[] = []): ChatSession {
        const modelChangeEmitter = new Emitter<unknown>();
        const allBranches = branches.length > 0 ? branches : [{ id: activeBranchId }];
        return {
            id: sessionId,
            isActive: true,
            model: {
                getBranch: sinon.stub().callsFake((requestId: string) => {
                    // Return branch based on requestId pattern: 'request-for-branchX' => { id: 'branchX' }
                    const match = requestId.match(/request-for-(.+)/);
                    if (match) {
                        return { id: match[1] };
                    }
                    return undefined;
                }),
                getBranches: sinon.stub().returns(allBranches),
                getRequest: sinon.stub().callsFake((requestId: string) => {
                    if (requestId.includes('summary')) {
                        return { request: { kind: 'summary' } };
                    }
                    return { request: { kind: 'user' } };
                }),
                onDidChange: modelChangeEmitter.event
            }
        } as unknown as ChatSession;
    }

    beforeEach(() => {
        container = new Container();

        // Create emitter for session event simulation
        sessionEventEmitter = new Emitter<SessionCreatedEvent | SessionDeletedEvent>();

        // Create session registry for dynamic lookup
        sessionRegistry = new Map<string, ChatSession>();

        // Create stubs
        const branchTokensMap = new Map<string, number>();
        tokenTracker = {
            resetSessionTokens: sinon.stub(),
            getSessionInputTokens: sinon.stub(),
            getSessionOutputTokens: sinon.stub(),
            getSessionTotalTokens: sinon.stub(),
            updateSessionTokens: sinon.stub(),
            onSessionTokensUpdated: sinon.stub(),
            setBranchTokens: sinon.stub().callsFake((sessionId: string, branchId: string, tokens: number) => {
                branchTokensMap.set(`${sessionId}:${branchId}`, tokens);
            }),
            getBranchTokens: sinon.stub().callsFake((sessionId: string, branchId: string) => branchTokensMap.get(`${sessionId}:${branchId}`)),
            getBranchTokensForSession: sinon.stub().callsFake((sessionId: string) => {
                const result: { [branchId: string]: number } = {};
                const prefix = `${sessionId}:`;
                for (const [key, value] of branchTokensMap.entries()) {
                    if (key.startsWith(prefix)) {
                        const branchId = key.substring(prefix.length);
                        result[branchId] = value;
                    }
                }
                return result;
            }),
            restoreBranchTokens: sinon.stub().callsFake((sessionId: string, branchTokens: { [branchId: string]: number }) => {
                for (const [branchId, tokens] of Object.entries(branchTokens)) {
                    branchTokensMap.set(`${sessionId}:${branchId}`, tokens);
                }
            }),
            clearSessionBranchTokens: sinon.stub().callsFake((sessionId: string) => {
                const prefix = `${sessionId}:`;
                for (const key of branchTokensMap.keys()) {
                    if (key.startsWith(prefix)) {
                        branchTokensMap.delete(key);
                    }
                }
            })
        } as unknown as sinon.SinonStubbedInstance<ChatSessionTokenTracker>;

        chatService = {
            getSession: sinon.stub().callsFake((sessionId: string) => sessionRegistry.get(sessionId)),
            getSessions: sinon.stub().returns([]),
            onSessionEvent: sessionEventEmitter.event,
            sendRequest: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<ChatService>;

        logger = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
            debug: sinon.stub()
        } as unknown as sinon.SinonStubbedInstance<ILogger>;

        sessionStore = {
            storeSessions: sinon.stub().resolves(),
            readSession: sinon.stub().resolves(undefined),
            deleteSession: sinon.stub().resolves(),
            clearAllSessions: sinon.stub().resolves(),
            getSessionIndex: sinon.stub().resolves({})
        } as unknown as sinon.SinonStubbedInstance<ChatSessionStore>;

        // Bind to container
        container.bind(ChatSessionTokenTracker).toConstantValue(tokenTracker);
        container.bind(ChatService).toConstantValue(chatService);
        container.bind(ILogger).toConstantValue(logger);
        container.bind(ChatSessionStore).toConstantValue(sessionStore);
        container.bind(ChatSessionSummarizationServiceImpl).toSelf().inSingletonScope();

        service = container.get(ChatSessionSummarizationServiceImpl);
        // Manually call init since @postConstruct won't run in tests
        (service as unknown as { init: () => void }).init();
    });

    afterEach(() => {
        sinon.restore();
        sessionEventEmitter.dispose();
        sessionRegistry.clear();
    });

    describe('markPendingSplit', () => {
        it('should store pending split data', async () => {
            const sessionId = 'session-1';
            const requestId = 'request-1';
            const pendingToolCalls: ToolCall[] = [
                { id: 'tool-1', function: { name: 'test_tool', arguments: '{}' }, finished: false }
            ];
            const toolResults = new Map<string, ToolCallResult>([['tool-1', 'result']]);

            // Create mock session for handleMidTurnSplit
            const session = createMockSession(sessionId, 'branch-1');
            sessionRegistry.set(sessionId, session);
            const modelStub = session.model as sinon.SinonStubbedInstance<typeof session.model>;
            (modelStub as unknown as { addRequest: sinon.SinonStub }).addRequest = sinon.stub().returns({
                id: 'new-request',
                response: {
                    response: {
                        content: [],
                        clearContent: sinon.stub(),
                        addContent: sinon.stub(),
                        addContents: sinon.stub(),
                        asDisplayString: sinon.stub().returns('Summary text')
                    }
                }
            });
            (modelStub as unknown as { getRequests: sinon.SinonStub }).getRequests = sinon.stub().returns([]);

            service.markPendingSplit(sessionId, requestId, pendingToolCalls, toolResults);

            // Verify pending split is stored by calling checkAndHandleSummarization
            // which consumes the pending split and returns true
            const mockAgent = { invoke: sinon.stub().resolves() };
            const mockResponse = {
                isComplete: false,
                complete: sinon.stub(),
                response: {
                    content: [],
                    clearContent: sinon.stub(),
                    addContent: sinon.stub(),
                    addContents: sinon.stub()
                }
            };
            const mockRequest = {
                id: requestId,
                request: { kind: 'user' },
                response: mockResponse
            };
            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                undefined
            );

            // Should return true because pending split was consumed
            expect(result).to.be.true;
        });
    });

    describe('checkAndHandleSummarization', () => {
        it('should return false when request kind is summary', async () => {
            const sessionId = 'session-1';
            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'summary' },
                response: { isComplete: false }
            };
            const usage = createUsageResponsePart({ input_tokens: 100, output_tokens: 50 });

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            expect(result).to.be.false;
        });

        it('should return false when request kind is continuation and below threshold', async () => {
            const sessionId = 'session-1';
            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'continuation' },
                response: { isComplete: false }
            };
            const usage = createUsageResponsePart({ input_tokens: 100, output_tokens: 50 }); // Below threshold

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            expect(result).to.be.false;
            // Verify token tracker was still updated for continuation requests
            expect(tokenTracker.updateSessionTokens.calledWith(sessionId, 100, 50)).to.be.true;
        });

        it('should not skip continuation request when it exceeds threshold', async () => {
            const sessionId = 'session-1';
            const session = createMockSession(sessionId, 'branch-1');
            sessionRegistry.set(sessionId, session);

            const mockAgent = { invoke: sinon.stub() };
            const completeStub = sinon.stub();
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'continuation' },
                response: {
                    isComplete: false,
                    complete: completeStub
                }
            };
            // 7000 tokens > CHAT_TOKEN_THRESHOLD (6300)
            const usage = createUsageResponsePart({ input_tokens: 7000, output_tokens: 500 });

            // Mock model.insertSummary for performSummarization
            const modelStub = session.model as sinon.SinonStubbedInstance<typeof session.model>;
            (modelStub as unknown as { insertSummary: sinon.SinonStub }).insertSummary = sinon.stub().resolves('Summary text');

            // Call the method - it may or may not fully complete summarization
            // depending on mocks, but the key behavior is that it doesn't skip
            // the threshold check for continuation requests when above threshold
            await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            // Verify token tracker was updated with high token values
            // This confirms the method processed the usage data and didn't skip early
            expect(tokenTracker.updateSessionTokens.calledWith(sessionId, 7000, 500)).to.be.true;
        });

        it('should return false when tokens are below threshold', async () => {
            const sessionId = 'session-1';

            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'user' },
                response: { isComplete: false }
            };
            const usage = createUsageResponsePart({ input_tokens: 100, output_tokens: 50 }); // Below threshold

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            expect(result).to.be.false;
        });

        it('should update token tracker with usage data', async () => {
            const sessionId = 'session-1';
            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'user' },
                response: { isComplete: false }
            };
            const usage = createUsageResponsePart({
                input_tokens: 1000,
                output_tokens: 200,
                cache_creation_input_tokens: 100,
                cache_read_input_tokens: 50
            });

            await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            // Total input = input_tokens + cache_creation + cache_read = 1000 + 100 + 50 = 1150
            expect(tokenTracker.updateSessionTokens.calledWith(sessionId, 1150, 200)).to.be.true;
        });

        it('should consume pending split and handle mid-turn split', async () => {
            const sessionId = 'session-1';
            const requestId = 'request-1';
            const pendingToolCalls: ToolCall[] = [
                { id: 'tool-1', function: { name: 'test_tool', arguments: '{}' }, finished: false }
            ];
            const toolResults = new Map<string, ToolCallResult>([['tool-1', 'result']]);

            // Create mock session
            const session = createMockSession(sessionId, 'branch-1');
            sessionRegistry.set(sessionId, session);

            // Mark pending split
            service.markPendingSplit(sessionId, requestId, pendingToolCalls, toolResults);

            const mockAgent = { invoke: sinon.stub().resolves() };
            const mockResponse = {
                isComplete: false,
                complete: sinon.stub(),
                response: {
                    content: [],
                    clearContent: sinon.stub(),
                    addContent: sinon.stub(),
                    addContents: sinon.stub()
                }
            };
            const mockRequest = {
                id: requestId,
                request: { kind: 'user' },
                response: mockResponse
            };
            const usage = createUsageResponsePart({ input_tokens: 100, output_tokens: 50 });

            // Mock model methods needed for handleMidTurnSplit
            const modelStub = session.model as sinon.SinonStubbedInstance<typeof session.model>;
            (modelStub as unknown as { addRequest: sinon.SinonStub }).addRequest = sinon.stub().returns({
                id: 'new-request',
                response: {
                    response: {
                        content: [],
                        clearContent: sinon.stub(),
                        addContent: sinon.stub(),
                        addContents: sinon.stub(),
                        asDisplayString: sinon.stub().returns('Summary text')
                    }
                }
            });
            (modelStub as unknown as { getRequests: sinon.SinonStub }).getRequests = sinon.stub().returns([]);

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel,
                usage
            );

            // Should return true because pending split was handled
            expect(result).to.be.true;
            // Response should be completed
            expect(mockResponse.complete.called).to.be.true;
        });
    });

    describe('branch change handling', () => {
        it('should restore stored tokens when branch changes', () => {
            const sessionId = 'session-4';
            const branchA = 'branch-A';
            const branchB = 'branch-B';

            // Pre-populate branch tokens via tracker
            tokenTracker.setBranchTokens(sessionId, branchA, 2000);
            tokenTracker.setBranchTokens(sessionId, branchB, 4000);

            // Create session and fire created event to set up branch change listener
            const modelChangeEmitter = new Emitter<unknown>();
            const session = {
                id: sessionId,
                isActive: true,
                model: {
                    getBranch: sinon.stub(),
                    getBranches: sinon.stub().returns([{ id: branchB }]),
                    getRequest: sinon.stub(),
                    onDidChange: modelChangeEmitter.event
                }
            } as unknown as ChatSession;

            sessionRegistry.set(sessionId, session);

            // Fire session created event to set up listener
            sessionEventEmitter.fire({ type: 'created', sessionId });

            // Simulate branch change to branch A
            modelChangeEmitter.fire({
                kind: 'changeHierarchyBranch',
                branch: { id: branchA }
            });

            // Verify tokenTracker.resetSessionTokens was called with branch A's tokens
            expect(tokenTracker.resetSessionTokens.calledWith(sessionId, 2000)).to.be.true;
        });

        it('should emit undefined when switching to branch with no stored tokens', () => {
            const sessionId = 'session-5';
            const unknownBranchId = 'branch-unknown';

            // Create session without pre-populating tokens for the unknown branch
            const modelChangeEmitter = new Emitter<unknown>();
            const session = {
                id: sessionId,
                isActive: true,
                model: {
                    getBranch: sinon.stub(),
                    getBranches: sinon.stub().returns([{ id: 'branch-other' }]),
                    getRequest: sinon.stub(),
                    onDidChange: modelChangeEmitter.event
                }
            } as unknown as ChatSession;

            sessionRegistry.set(sessionId, session);

            // Fire session created event to set up listener
            sessionEventEmitter.fire({ type: 'created', sessionId });

            // Simulate branch change to unknown branch
            modelChangeEmitter.fire({
                kind: 'changeHierarchyBranch',
                branch: { id: unknownBranchId }
            });

            // Verify tokenTracker.resetSessionTokens was called with undefined
            expect(tokenTracker.resetSessionTokens.calledWith(sessionId, undefined)).to.be.true;
        });

        it('should populate branchTokens on persistence restore', () => {
            const sessionId = 'restored-session';
            const activeBranchId = 'branch-restored';

            // Create session
            const modelChangeEmitter = new Emitter<unknown>();
            const session = {
                id: sessionId,
                isActive: true,
                model: {
                    getBranch: sinon.stub(),
                    getBranches: sinon.stub().returns([{ id: activeBranchId }]),
                    getRequest: sinon.stub(),
                    onDidChange: modelChangeEmitter.event
                }
            } as unknown as ChatSession;

            sessionRegistry.set(sessionId, session);

            // Fire session created event with branchTokens data
            const branchTokensData = {
                'branch-restored': 8000,
                'branch-other': 3000
            };
            sessionEventEmitter.fire({
                type: 'created',
                sessionId,
                branchTokens: branchTokensData
            });

            // Verify restoreBranchTokens was called with correct data
            expect((tokenTracker.restoreBranchTokens as sinon.SinonStub).calledWith(sessionId, branchTokensData)).to.be.true;

            // Verify getBranchTokensForSession returns restored data
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens).to.deep.equal(branchTokensData);
        });
    });

    describe('cleanupSession', () => {
        it('should clean up all session data when session is deleted', () => {
            const sessionId = 'session-to-cleanup';

            // Pre-populate branch tokens via tracker
            tokenTracker.setBranchTokens(sessionId, 'branch-A', 1000);
            tokenTracker.setBranchTokens(sessionId, 'branch-B', 2000);
            tokenTracker.setBranchTokens('other-session', 'branch-X', 5000);

            // Add pending split
            service.markPendingSplit(sessionId, 'request-1', [], new Map());

            // Add to triggeredBranches
            const triggeredBranchesSet = (service as unknown as { triggeredBranches: Set<string> }).triggeredBranches;
            triggeredBranchesSet.add(`${sessionId}: branch-A`);
            triggeredBranchesSet.add(`${sessionId}: branch-B`);
            triggeredBranchesSet.add('other-session: branch-X');

            // Fire session deleted event
            sessionEventEmitter.fire({ type: 'deleted', sessionId });

            // Verify clearSessionBranchTokens was called
            expect((tokenTracker.clearSessionBranchTokens as sinon.SinonStub).calledWith(sessionId)).to.be.true;

            // Verify triggeredBranches entries for deleted session are removed
            expect(triggeredBranchesSet.has(`${sessionId}: branch-A`)).to.be.false;
            expect(triggeredBranchesSet.has(`${sessionId}: branch-B`)).to.be.false;

            // Verify other session's triggeredBranches entries are preserved
            expect(triggeredBranchesSet.has('other-session: branch-X')).to.be.true;
        });
    });
});
