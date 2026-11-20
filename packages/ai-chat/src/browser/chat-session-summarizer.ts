// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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

import { AgentService, LanguageModelRegistry, PromptService, ResolvedPromptFragment } from '@theia/ai-core';
import { CancellationToken, nls } from '@theia/core';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import {
    ChatAgent, ChatAgentLocation, ChatModel, ChatRequestModel, CompactionChatResponseContent, MutableChatModel, MutableChatRequestModel, ParsedChatRequestTextPart,
    ResponseTokenUsage
} from '../common';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { CHAT_SESSION_SUMMARY_PROMPT } from '../common/chat-session-summary-agent-prompt';

export interface ChatSessionSummaryOptions {
    /** The prompt that asks for the summary. The default is {@link CHAT_SESSION_SUMMARY_PROMPT}. */
    promptId?: string;
    /** The agent that makes the summary. The default is the {@link ChatSessionSummaryAgent}. */
    agent?: ChatAgent;
    /** The requests to summarize. The default is all requests on the active branch of the model. */
    requests?: readonly ChatRequestModel[];
    /** More instructions from the user, added to the prompt. */
    instructions?: string;
    cancellationToken?: CancellationToken;
}

export interface ChatSessionSummary {
    summary: string;
    tokenUsage?: ResponseTokenUsage;
}

/**
 * Makes a summary of a chat session with a language model. This is the one path for a session summary:
 * `TaskContextService.summarize` stores the result as a task context and `/compact` keeps it in the session.
 */
@injectable()
export class ChatSessionSummarizer {

    @inject(AgentService) protected readonly agentService: AgentService;
    @inject(PromptService) protected readonly promptService: PromptService;
    @inject(LanguageModelRegistry) @optional() protected readonly languageModelRegistry: LanguageModelRegistry | undefined;

    /**
     * @throws an error if the agent cannot make the summary. Then the result is not usable as a summary.
     */
    async summarize(model: ChatModel, options: ChatSessionSummaryOptions = {}): Promise<ChatSessionSummary> {
        const prompt = await this.getPrompt(model, options.promptId);
        if (!prompt) { throw new Error(nls.localize('theia/ai/chat/summarizer/noPrompt', 'Unable to resolve the prompt for the summary.')); }
        const agent = options.agent ?? this.getSummaryAgent();
        if (!agent) { throw new Error(nls.localize('theia/ai/chat/summarizer/noAgent', 'Unable to identify agent for summary.')); }

        const requests = options.requests ?? model.getRequests();
        const summaryModel = new MutableChatModel(ChatAgentLocation.Panel);
        // The history can hold a server-side compaction marker. Only the provider that made it can replay it, and only if
        // compaction is on for the request. Otherwise the provider skips the marker and sends the full history before it
        // again, which can be more than the context limit. Thus the summary uses the model that made the latest marker,
        // and the compaction setting of the session.
        const compaction = model.settings?.commonSettings?.compaction;
        const modelId = await this.getMarkerModelId(requests);
        if (compaction || modelId) {
            summaryModel.setSettings({ commonSettings: { ...(compaction ? { compaction } : {}), ...(modelId ? { modelId } : {}) } });
        }
        requests
            .filter((candidate): candidate is MutableChatRequestModel => candidate instanceof MutableChatRequestModel)
            .forEach(request => summaryModel['_hierarchy'].append(request));
        const text = options.instructions ? `${prompt.text}\n\nAlso follow these instructions from the user: ${options.instructions}` : prompt.text;
        const summaryRequest = summaryModel.addRequest({
            variables: prompt.variables ?? [],
            request: { text },
            parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)],
            toolRequests: prompt.functionDescriptions ?? new Map()
        }, agent.id);

        const cancellation = options.cancellationToken?.onCancellationRequested(() => summaryRequest.cancel());
        try {
            await agent.invoke(summaryRequest);
        } finally {
            cancellation?.dispose();
        }
        if (summaryRequest.response.isError) {
            throw summaryRequest.response.errorObject ?? new Error(nls.localize('theia/ai/chat/summarizer/failed', 'The agent could not create the summary.'));
        }
        return {
            summary: summaryRequest.response.response.asDisplayString(),
            tokenUsage: summaryRequest.response.tokenUsage
        };
    }

    /**
     * The language model that made the latest server-side compaction marker in the requests, if one did.
     * @throws an error if this model is not ready, because another model cannot replay the marker.
     */
    protected async getMarkerModelId(requests: readonly ChatRequestModel[]): Promise<string | undefined> {
        const request = [...requests].reverse().find(candidate => candidate.response.response.content
            .some(content => CompactionChatResponseContent.is(content) && !CompactionChatResponseContent.isSessionCompaction(content)));
        const modelId = request?.response.languageModel;
        if (!modelId || !this.languageModelRegistry) {
            return undefined;
        }
        const languageModel = await this.languageModelRegistry.getLanguageModel(modelId);
        if (languageModel?.status.status !== 'ready') {
            throw new Error(nls.localize('theia/ai/chat/summarizer/markerModelNotReady',
                'The history holds a server-side compaction of the language model {0}. Only this model can read it, and it is not ready. Make it ready, then try again.',
                modelId));
        }
        return modelId;
    }

    protected getSummaryAgent(): ChatAgent | undefined {
        return this.agentService.getAgents().find<ChatAgent>((candidate): candidate is ChatAgent =>
            'invoke' in candidate
            && typeof candidate.invoke === 'function'
            && candidate.id === ChatSessionSummaryAgent.ID
        );
    }

    protected getPrompt(model: ChatModel, promptId: string = CHAT_SESSION_SUMMARY_PROMPT.id): Promise<ResolvedPromptFragment | undefined> {
        return this.promptService.getResolvedPromptFragment(promptId || CHAT_SESSION_SUMMARY_PROMPT.id, undefined, { model });
    }
}
