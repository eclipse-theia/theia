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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ILogger, nls } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TokenUsage, TokenUsageServiceClient } from '@theia/ai-core';
import {
    ChatService,
    ChatSession,
    ErrorChatResponseContent,
    ErrorChatResponseContentImpl,
    MutableChatModel,
    MutableChatRequestModel
} from '../common';
import { isSessionCreatedEvent, isSessionDeletedEvent } from '../common/chat-service';
import {
    CHAT_TOKEN_THRESHOLD,
    ChatSessionTokenTracker,
    SessionTokenThresholdEvent
} from './chat-session-token-tracker';

export const ChatSessionSummarizationService = Symbol('ChatSessionSummarizationService');

/**
 * Service that automatically summarizes chat sessions when token usage exceeds the threshold.
 *
 * When the threshold is exceeded:
 * 1. Marks older messages as stale (excluding them from future prompts)
 * 2. Invokes ChatSessionSummaryAgent to generate a summary
 * 3. Inserts a summary node into the chat
 */
export interface ChatSessionSummarizationService {
    /**
     * Check if a session has been summarized (has stale messages).
     */
    hasSummary(sessionId: string): boolean;

    /**
     * Trigger summarization for a session.
     * Called by the budget-aware tool loop when token threshold is exceeded mid-turn.
     *
     * @param sessionId The session to summarize
     * @param skipReorder If true, skip removing/re-adding the trigger request (for mid-turn summarization)
     * @returns Promise that resolves with the summary text on success, or `undefined` on failure
     */
    triggerSummarization(sessionId: string, skipReorder: boolean): Promise<string | undefined>;

}

@injectable()
export class ChatSessionSummarizationServiceImpl implements ChatSessionSummarizationService, FrontendApplicationContribution {
    @inject(ChatSessionTokenTracker)
    protected readonly tokenTracker: ChatSessionTokenTracker;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(TokenUsageServiceClient)
    protected readonly tokenUsageClient: TokenUsageServiceClient;

    /**
     * Set of sessionIds currently being summarized to prevent concurrent summarization.
     */
    protected summarizingSession = new Set<string>();

    /**
     * Tracks which branches have triggered summarization.
     * Key format: `${sessionId}:${branchId}`
     * Used for deduplication (prevents multiple triggers for the same branch).
     */
    protected triggeredBranches: Set<string> = new Set<string>();

