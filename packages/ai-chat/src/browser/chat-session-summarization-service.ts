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
import { Disposable, ILogger } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { AgentService, TokenUsageServiceClient } from '@theia/ai-core';
import {
    ChatAgent,
    ChatService,
    MutableChatModel,
    MutableChatRequestModel
} from '../common';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import {
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

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(TokenUsageServiceClient)
    protected readonly tokenUsageClient: TokenUsageServiceClient;

    /**
     * Set of sessionIds currently being summarized to prevent concurrent summarization.
     */
    protected summarizingSession = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.tokenTracker.onThresholdExceeded(event => this.handleThresholdExceeded(event));
    }

    /**
     * Called when the frontend application starts.
     * Required by FrontendApplicationContribution to ensure this service is instantiated.
     */
    onStart(): void {
        // Service initialization is handled in @postConstruct
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
            const position = skipReorder ? 'end' : 'beforeLast';

            const summaryText = await model.insertSummary(
                async summaryRequest => {
                    // Find and invoke the summary agent
                    const agent = this.agentService.getAgents().find<ChatAgent>(
                        (candidate): candidate is ChatAgent =>
                            'invoke' in candidate &&
                            typeof candidate.invoke === 'function' &&
                            candidate.id === ChatSessionSummaryAgent.ID
                    );

                    if (!agent) {
                        this.logger.error('ChatSessionSummaryAgent not found');
                        return undefined;
                    }

                    // Set up listener to capture token usage
                    let capturedInputTokens: number | undefined;
                    const tokenUsageListener: Disposable = this.tokenUsageClient.onTokenUsageUpdated(usage => {
                        if (usage.requestId === summaryRequest.id) {
                            capturedInputTokens = usage.inputTokens;
                        }
                    });

                    try {
                        await agent.invoke(summaryRequest);
                    } finally {
                        tokenUsageListener.dispose();
                    }

                    // Store captured tokens for later use
                    if (capturedInputTokens !== undefined) {
                        summaryRequest.addData('capturedInputTokens', capturedInputTokens);
                    }

                    return summaryRequest.response.response.asDisplayString();
                },
                position
            );

            if (!summaryText) {
                this.logger.warn(`Summarization failed for session ${sessionId}`);
                return undefined;
            }

            this.logger.info(`Added summary node to session ${sessionId}`);

            // Reset token count using captured tokens
            const lastSummaryRequest = model.getRequests().find(r => r.request.kind === 'summary');
            const capturedTokens = lastSummaryRequest?.getDataByKey<number>('capturedInputTokens');
            if (capturedTokens !== undefined) {
                this.tokenTracker.resetSessionTokens(sessionId, capturedTokens);
                this.tokenTracker.resetThresholdTrigger(sessionId);
                this.logger.info(`Reset token count for session ${sessionId} to ${capturedTokens} tokens`);
            }

            return summaryText;

        } catch (error) {
            this.logger.error(`Failed to summarize session ${sessionId}:`, error);
            return undefined;
        } finally {
            this.summarizingSession.delete(sessionId);
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

}
