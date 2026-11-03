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
import { MaybePromise, ProgressService, URI, generateUuid, Event, nls } from '@theia/core';
import { ChatAgent, ChatService, ChatSession } from '../common';

import { Deferred } from '@theia/core/lib/common/promise-util';
import { ChatSessionSummarizer } from './chat-session-summarizer';

export interface SummaryMetadata {
    id?: string;
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
    get(identifier: string): MaybePromise<Summary | undefined>;
    delete(identifier: string): MaybePromise<boolean>;
    open(identifier: string): Promise<void>;
}

@injectable()
export class TaskContextService {

    protected pendingSummaries = new Map<string, Promise<Summary>>();

    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(ChatSessionSummarizer) protected readonly summarizer: ChatSessionSummarizer;
    @inject(TaskContextStorageService) protected readonly storageService: TaskContextStorageService;
    @inject(ProgressService) protected readonly progressService: ProgressService;

    get onDidChange(): Event<void> {
        return this.storageService.onDidChange;
    }

    getAll(): Array<Summary> {
        return this.storageService.getAll();
    }

    async getSummary(sessionIdOrFilePath: string): Promise<string> {
        const existing = await this.storageService.get(sessionIdOrFilePath);
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
        const progress = await this.progressService.showProgress({
            text: nls.localize('theia/ai/chat/taskContextService/summarizeProgressMessage', 'Summarize: {0}', session.title || session.id),
            options: { location: 'ai-chat' }
        });
        this.pendingSummaries.set(session.id, summaryDeferred.promise);
        try {
            const { summary } = await this.summarizer.summarize(session.model, { promptId, agent });
            const newSummary: Summary = {
                summary,
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

    hasSummary(chatSession: ChatSession): boolean {
        return !!this.getSummaryForSession(chatSession);
    }

    protected getSummaryForSession(chatSession: ChatSession): Summary | undefined {
        return this.storageService.getAll().find(candidate => candidate.sessionId === chatSession.id);
    }

    getLabel(id: string): string | undefined {
        // Labels are metadata that don't need fresh file reads
        return this.storageService.getAll().find(s => s.id === id)?.label;
    }

    open(id: string): Promise<void> {
        return this.storageService.open(id);
    }
}
