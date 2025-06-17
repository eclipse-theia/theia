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
import { MaybePromise, ProgressService, URI, generateUuid, Event, EOL } from '@theia/core';
import { ChatAgent, ChatAgentLocation, ChatService, ChatSession, MutableChatModel, MutableChatRequestModel, ParsedChatRequestTextPart } from '../common';
import { PreferenceService } from '@theia/core/lib/browser';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { AgentService, PromptService, ResolvedPromptFragment } from '@theia/ai-core';
import { CHAT_SESSION_SUMMARY_PROMPT } from '../common/chat-session-summary-agent-prompt';
import { ChangeSetFileElementFactory } from './change-set-file-element';
import * as yaml from 'js-yaml';

export interface SummaryMetadata {
    label: string;
    uri?: URI;
    sessionId?: string;
}

export interface Summary extends SummaryMetadata {
    summary: string;
    id: string;
}

export const TaskContextStorageService = Symbol('TaskContextStorageService');
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
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

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
    async summarize(session: ChatSession, promptId?: string, agent?: ChatAgent, override = true): Promise<string> {
        const pending = this.pendingSummaries.get(session.id);
        if (pending) { return pending.then(({ id }) => id); }
        const existing = this.getSummaryForSession(session);
        if (existing && !override) { return existing.id; }
        const summaryId = generateUuid();
        const summaryDeferred = new Deferred<Summary>();
        const progress = await this.progressService.showProgress({ text: `Summarize: ${session.title || session.id}`, options: { location: 'ai-chat' } });
        this.pendingSummaries.set(session.id, summaryDeferred.promise);
        try {
            const prompt = await this.getSystemPrompt(session, promptId);
            const newSummary: Summary = {
                summary: await this.getLlmSummary(session, prompt, agent),
                label: session.title || session.id,
                sessionId: session.id,
                id: summaryId
            };
            await this.storageService.store(newSummary);
            return summaryId;
        } catch (err) {
            summaryDeferred.reject(err);
            const errorSummary: Summary = {
                summary: `Summary creation failed: ${err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'}`,
                label: session.title || session.id,
                sessionId: session.id,
                id: summaryId
            };
            await this.storageService.store(errorSummary);
            throw err;
        } finally {
            progress.cancel();
            this.pendingSummaries.delete(session.id);
        }
    }

    async update(session: ChatSession, promptId?: string, agent?: ChatAgent, override = true): Promise<string> {
        // Get the existing summary for the session
        const existingSummary = this.getSummaryForSession(session);
        if (!existingSummary) {
            // If no summary exists, create one instead
            // TODO: Maybe we could also look into the task context folder and ask for the existing ones with an additional menu to create a new one?
            return this.summarize(session, promptId, agent, override);
        }

        const progress = await this.progressService.showProgress({ text: `Updating: ${session.title || session.id}`, options: { location: 'ai-chat' } });
        try {
            const prompt = await this.getSystemPrompt(session, promptId);
            if (!prompt) {
                return '';
            }

            // Get the task context file path
            const taskContextStorageDirectory = this.preferenceService.get(
                // preference key is defined in TASK_CONTEXT_STORAGE_DIRECTORY_PREF in @theia/ai-ide
                'ai-features.promptTemplates.taskContextStorageDirectory',
                '.prompts/task-contexts'
            );
            const taskContextFileVariable = session.model.context.getVariables().find(variableReq => variableReq.variable.id === 'file-provider' &&
                typeof variableReq.arg === 'string' &&
                (variableReq.arg.startsWith(taskContextStorageDirectory)));

            // Check if we have a document path to update
            if (taskContextFileVariable && typeof taskContextFileVariable.arg === 'string') {
                // Set document path in prompt template
                const documentPath = taskContextFileVariable.arg;

                // Modify prompt to include the document path and content
                prompt.text = prompt.text + '\nThe document to update is: ' + documentPath + '\n\n## Current Document Content\n\n' + existingSummary.summary;

                // Get updated document content from LLM
                const updatedDocumentContent = await this.getLlmSummary(session, prompt, agent);

                if (existingSummary.uri) {
                    // updated document metadata shall be updated.
                    // otherwise, frontmatter won't be set
                    const frontmatter = {
                        sessionId: existingSummary.sessionId,
                        date: new Date().toISOString(),
                        label: existingSummary.label,
                    };
                    const content = yaml.dump(frontmatter).trim() + `${EOL}---${EOL}` + updatedDocumentContent;

                    session.model.changeSet.addElements(this.fileChangeFactory({
                        uri: existingSummary.uri,
                        type: 'modify',
                        state: 'pending',
                        targetState: content,
                        requestId: session.model.id, // not a request id, as no changeRequest made yet.
                        chatSessionId: session.id
                    }));
                } else {
                    const updatedSummary: Summary = {
                        ...existingSummary,
                        summary: updatedDocumentContent
                    };

                    // Store the updated summary
                    await this.storageService.store(updatedSummary);
                }
                return existingSummary.id;
            } else {
                // Fall back to standard update if no document path is found
                const updatedSummaryText = await this.getLlmSummary(session, prompt, agent);
                const updatedSummary: Summary = {
                    ...existingSummary,
                    summary: updatedSummaryText
                };
                await this.storageService.store(updatedSummary);
                return updatedSummary.id;
            }
        } catch (err) {
            const errorSummary: Summary = {
                ...existingSummary,
                summary: `Summary update failed: ${err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'}`
            };
            await this.storageService.store(errorSummary);
            throw err;
        } finally {
            progress.cancel();
        }
    }

    protected async getLlmSummary(session: ChatSession, prompt: ResolvedPromptFragment | undefined, agent?: ChatAgent): Promise<string> {
        if (!prompt) { return ''; }
        agent = agent || this.agentService.getAgents().find<ChatAgent>((candidate): candidate is ChatAgent =>
            'invoke' in candidate
            && typeof candidate.invoke === 'function'
            && candidate.id === ChatSessionSummaryAgent.ID
        );
        if (!agent) { throw new Error('Unable to identify agent for summary.'); }
        const model = new MutableChatModel(ChatAgentLocation.Panel);

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

    protected async getSystemPrompt(session: ChatSession, promptId: string = CHAT_SESSION_SUMMARY_PROMPT.id): Promise<ResolvedPromptFragment | undefined> {
        const prompt = await this.promptService.getResolvedPromptFragment(promptId || CHAT_SESSION_SUMMARY_PROMPT.id, undefined, { model: session.model });
        return prompt;
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
