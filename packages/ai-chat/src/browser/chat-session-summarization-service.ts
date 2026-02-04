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
import { ToolCall, ToolCallResult, UsageResponsePart } from '@theia/ai-core';
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
    ChatSessionTokenTracker
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
     * @param usage Usage data from the response stream for synchronous token tracking.
     *              May be undefined if the stream ended early (e.g., due to budget-exceeded split).
     * @returns true if summarization was triggered (caller should skip onResponseComplete), false otherwise
     */
    checkAndHandleSummarization(
        sessionId: string,
        agent: ChatAgent,
        request: MutableChatRequestModel,
        usage: UsageResponsePart | undefined
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
     * Set up a listener for branch changes in a chat session.
     * When a branch change occurs (e.g., user edits an older message), reset token tracking.
     */
    protected setupBranchChangeListener(session: ChatSession): void {
        session.model.onDidChange(event => {
            if (event.kind === 'changeHierarchyBranch') {
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
        this.pendingSplits.set(sessionId, { requestId, pendingToolCalls, toolResults });
    }

    /**
     * Update token tracking during streaming.
     * Called when usage data is received in the stream, before the response completes.
     * This enables real-time token count updates in the UI.
     */
    updateTokens(sessionId: string, usage: UsageResponsePart): void {
        const totalInputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        this.tokenTracker.updateSessionTokens(sessionId, totalInputTokens, usage.output_tokens);
    }

    async checkAndHandleSummarization(
        sessionId: string,
        agent: ChatAgent,
        request: MutableChatRequestModel,
        usage: UsageResponsePart | undefined
    ): Promise<boolean> {
        // Check for pending mid-turn split first (may exist even without usage data)
        const pendingSplit = this.pendingSplits.get(sessionId);
        if (pendingSplit) {
            // Consume immediately to prevent re-entry
            this.pendingSplits.delete(sessionId);
            await this.handleMidTurnSplit(sessionId, agent, request, pendingSplit);
            return true;
        }

        // If no usage data, nothing more to do
        if (!usage) {
            return false;
        }

        // Always skip summary requests before any token work
        if (request.request.kind === 'summary') {
            return false;
        }

        // Calculate tokens for all other requests (user and continuation)
        const totalInputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
        this.tokenTracker.updateSessionTokens(sessionId, totalInputTokens, usage.output_tokens);

        // Skip continuation requests only if below threshold
        if (request.request.kind === 'continuation' && totalInputTokens < CHAT_TOKEN_THRESHOLD) {
            return false;
        }

        // Check threshold with fresh data
        if (totalInputTokens >= CHAT_TOKEN_THRESHOLD) {
            const session = this.chatService.getSession(sessionId);
            if (session) {
                // Complete current response first if not already
                if (!request.response.isComplete) {
                    request.response.complete();
                }
                await this.performSummarization(sessionId, session.model as MutableChatModel);
                return true;
            } else {
                this.logger.warn(`Session ${sessionId} not found for between-turn summarization`);
            }
        }

        return false;
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

        // Step 3: Create summary request (stale marking deferred so summary sees full history)
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

        // Reset token tracking with summary output as new baseline BEFORE continuation
        const summaryOutputTokens = this.tokenTracker.getSessionOutputTokens(sessionId) ?? 0;
        this.updateTokenTrackingAfterSummary(sessionId, summaryOutputTokens);

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

        // Step 5: Create continuation request with summary and pending tool calls
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

        // Step 6: Invoke agent for continuation (token tracking will update normally)
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
                const branchKey = `${sessionId}:${activeBranchId}`;
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
            // Always use 'end' position - other positions break hierarchy structure
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
                        const response = await invocation.responseCompleted;

                        // Validate response
                        const summaryResponseText = response.response.asDisplayString()?.trim();
                        if (response.isError) {
                            this.logger.error(`Summary response has error: ${response.errorObject?.message}`);
                            return undefined;
                        }
                        if (!summaryResponseText) {
                            this.logger.error(`Summary response text is empty. Content count: ${response.response.content.length}, ` +
                                `content kinds: ${response.response.content.map(c => c.kind).join(', ')}`);
                            return undefined;
                        }

                        // Replace agent's markdown content with SummaryChatResponseContent for proper rendering
                        const mutableRequest = request as MutableChatRequestModel;
                        mutableRequest.response.response.clearContent();
                        mutableRequest.response.response.addContent(new SummaryChatResponseContentImpl(summaryResponseText));

                        return {
                            requestId: request.id,
                            summaryText: summaryResponseText
                        };
                    },
                    position
                );

                if (!summaryText) {
                    this.logger.warn(`Summarization failed for session ${sessionId}`);
                    this.notifyUserOfFailure(model);
                    return undefined;
                }

                // Get output tokens from tracker (handleTokenUsage now tracks summary requests)
                const outputTokens = this.tokenTracker.getSessionOutputTokens(sessionId) ?? 0;

                this.updateTokenTrackingAfterSummary(sessionId, outputTokens);

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
