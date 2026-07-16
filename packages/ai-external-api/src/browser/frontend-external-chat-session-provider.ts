// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatSessionStatus } from '@theia/ai-chat/lib/common/chat-model';
import { ChatService, ChatSession, NoChatAgentError } from '@theia/ai-chat/lib/common/chat-service';
import { ChatSessionMetadata } from '@theia/ai-chat/lib/common/chat-session-store';
import { ILogger } from '@theia/core/lib/common/logger';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    ExternalChatMessage, ExternalChatPrompt, ExternalChatPromptResult, ExternalChatSessionCreateRequest, ExternalChatSessionCreateResult,
    ExternalChatSessionDetail, ExternalChatSessionProvider, ExternalChatSessionSummary
} from '../common/external-chat-session-provider';

/**
 * Answers the backend's external session queries from this frontend's {@link ChatService}.
 *
 * Reports sessions that are restored (live) in this frontend with their full state, and
 * persisted sessions that have not been restored with their persisted metadata. Each session
 * is attributed to the workspace this frontend has opened.
 */
@injectable()
export class FrontendExternalChatSessionProvider implements ExternalChatSessionProvider {

    /** Number of trailing conversation lines included in a summary's preview. */
    protected readonly previewLineCount = 5;
    /** Maximum length of a single preview line; longer lines are truncated. */
    protected readonly previewLineLength = 200;

    @inject(ILogger) @named('ai-external-api:FrontendExternalChatSessionProvider')
    protected readonly logger: ILogger;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    async getSessions(): Promise<ExternalChatSessionSummary[]> {
        const workspace = await this.getWorkspaceUri();
        const restored = this.chatService.getSessions().map(session => this.toSummary(session, workspace));
        const restoredIds = new Set(restored.map(summary => summary.id));
        const persisted = (await this.getPersistedMetadata())
            .filter(metadata => !restoredIds.has(metadata.sessionId))
            .map(metadata => this.toPersistedSummary(metadata, workspace));
        return [...restored, ...persisted];
    }

    async getSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined> {
        const workspace = await this.getWorkspaceUri();
        const live = this.chatService.getSession(sessionId);
        if (live) {
            return this.toDetail(live, workspace);
        }
        const metadata = (await this.getPersistedMetadata()).find(candidate => candidate.sessionId === sessionId);
        return metadata && this.toPersistedSummary(metadata, workspace);
    }

    async openSession(sessionId: string): Promise<boolean> {
        const session = await this.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return false;
        }
        this.chatService.setActiveSession(sessionId, { focus: true });
        return true;
    }

    async restoreSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined> {
        const session = await this.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return undefined;
        }
        return this.toDetail(session, await this.getWorkspaceUri());
    }

    async sendPrompt(sessionId: string, prompt: ExternalChatPrompt): Promise<ExternalChatPromptResult | undefined> {
        const session = await this.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return undefined;
        }
        if (!prompt.interrupt && ChatSessionStatus.isInProgress(session.model.status)) {
            return { failure: 'busy' };
        }
        // an in-progress request is canceled by sendRequest itself when interrupting
        const invocation = await this.chatService.sendRequest(sessionId, { text: prompt.text });
        if (!invocation) {
            return undefined;
        }
        try {
            return { sent: { sessionId, requestId: (await invocation.requestCompleted).id } };
        } catch (error) {
            if (NoChatAgentError.is(error)) {
                return { failure: 'noAgent' };
            }
            // unexpected failure: propagate to the backend, which logs it and falls back to another frontend
            throw error;
        }
    }

    async createSession(request: ExternalChatSessionCreateRequest): Promise<ExternalChatSessionCreateResult> {
        let agent: ChatAgent | undefined;
        if (request.agentId) {
            agent = this.agentService.getAgent(request.agentId, true);
            if (!agent) {
                return { failure: 'unknownAgent' };
            }
        }
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: request.focus }, agent);
        let requestId: string | undefined;
        if (request.prompt) {
            const invocation = await this.chatService.sendRequest(session.id, { text: request.prompt });
            try {
                requestId = invocation && (await invocation.requestCompleted).id;
            } catch (error) {
                // do not keep the unusable session when its initial prompt failed
                await this.chatService.deleteSession(session.id);
                if (NoChatAgentError.is(error)) {
                    return { failure: 'noAgent' };
                }
                // unexpected failure: propagate to the backend, which logs it and falls back to another frontend
                throw error;
            }
        }
        const created = this.chatService.getSession(session.id) ?? session;
        return { created: { session: this.toSummary(created, await this.getWorkspaceUri()), requestId } };
    }

    async getWorkspace(): Promise<string | undefined> {
        return this.getWorkspaceUri();
    }

    protected async getWorkspaceUri(): Promise<string | undefined> {
        await this.workspaceService.ready;
        return this.workspaceService.workspace?.resource.toString();
    }

    /** Returns the metadata of all persisted sessions, or an empty list if reading the persisted index fails. */
    protected async getPersistedMetadata(): Promise<ChatSessionMetadata[]> {
        try {
            return Object.values(await this.chatService.getPersistedSessions());
        } catch (error) {
            this.logger.warn('Failed to read the persisted chat sessions, reporting only restored sessions.', error);
            return [];
        }
    }

    protected toDetail(session: ChatSession, workspace: string | undefined): ExternalChatSessionDetail {
        return {
            ...this.toSummary(session, workspace),
            messages: this.toMessages(session)
        };
    }

    protected toSummary(session: ChatSession, workspace: string | undefined): ExternalChatSessionSummary {
        return {
            id: session.id,
            title: session.title,
            status: session.model.status,
            lastInteraction: session.lastInteraction?.getTime(),
            workspace,
            preview: this.toPreview(session),
            agentId: session.pinnedAgent?.id,
            agentName: session.pinnedAgent?.name,
            restored: true
        };
    }

    /** Reduces the metadata of a persisted session that is not restored to a summary. */
    protected toPersistedSummary(metadata: ChatSessionMetadata, workspace: string | undefined): ExternalChatSessionSummary {
        return {
            id: metadata.sessionId,
            title: metadata.title || undefined,
            status: metadata.hasError ? 'failed' : 'idle',
            lastInteraction: metadata.saveDate,
            workspace,
            agentId: metadata.pinnedAgentId,
            agentName: metadata.pinnedAgentId ? this.agentService.getAgent(metadata.pinnedAgentId, true)?.name : undefined,
            restored: false
        };
    }

    /**
     * Reduces the session's conversation to plain-text messages, similar to the message history
     * sent to the language model for the next request. In-progress responses are included with
     * their content so far.
     */
    protected toMessages(session: ChatSession): ExternalChatMessage[] {
        const messages: ExternalChatMessage[] = [];
        for (const request of session.model.getRequests()) {
            if (request.request.text) {
                messages.push({ actor: 'user', text: request.request.text });
            }
            const response = request.response.response.asDisplayString();
            if (response) {
                messages.push({ actor: 'ai', text: response });
            }
        }
        return messages;
    }

    /** Returns the last few non-empty lines of the conversation, or `undefined` for an empty conversation. */
    protected toPreview(session: ChatSession): string | undefined {
        const lines = this.toMessages(session)
            .flatMap(message => message.text.split('\n'))
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .slice(-this.previewLineCount)
            .map(line => line.length > this.previewLineLength ? `${line.substring(0, this.previewLineLength)}…` : line);
        return lines.length > 0 ? lines.join('\n') : undefined;
    }
}
