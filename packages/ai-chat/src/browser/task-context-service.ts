// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { MaybePromise, ProgressService, URI, generateUuid, Event } from '@theia/core';
import { ChatAgent, ChatAgentLocation, ChatService, ChatSession, MutableChatModel, MutableChatRequestModel, ParsedChatRequestTextPart } from '../common';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { AgentService, PromptService } from '@theia/ai-core';
import { CHAT_SESSION_SUMMARY_PROMPT } from '../common/chat-session-summary-agent-prompt';

export interface SummaryMetadata {
    label: string;
    uri?: URI;
    sessionId?: string;
}

export interface Summary extends SummaryMetadata {
    summary: string;
    id: string;
}

export const TaskContextStorageService = Symbol('TextContextStorageService');
export interface TaskContextStorageService {
    onDidChange: Event<void>;
    store(summary: Summary): MaybePromise<void>;
    getAll(): Summary[];
    get(identifier: string): Summary | undefined;
    delete(identifier: string): MaybePromise<boolean>;
    open(identifier: string): Promise<void>;
}

@injectable()
export class TaskContextService {

    protected pendingSummaries = new Map<string, Promise<Summary>>();

    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(AgentService) protected readonly agentService: AgentService;
    @inject(PromptService) protected readonly promptService: PromptService;
    @inject(TaskContextStorageService) protected readonly storageService: TaskContextStorageService;
    @inject(ProgressService) protected readonly progressService: ProgressService;

    get onDidChange(): Event<void> {
        return this.storageService.onDidChange;
    }

    getAll(): Array<Summary> {
        return this.storageService.getAll();
    }

    async getSummary(sessionIdOrFilePath: string): Promise<string> {
        const existing = this.storageService.get(sessionIdOrFilePath);
        if (existing) { return existing.summary; }
        const pending = this.pendingSummaries.get(sessionIdOrFilePath);
        if (pending) {
            return pending.then(({ summary }) => summary);
        }
        const session = this.chatService.getSession(sessionIdOrFilePath);
        if (session) {
            return this.summarize(session);
        }
        throw new Error('Unable to resolve summary request.');
    }

    /** Returns an ID that can be used to refer to the summary in the future. */
    async summarize(session: ChatSession, promptId?: string, agent?: ChatAgent): Promise<string> {
        const pending = this.pendingSummaries.get(session.id);
        if (pending) { return pending.then(({ id }) => id); }
        const existing = this.getSummaryForSession(session);
        if (existing) { return existing.id; }
        const summaryId = generateUuid();
        const summaryDeferred = new Deferred<Summary>();
        const progress = await this.progressService.showProgress({ text: `Summarize: ${session.title || session.id}`, options: { location: 'ai-chat' } });
        this.pendingSummaries.set(session.id, summaryDeferred.promise);
        try {
            const newSummary: Summary = {
                summary: await this.getLlmSummary(session, promptId, agent),
                label: session.title || session.id,
                sessionId: session.id,
                id: summaryId
            };
            await this.storageService.store(newSummary);
            return summaryId;
        } catch (err) {
            summaryDeferred.reject(err);
            throw err;
        } finally {
            progress.cancel();
            this.pendingSummaries.delete(session.id);
        }
    }

    protected async getLlmSummary(session: ChatSession, promptId: string = CHAT_SESSION_SUMMARY_PROMPT.id, agent?: ChatAgent): Promise<string> {
        agent = agent || this.agentService.getAgents().find<ChatAgent>((candidate): candidate is ChatAgent =>
            'invoke' in candidate
            && typeof candidate.invoke === 'function'
            && candidate.id === ChatSessionSummaryAgent.ID
        );
        if (!agent) { throw new Error('Unable to identify agent for summary.'); }
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        const prompt = await this.promptService.getResolvedPromptFragment(promptId || CHAT_SESSION_SUMMARY_PROMPT.id, undefined, { model: session.model });
        if (!prompt) { return ''; }
        const messages = session.model.getRequests().filter((candidate): candidate is MutableChatRequestModel => candidate instanceof MutableChatRequestModel);
        messages.forEach(message => model['_hierarchy'].append(message));
        const summaryRequest = model.addRequest({
            variables: prompt.variables ?? [],
            request: { text: prompt.text },
            parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: prompt.text.length }, prompt.text)],
            toolRequests: prompt.functionDescriptions ?? new Map()
        }, agent.id);
        await agent.invoke(summaryRequest);
        return summaryRequest.response.response.asDisplayString();
    }

    hasSummary(chatSession: ChatSession): boolean {
        return !!this.getSummaryForSession(chatSession);
    }

    protected getSummaryForSession(chatSession: ChatSession): Summary | undefined {
        return this.storageService.getAll().find(candidate => candidate.sessionId === chatSession.id);
    }

    getLabel(id: string): string | undefined {
        return this.storageService.get(id)?.label;
    }

    open(id: string): Promise<void> {
        return this.storageService.open(id);
    }
}
