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
import { ToolCall, ToolCallResult, TokenUsage, TokenUsageServiceClient } from '@theia/ai-core';
import {
    ChatAgent,
    ChatService,
    ChatSession,
    ErrorChatResponseContent,
    ErrorChatResponseContentImpl,
    MutableChatModel,
    MutableChatRequestModel,
    MutableChatResponseModel,
    ParsedChatRequest,
    SummaryChatResponseContentImpl,
    ToolCallChatResponseContent,
    ToolCallChatResponseContentImpl
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
     * Mark a pending mid-turn split. Called by the tool loop when budget exceeded.
     * The split will be handled by checkAndHandleSummarization() after addContentsToResponse().
     */
    markPendingSplit(
        sessionId: string,
        requestId: string,
        pendingToolCalls: ToolCall[],
        toolResults: Map<string, ToolCallResult>
    ): void;

    /**
     * Check and handle summarization after response content is added.
     * Handles both mid-turn splits (from markPendingSplit) and between-turn summarization.
     *
     * @param sessionId The session ID
     * @param agent The chat agent to invoke for summary/continuation
     * @param request The current request being processed
     * @returns true if summarization was triggered (caller should skip onResponseComplete), false otherwise
     */
    checkAndHandleSummarization(
        sessionId: string,
        agent: ChatAgent,
        request: MutableChatRequestModel
    ): Promise<boolean>;
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
     *
     * Used for deduplication (prevents multiple triggers for the same branch during a single growth cycle).
     *
     * **Cleanup behavior:**
     * - After successful summarization: The branch key is REMOVED to allow future re-triggering
     *   when tokens grow again past the threshold.
     * - On session deletion: All entries with matching sessionId prefix are removed.
     * - On branch change: New branches automatically get fresh tracking since their branchId
     *   differs from previously tracked branches.
     */
    protected triggeredBranches: Set<string> = new Set<string>();

    /**
     * Stores pending mid-turn split data, keyed by sessionId.
     * Consumed by checkAndHandleSummarization() after addContentsToResponse().
     */
    protected pendingSplits = new Map<string, {
        requestId: string;
        pendingToolCalls: ToolCall[];
        toolResults: Map<string, ToolCallResult>;
    }>();

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

        const totalInputTokens = usage.inputTokens;
        const totalTokens = totalInputTokens + (usage.outputTokens ?? 0);

        // Update branch tokens (for branch switching)
        if (totalTokens > 0) {
            this.tokenTracker.setBranchTokens(usage.sessionId, branch.id, totalTokens);
        }

        const activeBranchId = this.getActiveBranchId(session);

        if (branch.id === activeBranchId && totalTokens > 0) {
            this.tokenTracker.resetSessionTokens(usage.sessionId, totalTokens);
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

    markPendingSplit(
        sessionId: string,
        requestId: string,
        pendingToolCalls: ToolCall[],
        toolResults: Map<string, ToolCallResult>
    ): void {
        this.logger.info(`Marking pending split for session ${sessionId}, request ${requestId}, ${pendingToolCalls.length} tool calls`);
        this.pendingSplits.set(sessionId, { requestId, pendingToolCalls, toolResults });
    }

    async checkAndHandleSummarization(
        sessionId: string,
        agent: ChatAgent,
        request: MutableChatRequestModel
    ): Promise<boolean> {
        // Check for pending mid-turn split first
        const pendingSplit = this.pendingSplits.get(sessionId);
        if (pendingSplit) {
            // Consume immediately to prevent re-entry
            this.pendingSplits.delete(sessionId);
            await this.handleMidTurnSplit(sessionId, agent, request, pendingSplit);
            return true;
        }

        // Between-turn check: skip if summary or continuation request
        if (request.request.kind === 'summary' || request.request.kind === 'continuation') {
            return false;
        }

        // Check if threshold exceeded for between-turn summarization
        const tokens = this.tokenTracker.getSessionInputTokens(sessionId);
        if (tokens === undefined || tokens < CHAT_TOKEN_THRESHOLD) {
            return false;
        }

        // Between-turn summarization - trigger via existing performSummarization
        const session = this.chatService.getSession(sessionId);
        if (!session) {
            return false;
        }

        // Complete current response first if not already
        if (!request.response.isComplete) {
            request.response.complete();
        }

        // Use existing performSummarization for between-turn (it marks stale after summary)
        await this.performSummarization(sessionId, session.model as MutableChatModel);
        return true;
    }

    protected async handleMidTurnSplit(
        sessionId: string,
        agent: ChatAgent,
        request: MutableChatRequestModel,
        pendingSplit: { requestId: string; pendingToolCalls: ToolCall[]; toolResults: Map<string, ToolCallResult> }
    ): Promise<void> {
        const session = this.chatService.getSession(sessionId);
        if (!session) {
            this.logger.warn(`Session ${sessionId} not found for mid-turn split`);
            return;
        }
        const model = session.model as MutableChatModel;

        // Step 1: Remove pending tool calls from current response
        this.removePendingToolCallsFromResponse(request.response, pendingSplit.pendingToolCalls);

        // Step 2: Complete current response
        request.response.complete();

        // Step 3: Create and invoke summary request (NO stale marking yet - summary needs full history)
        // eslint-disable-next-line max-len
        const summaryPrompt = 'Please provide a concise summary of our conversation so far, capturing all key requirements, decisions, context, and pending tasks so we can seamlessly continue. Do not include conversational elements, questions, or offers to continue. Do not start with a heading - output only the summary content.';

        const summaryParsedRequest: ParsedChatRequest = {
            request: { text: summaryPrompt, kind: 'summary' },
            parts: [{ kind: 'text', text: summaryPrompt, promptText: summaryPrompt, range: { start: 0, endExclusive: summaryPrompt.length } }],
            toolRequests: new Map(),
            variables: []
        };
        const summaryRequest = model.addRequest(summaryParsedRequest, undefined, { variables: [] });

        // Invoke agent for summary (will populate summaryRequest.response)
        await agent.invoke(summaryRequest);

        // Get summary text from response
        const summaryText = summaryRequest.response.response.asDisplayString()?.trim() || '';

        // Replace response content with SummaryChatResponseContent for proper rendering
        summaryRequest.response.response.clearContent();
        summaryRequest.response.response.addContent(new SummaryChatResponseContentImpl(summaryText));

        // Step 4: Mark ALL requests stale AFTER summary is generated (summary needed full history)
        const allRequestsAfterSummary = model.getRequests();
        for (const req of allRequestsAfterSummary) {
            // Don't mark continuation request stale (it will be created next)
            if (req.request.kind !== 'continuation') {
                (req as MutableChatRequestModel).isStale = true;
            }
        }

        // Step 5: Create continuation request with tool call content in response
        // Include the summary plus an instruction to continue
        const continuationSuffix = 'The tool call above was executed. Please continue with your task ' +
            'based on the result. If you need to make more tool calls to complete the task, please do so. ' +
            'Once you have all the information needed, provide your final response.';
        const continuationInstruction = `${summaryText}\n\n${continuationSuffix}`;

        const continuationParsedRequest: ParsedChatRequest = {
            request: { text: continuationInstruction, kind: 'continuation' },
            parts: [{ kind: 'text', text: continuationInstruction, promptText: continuationInstruction, range: { start: 0, endExclusive: continuationInstruction.length } }],
            toolRequests: new Map(),
            variables: []
        };
        const continuationRequest = model.addRequest(continuationParsedRequest, undefined, { variables: [] });

        // Add tool call content to response for UI display
        for (const toolCall of pendingSplit.pendingToolCalls) {
            const result = pendingSplit.toolResults.get(toolCall.id!);
            const toolContent = new ToolCallChatResponseContentImpl(
                toolCall.id,
                toolCall.function?.name,
                toolCall.function?.arguments,
                true, // finished
                result
            );
            continuationRequest.response.response.addContent(toolContent);
        }

        // Step 6: Invoke agent for continuation (token tracking will update from LLM response)
        await agent.invoke(continuationRequest);
    }

    protected removePendingToolCallsFromResponse(
        response: MutableChatResponseModel,
        pendingToolCalls: ToolCall[]
    ): void {
        const pendingIds = new Set(pendingToolCalls.map(tc => tc.id).filter(Boolean));
        const content = response.response.content;

        const filteredContent = content.filter(c => {
            if (ToolCallChatResponseContent.is(c) && c.id && pendingIds.has(c.id)) {
                return false;
            }
            return true;
        });

        response.response.clearContent();
        response.response.addContents(filteredContent);
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

        this.logger.info(`Token threshold exceeded for session ${sessionId}: ${inputTokens} tokens.Starting summarization...`);
        await this.performSummarization(sessionId, session.model as MutableChatModel);
    }

    /**
     * Execute a callback with summarization lock for the session.
     * Ensures lock is released even if callback throws.
     */
    protected async withSummarizationLock<T>(
        sessionId: string,
        callback: () => Promise<T>
    ): Promise<T | undefined> {
        if (this.summarizingSession.has(sessionId)) {
            return undefined;
        }
        this.summarizingSession.add(sessionId);
        try {
            return await callback();
        } finally {
            this.summarizingSession.delete(sessionId);
        }
    }

    /**
     * Update token tracking after successful summarization.
     */
    protected updateTokenTrackingAfterSummary(
        sessionId: string,
        outputTokens: number
    ): void {
        this.tokenTracker.resetSessionTokens(sessionId, outputTokens);
        // Update branch tokens and allow future re-triggering
        const session = this.chatService.getSession(sessionId);
        if (session) {
            const activeBranchId = this.getActiveBranchId(session);
            if (activeBranchId) {
                const branchKey = `${sessionId}:${activeBranchId} `;
                this.tokenTracker.setBranchTokens(sessionId, activeBranchId, outputTokens);
                this.triggeredBranches.delete(branchKey);
            }
        }
    }

    /**
     * Core summarization logic shared by both threshold-triggered and explicit mid-turn summarization.
     *
     * @param skipReorder If true, skip removing/re-adding the trigger request (for mid-turn summarization
     *                    where the request is actively being processed with tool calls)
     * @returns The summary text on success, or `undefined` on failure
     */
    protected async performSummarization(sessionId: string, model: MutableChatModel, skipReorder?: boolean): Promise<string | undefined> {
        return this.withSummarizationLock(sessionId, async () => {
            // Always use 'end' position - reordering breaks the hierarchy structure
            // because the summary is added as continuation of the trigger request
            const position = 'end';
            // eslint-disable-next-line max-len
            const summaryPrompt = 'Please provide a concise summary of our conversation so far, capturing all key requirements, decisions, context, and pending tasks so we can seamlessly continue. ' +
                'Do not include conversational elements, questions, or offers to continue. Do not start with a heading - output only the summary content.';

            try {
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

                            // Replace agent's markdown content with SummaryChatResponseContent for proper rendering
                            const mutableRequest = request as MutableChatRequestModel;
                            mutableRequest.response.response.clearContent();
                            mutableRequest.response.response.addContent(new SummaryChatResponseContentImpl(summaryResponseText));

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

                this.logger.info(`Added summary node to session ${sessionId} `);

                // Find the summary request to get captured output tokens
                const summaryRequest = model.getRequests().find(r => r.request.kind === 'summary');
                const outputTokens = summaryRequest?.getDataByKey<number>('capturedOutputTokens') ?? 0;

                this.updateTokenTrackingAfterSummary(sessionId, outputTokens);
                this.logger.info(`Reset token count for session ${sessionId} to ${outputTokens} after summarization`);

                return summaryText;
            } catch (error) {
                this.logger.error(`Failed to summarize session ${sessionId}: `, error);
                this.notifyUserOfFailure(model);
                return undefined;
            }
        });
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
        this.pendingSplits.delete(sessionId);
        const prefix = `${sessionId}: `;
        for (const key of this.triggeredBranches.keys()) {
            if (key.startsWith(prefix)) {
                this.triggeredBranches.delete(key);
            }
        }
    }
}
