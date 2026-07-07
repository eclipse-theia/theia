// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { ChatChangeEvent, ChatService, ChatSession, ChatSessionStatus } from '@theia/ai-chat';
import { DisposableCollection } from '@theia/core';
import { ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { AgentNotificationKind, AGENT_NOTIFICATION_KIND_COMPLETED, AGENT_NOTIFICATION_KIND_INPUT_NEEDED } from '@theia/ai-core';
import { AgentNotificationService } from '@theia/ai-core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { isChatSessionFocused } from './chat-session-focus';

interface SessionNotificationState {
    /** Whether the session status required user action at the last observed status change. */
    waiting: boolean;
    /** Whether a request was in progress at the last observed status change. */
    inProgress: boolean;
    listener: DisposableCollection;
}

/**
 * Fires agent notifications on chat session status transitions: when a session starts waiting
 * for user action (a tool approval or another input) and when a session finishes its request
 * (successfully or with an error). Watches all sessions, not just the active one, so that
 * background sessions still reach the user.
 *
 * Delegated sessions (created by the agent delegation tool on behalf of a parent session) are
 * excluded: their interactions bubble into the parent session's UI, so they must not produce
 * their own notifications.
 */
@injectable()
export class ChatSessionNotificationContribution implements FrontendApplicationContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AgentNotificationService)
    protected readonly notificationService: AgentNotificationService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    protected readonly states = new Map<string, SessionNotificationState>();

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
        const state: SessionNotificationState = {
            waiting: ChatSessionStatus.requiresUserAction(session.model.status),
            inProgress: ChatSessionStatus.isInProgress(session.model.status),
            listener: new DisposableCollection()
        };
        this.states.set(session.id, state);
        session.model.onDidChange(event => {
            if (ChatChangeEvent.isStatusChangedEvent(event)) {
                this.handleStatusChanged(session, state, event.status);
            }
        }, undefined, state.listener);
    }

    protected handleStatusChanged(session: ChatSession, state: SessionNotificationState, status: ChatSessionStatus): void {
        const nowWaiting = ChatSessionStatus.requiresUserAction(status);
        const nowInProgress = ChatSessionStatus.isInProgress(status);
        // The status only changes on actual transitions, so switching between the waiting
        // states (e.g. approval, then a question) does not produce duplicate notifications.
        const startedWaiting = nowWaiting && !state.waiting;
        const completed = !nowInProgress && state.inProgress;
        state.waiting = nowWaiting;
        state.inProgress = nowInProgress;

        // Checked per event rather than in watchSession: the delegation tool assigns
        // rootSessionId only after the session-created event has already fired.
        if (this.isDelegatedSession(session)) {
            return;
        }

        if (startedWaiting) {
            this.notify(session, AGENT_NOTIFICATION_KIND_INPUT_NEEDED);
        } else if (completed) {
            this.notify(session, AGENT_NOTIFICATION_KIND_COMPLETED);
        }
    }

    protected isDelegatedSession(session: ChatSession): boolean {
        return session.model.rootSessionId !== undefined;
    }

    protected notify(session: ChatSession, kind: AgentNotificationKind): void {
        // The session status is derived from the last request, so that is the one to report.
        const lastRequest = session.model.getRequests().at(-1);
        const agentId = lastRequest?.agentId ?? lastRequest?.response.agentId;
        if (agentId) {
            this.notificationService.showNotification(agentId, kind, {
                shouldSuppress: () => isChatSessionFocused(this.shell, this.chatService, session.id),
                onActivate: () => this.chatService.setActiveSession(session.id, { focus: true }),
                sessionTitle: session.title
            });
        }
    }

    protected unwatchSession(sessionId: string): void {
        const state = this.states.get(sessionId);
        if (state) {
            state.listener.dispose();
            this.states.delete(sessionId);
        }
    }
}
