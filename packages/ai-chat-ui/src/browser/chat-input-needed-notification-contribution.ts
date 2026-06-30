// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { ChatService, ChatSession } from '@theia/ai-chat';
import { DisposableCollection } from '@theia/core';
import { ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { AGENT_NOTIFICATION_KIND_INPUT_NEEDED } from '@theia/ai-core';
import { AgentNotificationService } from '@theia/ai-core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { isChatSessionFocused } from './chat-session-focus';

interface SessionWaitingState {
    /** Whether any request in the session was waiting for input at the last observed change. */
    waiting: boolean;
    listener: DisposableCollection;
}

/**
 * Fires an agent notification when a chat session starts waiting for user input (e.g. a tool
 * confirmation or an agent question). Watches all sessions, not just the active one, so that a
 * background session requesting input still reaches the user. The agent completion notification
 * (handled in the chat input widget) and this input-needed notification share the same delivery
 * channel and user preference via {@link AgentNotificationService}.
 */
@injectable()
export class ChatInputNeededNotificationContribution implements FrontendApplicationContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AgentNotificationService)
    protected readonly notificationService: AgentNotificationService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected readonly states = new Map<string, SessionWaitingState>();

    onStart(): void {
        this.chatService.getSessions().forEach(session => this.watchSession(session));
        this.chatService.onSessionEvent(event => {
            if (event.type === 'created') {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.watchSession(session);
                }
            } else if (event.type === 'deleted') {
                this.unwatchSession(event.sessionId);
            }
        });
    }

    protected watchSession(session: ChatSession): void {
        if (this.states.has(session.id)) {
            return;
        }
        const state: SessionWaitingState = {
            waiting: session.model.getRequests().some(request => request.response.isWaitingForInput),
            listener: new DisposableCollection()
        };
        this.states.set(session.id, state);
        session.model.onDidChange(() => this.handleSessionChanged(session, state), undefined, state.listener);
    }

    protected handleSessionChanged(session: ChatSession, state: SessionWaitingState): void {
        const waitingRequest = session.model.getRequests().find(request => request.response.isWaitingForInput);
        const nowWaiting = waitingRequest !== undefined;
        // Only notify on the transition into waiting, so repeated model changes while still
        // waiting do not produce duplicate notifications.
        if (nowWaiting && !state.waiting) {
            const agentId = waitingRequest.agentId ?? waitingRequest.response.agentId;
            if (agentId) {
                this.notificationService.showNotification(agentId, AGENT_NOTIFICATION_KIND_INPUT_NEEDED, {
                    shouldSuppress: () => isChatSessionFocused(this.shell, this.chatService, session.id),
                    onActivate: () => this.chatService.setActiveSession(session.id, { focus: true }),
                    sessionTitle: session.title
                });
            }
        }
        state.waiting = nowWaiting;
    }

    protected unwatchSession(sessionId: string): void {
        const state = this.states.get(sessionId);
        if (state) {
            state.listener.dispose();
            this.states.delete(sessionId);
        }
    }
}