    @postConstruct()
    protected init(): void {
        // Listen to token usage events and attribute to correct branch
        this.tokenUsageClient.onTokenUsageUpdated(usage => this.handleTokenUsage(usage));

        // Listen for new sessions and set up branch change listeners
        this.chatService.onSessionEvent(event => {
            if (isSessionCreatedEvent(event)) {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.setupBranchChangeListener(session);
                }
                // Restore branch tokens from persisted data
                if (event.branchTokens) {
                    this.tokenTracker.restoreBranchTokens(event.sessionId, event.branchTokens);
                }
                // Emit initial token count for active branch
                if (session) {
                    const activeBranchId = this.getActiveBranchId(session);
                    if (activeBranchId) {
                        const tokens = this.tokenTracker.getBranchTokens(event.sessionId, activeBranchId);
                        this.tokenTracker.resetSessionTokens(event.sessionId, tokens);
                    }
                }
            } else if (isSessionDeletedEvent(event)) {
                this.cleanupSession(event.sessionId);
            }
        });
    }

    /**
     * Called when the frontend application starts.
     * Required by FrontendApplicationContribution to ensure this service is instantiated.
     */
    onStart(): void {
        // Set up branch change listeners for existing sessions
        for (const session of this.chatService.getSessions()) {
            this.setupBranchChangeListener(session);
        }
    }

    /**
     * Get the active branch ID for a session.
     */
    protected getActiveBranchId(session: ChatSession): string | undefined {
        return session.model.getBranches().at(-1)?.id;
    }

    /**
     * Handle token usage events and attribute to correct branch.
     */
    protected handleTokenUsage(usage: TokenUsage): void {
        if (!usage.sessionId) {
            return;
        }

        const session = this.chatService.getSession(usage.sessionId);
        if (!session) {
            return;
        }

        const model = session.model as MutableChatModel;
        const branch = model.getBranch(usage.requestId);
        if (!branch) {
            this.logger.debug('Token event for unknown request', { sessionId: usage.sessionId, requestId: usage.requestId });
            return;
        }

        // Skip summary requests - the per-summarization listener handles these
        if (model.getRequest(usage.requestId)?.request.kind === 'summary') {
            return;
        }

        const totalInputTokens = usage.inputTokens + (usage.cachedInputTokens ?? 0) + (usage.readCachedInputTokens ?? 0);
        this.tokenTracker.setBranchTokens(usage.sessionId, branch.id, totalInputTokens);

        const activeBranchId = this.getActiveBranchId(session);

        if (branch.id === activeBranchId) {
            this.tokenTracker.resetSessionTokens(usage.sessionId, totalInputTokens);
            // Check threshold for active branch only
            const branchKey = `${usage.sessionId}:${branch.id}`;
            if (totalInputTokens >= CHAT_TOKEN_THRESHOLD && !this.triggeredBranches.has(branchKey)) {
                this.triggeredBranches.add(branchKey);
                this.handleThresholdExceeded({ sessionId: usage.sessionId, inputTokens: totalInputTokens });
            }
        }
    }

    /**
     * Set up a listener for branch changes in a chat session.
     * When a branch change occurs (e.g., user edits an older message), reset token tracking.
     */
    protected setupBranchChangeListener(session: ChatSession): void {
        session.model.onDidChange(event => {
            if (event.kind === 'changeHierarchyBranch') {
                this.logger.info(`Branch changed in session ${session.id}, switching to branch ${event.branch.id}`);
                const storedTokens = this.tokenTracker.getBranchTokens(session.id, event.branch.id);
                this.tokenTracker.resetSessionTokens(session.id, storedTokens);
            }
        });
    }

    async triggerSummarization(sessionId: string, skipReorder: boolean): Promise<string | undefined> {
        const session = this.chatService.getSession(sessionId);
        if (!session) {
            this.logger.warn(`Session ${sessionId} not found for summarization`);
            return undefined;
        }

        this.logger.info(`Mid-turn summarization triggered for session ${sessionId}`);
        return this.performSummarization(sessionId, session.model as MutableChatModel, skipReorder);
    }

    protected async handleThresholdExceeded(event: SessionTokenThresholdEvent): Promise<void> {
        const { sessionId, inputTokens } = event;

        if (this.summarizingSession.has(sessionId)) {
            return;
        }

        const session = this.chatService.getSession(sessionId);
        if (!session) {
            this.logger.warn(`Session ${sessionId} not found for summarization`);
            return;
        }

        this.logger.info(`Token threshold exceeded for session ${sessionId}: ${inputTokens} tokens. Starting summarization...`);
        await this.performSummarization(sessionId, session.model as MutableChatModel);
    }

    /**
     * Core summarization logic shared by both threshold-triggered and explicit mid-turn summarization.
     *
     * @param skipReorder If true, skip removing/re-adding the trigger request (for mid-turn summarization
     *                    where the request is actively being processed with tool calls)
     * @returns The summary text on success, or `undefined` on failure
     */
    protected async performSummarization(sessionId: string, model: MutableChatModel, skipReorder?: boolean): Promise<string | undefined> {
        if (this.summarizingSession.has(sessionId)) {
            return undefined;
        }

        this.summarizingSession.add(sessionId);

        try {
            // Always use 'end' position - reordering breaks the hierarchy structure
            // because the summary is added as continuation of the trigger request
            const position = 'end';
            // eslint-disable-next-line max-len
            const summaryPrompt = 'Please provide a concise summary of our conversation so far, capturing all key requirements, decisions, context, and pending tasks so we can seamlessly continue.';

            const summaryText = await model.insertSummary(
                async () => {
                    const invocation = await this.chatService.sendRequest(sessionId, {
                        text: summaryPrompt,
                        kind: 'summary'
                    });
                    if (!invocation) {
                        return undefined;
                    }

                    const request = await invocation.requestCompleted;

                    // Set up token listener to capture output tokens
                    let capturedOutputTokens: number | undefined;
                    const tokenListener = this.tokenUsageClient.onTokenUsageUpdated(usage => {
                        if (usage.sessionId === sessionId && usage.requestId === request.id) {
                            capturedOutputTokens = usage.outputTokens;
                        }
                    });

                    try {
                        const response = await invocation.responseCompleted;

                        // Validate response
                        const summaryResponseText = response.response.asDisplayString()?.trim();
                        if (response.isError || !summaryResponseText) {
                            return undefined;
                        }

                        // Store captured output tokens on request for later retrieval
                        if (capturedOutputTokens !== undefined) {
                            (request as MutableChatRequestModel).addData('capturedOutputTokens', capturedOutputTokens);
                        }

                        return {
                            requestId: request.id,
                            summaryText: summaryResponseText
                        };
                    } finally {
                        tokenListener.dispose();
                    }
                },
                position
            );

            if (!summaryText) {
                this.logger.warn(`Summarization failed for session ${sessionId}`);
                this.notifyUserOfFailure(model);
                return undefined;
            }

            this.logger.info(`Added summary node to session ${sessionId}`);

            // Find the summary request to get captured output tokens
            const summaryRequest = model.getRequests().find(r => r.request.kind === 'summary');
            const outputTokens = summaryRequest?.getDataByKey<number>('capturedOutputTokens') ?? 0;

            // Reset token count to the summary's output tokens (the new context size)
            this.tokenTracker.resetSessionTokens(sessionId, outputTokens);
            this.logger.info(`Reset token count for session ${sessionId} to ${outputTokens} after summarization`);

            // Update branch tokens and allow future re-triggering
            const session = this.chatService.getSession(sessionId);
            if (session) {
                const activeBranchId = this.getActiveBranchId(session);
                if (activeBranchId) {
                    const branchKey = `${sessionId}:${activeBranchId}`;
                    this.tokenTracker.setBranchTokens(sessionId, activeBranchId, outputTokens);
                    this.triggeredBranches.delete(branchKey);
                }
            }

            return summaryText;

        } catch (error) {
            this.logger.error(`Failed to summarize session ${sessionId}:`, error);
            this.notifyUserOfFailure(model);
            return undefined;
        } finally {
            this.summarizingSession.delete(sessionId);
        }
    }

    /**
     * Notify the user that summarization failed by adding an error message to the chat.
     */
    protected notifyUserOfFailure(model: MutableChatModel): void {
        const requests = model.getRequests();
        const currentRequest = requests.at(-1);
        if (!currentRequest) {
            return;
        }

        // Avoid duplicate warnings
        const lastContent = currentRequest.response.response.content.at(-1);
        const alreadyWarned = ErrorChatResponseContent.is(lastContent) &&
            lastContent.error.message.includes('summarization');
        if (!alreadyWarned) {
            const errorMessage = nls.localize(
                'theia/ai-chat/summarizationFailed',
                'Chat summarization failed. The conversation is approaching token limits and may fail soon. Consider starting a new chat session or reducing context to continue.'
            );
            currentRequest.response.response.addContent(
                new ErrorChatResponseContentImpl(new Error(errorMessage))
            );
        }
    }

    hasSummary(sessionId: string): boolean {
        const session = this.chatService.getSession(sessionId);
        if (!session) {
            return false;
        }

        const model = session.model as MutableChatModel;
        return model.getRequests().some(r => (r as MutableChatRequestModel).isStale);
    }

    /**
     * Clean up token tracking data when a session is deleted.
     */
    protected cleanupSession(sessionId: string): void {
        this.tokenTracker.clearSessionBranchTokens(sessionId);
        const prefix = `${sessionId}:`;
        for (const key of this.triggeredBranches.keys()) {
            if (key.startsWith(prefix)) {
                this.triggeredBranches.delete(key);
            }
        }
    }

}
