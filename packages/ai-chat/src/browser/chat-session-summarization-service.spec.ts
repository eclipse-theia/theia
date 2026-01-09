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
import { TokenUsage, TokenUsageServiceClient, ToolCall, ToolCallResult } from '@theia/ai-core';
import { ChatSessionSummarizationServiceImpl } from './chat-session-summarization-service';
import { ChatSessionTokenTracker, CHAT_TOKEN_THRESHOLD } from './chat-session-token-tracker';
import { ChatService, SessionCreatedEvent, SessionDeletedEvent } from '../common/chat-service';
import { ChatSession } from '../common';
import { ChatSessionStore } from '../common/chat-session-store';

describe('ChatSessionSummarizationServiceImpl', () => {
    let container: Container;
    let service: ChatSessionSummarizationServiceImpl;
    let tokenTracker: sinon.SinonStubbedInstance<ChatSessionTokenTracker>;
    let chatService: sinon.SinonStubbedInstance<ChatService>;
    let tokenUsageClient: sinon.SinonStubbedInstance<TokenUsageServiceClient>;
    let logger: sinon.SinonStubbedInstance<ILogger>;

    let tokenUsageEmitter: Emitter<TokenUsage>;
    let sessionEventEmitter: Emitter<SessionCreatedEvent | SessionDeletedEvent>;
    let sessionRegistry: Map<string, ChatSession>;
    let sessionStore: sinon.SinonStubbedInstance<ChatSessionStore>;

    // Helper to create a mock TokenUsage event
    function createTokenUsage(params: {
        sessionId: string;
        requestId: string;
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens?: number;
        readCachedInputTokens?: number;
    }): TokenUsage {
        return {
            ...params,
            model: 'test-model',
            timestamp: new Date()
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

        // Create emitters for event simulation
        tokenUsageEmitter = new Emitter<TokenUsage>();
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

        tokenUsageClient = {
            onTokenUsageUpdated: tokenUsageEmitter.event
        } as unknown as sinon.SinonStubbedInstance<TokenUsageServiceClient>;

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
        container.bind(TokenUsageServiceClient).toConstantValue(tokenUsageClient);
        container.bind(ILogger).toConstantValue(logger);
        container.bind(ChatSessionStore).toConstantValue(sessionStore);
        container.bind(ChatSessionSummarizationServiceImpl).toSelf().inSingletonScope();

        service = container.get(ChatSessionSummarizationServiceImpl);
        // Manually call init since @postConstruct won't run in tests
        (service as unknown as { init: () => void }).init();
    });

    afterEach(() => {
        sinon.restore();
        tokenUsageEmitter.dispose();
        sessionEventEmitter.dispose();
        sessionRegistry.clear();
    });

    describe('markPendingSplit', () => {
        it('should store pending split data', () => {
            const sessionId = 'session-1';
            const requestId = 'request-1';
            const pendingToolCalls: ToolCall[] = [
                { id: 'tool-1', function: { name: 'test_tool', arguments: '{}' }, finished: false }
            ];
            const toolResults = new Map<string, ToolCallResult>([['tool-1', 'result']]);

            service.markPendingSplit(sessionId, requestId, pendingToolCalls, toolResults);

            // Verify info was logged
            expect((logger.info as sinon.SinonStub).calledWithMatch('Marking pending split')).to.be.true;
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

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel
            );

            expect(result).to.be.false;
        });

        it('should return false when request kind is continuation', async () => {
            const sessionId = 'session-1';
            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'continuation' },
                response: { isComplete: false }
            };

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel
            );

            expect(result).to.be.false;
        });

        it('should return false when tokens are below threshold', async () => {
            const sessionId = 'session-1';
            tokenTracker.getSessionInputTokens.returns(100); // Below threshold

            const mockAgent = { invoke: sinon.stub() };
            const mockRequest = {
                id: 'request-1',
                request: { kind: 'user' },
                response: { isComplete: false }
            };

            const result = await service.checkAndHandleSummarization(
                sessionId,
                mockAgent as unknown as import('../common').ChatAgent,
                mockRequest as unknown as import('../common').MutableChatRequestModel
            );

            expect(result).to.be.false;
        });
    });

    describe('per-branch token tracking', () => {
        it('should attribute tokens to the correct branch via model.getBranch(requestId)', () => {
            const sessionId = 'session-1';
            const branchId = 'branch-A';
            const requestId = `request-for-${branchId}`;
            const session = createMockSession(sessionId, branchId);

            sessionRegistry.set(sessionId, session);

            // Fire token usage event
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId,
                inputTokens: 1000,
                outputTokens: 100
            }));

            // Verify branchTokens map is updated with totalTokens (inputTokens + outputTokens)
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens[branchId]).to.equal(1100); // 1000 input + 100 output
        });

        it('should update branchTokens when token usage event is for active branch', () => {
            const sessionId = 'session-2';
            const activeBranchId = 'branch-active';
            const requestId = `request-for-${activeBranchId}`;
            const session = createMockSession(sessionId, activeBranchId);

            sessionRegistry.set(sessionId, session);

            // Fire token usage event for active branch
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId,
                inputTokens: 5000,
                outputTokens: 200
            }));

            // Verify branchTokens was updated with totalTokens (inputTokens + outputTokens)
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens[activeBranchId]).to.equal(5200); // 5000 input + 200 output
        });

        it('should NOT trigger tracker reset for non-active branch but should store tokens', () => {
            const sessionId = 'session-3';
            const activeBranchId = 'branch-B';
            const nonActiveBranchId = 'branch-A';
            const requestId = `request-for-${nonActiveBranchId}`;
            // Active branch is B, but we fire event for branch A
            const session = createMockSession(sessionId, activeBranchId, [
                { id: nonActiveBranchId },
                { id: activeBranchId } // Last element is active
            ]);

            sessionRegistry.set(sessionId, session);

            const callCountBefore = tokenTracker.resetSessionTokens.callCount;

            // Fire token usage event for non-active branch
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId,
                inputTokens: 3000,
                outputTokens: 150
            }));

            // Verify tokenTracker.resetSessionTokens was NOT called additionally
            expect(tokenTracker.resetSessionTokens.callCount).to.equal(callCountBefore);

            // But branchTokens should be updated with totalTokens (inputTokens + outputTokens)
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens[nonActiveBranchId]).to.equal(3150); // 3000 input + 150 output
        });

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

        it('should reset session tokens for active branch with valid input tokens', async () => {
            const sessionId = 'session-6';
            const activeBranchId = 'branch-active';
            const nonActiveBranchId = 'branch-other';

            // Create session with two branches, active is the last one
            const session = createMockSession(sessionId, activeBranchId, [
                { id: nonActiveBranchId },
                { id: activeBranchId }
            ]);

            sessionRegistry.set(sessionId, session);

            const resetCallCountBefore = tokenTracker.resetSessionTokens.callCount;

            // Fire token usage event exceeding threshold for NON-active branch
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId: `request-for-${nonActiveBranchId}`,
                inputTokens: CHAT_TOKEN_THRESHOLD + 10000,
                outputTokens: 100
            }));

            // resetSessionTokens should NOT be called for non-active branch
            expect(tokenTracker.resetSessionTokens.callCount).to.equal(resetCallCountBefore);

            // Now fire for active branch
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId: `request-for-${activeBranchId}`,
                inputTokens: CHAT_TOKEN_THRESHOLD + 10000,
                outputTokens: 100
            }));

            // resetSessionTokens SHOULD be called for active branch with totalTokens (inputTokens + outputTokens)
            expect(tokenTracker.resetSessionTokens.calledWith(sessionId, CHAT_TOKEN_THRESHOLD + 10100)).to.be.true; // threshold + 10000 input + 100 output
        });

        it('should remove all branch entries when session is deleted', () => {
            const sessionId = 'session-to-delete';

            // Pre-populate branch tokens via tracker and triggeredBranches
            tokenTracker.setBranchTokens(sessionId, 'branch-A', 1000);
            tokenTracker.setBranchTokens(sessionId, 'branch-B', 2000);
            tokenTracker.setBranchTokens('other-session', 'branch-X', 5000);

            const triggeredBranchesSet = (service as unknown as { triggeredBranches: Set<string> }).triggeredBranches;
            // Note: cleanupSession uses prefix `${sessionId}: ` (with trailing space) for matching
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

        it('should skip summary requests in token handler', () => {
            const sessionId = 'session-7';
            const branchId = 'branch-A';
            const summaryRequestId = 'summary-request-for-branch-A';

            // Create session where getRequest returns summary kind for specific request
            const modelChangeEmitter = new Emitter<unknown>();
            const session = {
                id: sessionId,
                isActive: true,
                model: {
                    getBranch: sinon.stub().callsFake((requestId: string) => {
                        if (requestId === summaryRequestId) {
                            return { id: branchId };
                        }
                        return undefined;
                    }),
                    getBranches: sinon.stub().returns([{ id: branchId }]),
                    getRequest: sinon.stub().callsFake((requestId: string) => {
                        if (requestId === summaryRequestId) {
                            return { request: { kind: 'summary' } };
                        }
                        return { request: { kind: 'user' } };
                    }),
                    onDidChange: modelChangeEmitter.event
                }
            } as unknown as ChatSession;

            sessionRegistry.set(sessionId, session);

            const callCountBefore = tokenTracker.resetSessionTokens.callCount;

            // Fire token usage event for summary request
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId: summaryRequestId,
                inputTokens: 5000,
                outputTokens: 200
            }));

            // Verify branchTokens was NOT updated
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens[branchId]).to.be.undefined;

            // Verify tokenTracker.resetSessionTokens was NOT called additionally
            expect(tokenTracker.resetSessionTokens.callCount).to.equal(callCountBefore);
        });

        it('should not double-count cached input tokens (inputTokens already includes cached)', () => {
            const sessionId = 'session-8';
            const branchId = 'branch-A';
            const requestId = `request-for-${branchId}`;
            const session = createMockSession(sessionId, branchId);

            sessionRegistry.set(sessionId, session);

            // Fire token usage event with cached tokens
            // Per Anthropic API: inputTokens already INCLUDES cached tokens
            // cachedInputTokens and readCachedInputTokens are just subsets indicating WHERE tokens came from
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId,
                inputTokens: 1000, // This already includes any cached tokens
                cachedInputTokens: 500, // Subset: 500 of the 1000 were cache writes
                readCachedInputTokens: 200, // Subset: 200 of the 1000 were cache reads
                outputTokens: 100
            }));

            // Verify branchTokens uses only inputTokens (not sum with cached)
            // totalInputTokens should be 1000, not 1000 + 500 + 200 = 1700
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens[branchId]).to.equal(1100); // 1000 (input) + 100 (output), NOT 1800
        });

        it('should not update branchTokens when session is not found', () => {
            const sessionId = 'non-existent-session';

            // Don't add to sessionRegistry - session not found

            // Fire token usage event
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId: 'some-request',
                inputTokens: 1000,
                outputTokens: 100
            }));

            // Verify branchTokens was NOT updated
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens).to.deep.equal({});
        });

        it('should not update branchTokens when branch is not found for request', () => {
            const sessionId = 'session-9';
            const branchId = 'branch-A';
            const unknownRequestId = 'unknown-request';

            // Create session where getBranch returns undefined for unknown request
            const session = createMockSession(sessionId, branchId);
            ((session.model as unknown as { getBranch: sinon.SinonStub }).getBranch).withArgs(unknownRequestId).returns(undefined);

            sessionRegistry.set(sessionId, session);

            const callCountBefore = tokenTracker.resetSessionTokens.callCount;

            // Fire token usage event for unknown request
            tokenUsageEmitter.fire(createTokenUsage({
                sessionId,
                requestId: unknownRequestId,
                inputTokens: 1000,
                outputTokens: 100
            }));

            // Verify branchTokens was NOT updated
            const branchTokens = tokenTracker.getBranchTokensForSession(sessionId);
            expect(branchTokens).to.deep.equal({});

            // Verify tokenTracker.resetSessionTokens was NOT called additionally
            expect(tokenTracker.resetSessionTokens.callCount).to.equal(callCountBefore);
        });

    });

    describe('cleanupSession', () => {
        it('should clean up pendingSplits when session is deleted', () => {
            const sessionId = 'session-to-cleanup';

            // Add pending split
            service.markPendingSplit(sessionId, 'request-1', [], new Map());

            // Fire session deleted event
            sessionEventEmitter.fire({ type: 'deleted', sessionId });

            // Verify tokenTracker cleanup was called
            expect((tokenTracker.clearSessionBranchTokens as sinon.SinonStub).calledWith(sessionId)).to.be.true;
        });
    });
});
