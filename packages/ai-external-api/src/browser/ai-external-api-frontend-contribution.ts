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

import { ChatChangeEvent } from '@theia/ai-chat/lib/common/chat-model';
import {
    ChatService, ChatSession, isActiveSessionChangedEvent, isSessionCreatedEvent, isSessionDeletedEvent
} from '@theia/ai-chat/lib/common/chat-service';
import { Disposable } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import debounce = require('@theia/core/shared/lodash.debounce');
import { ExternalChatSessionBackendService } from '../common/external-chat-session-provider';

/**
 * Connects this frontend to the external session API of the backend.
 *
 * Injecting the {@link ExternalChatSessionBackendService} proxy on application start eagerly
 * establishes the RPC connection through which the backend queries this frontend for session
 * information. In the other direction, this contribution observes the frontend's chat sessions
 * and notifies the backend about changes that are visible to external API clients (session
 * lifecycle, titles, and status), debounced to coalesce bursts of changes.
 */
@injectable()
export class AIExternalApiFrontendContribution implements FrontendApplicationContribution {

    /** Debounce delay in milliseconds for change notifications to the backend. */
    protected readonly notifyDelay = 200;
    /** Maximum time in milliseconds a continuously changing session may defer a notification. */
    protected readonly notifyMaxDelay = 1000;

    @inject(ExternalChatSessionBackendService)
    protected readonly backendService: ExternalChatSessionBackendService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    /** Status listeners per tracked session, disposed when the session is deleted. */
    protected readonly sessionListeners = new Map<string, Disposable>();

    protected readonly notifyBackend = debounce(
        () => this.backendService.notifySessionsChanged(),
        this.notifyDelay,
        { maxWait: this.notifyMaxDelay }
    );

    onStart(): void {
        this.chatService.onSessionEvent(event => {
            if (isActiveSessionChangedEvent(event)) {
                // which session is active is not visible to external API clients
                return;
            }
            if (isSessionCreatedEvent(event)) {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.trackSession(session);
                }
            } else if (isSessionDeletedEvent(event)) {
                this.sessionListeners.get(event.sessionId)?.dispose();
                this.sessionListeners.delete(event.sessionId);
            }
            this.notifyBackend();
        });
        this.chatService.getSessions().forEach(session => this.trackSession(session));
    }

    /** Notifies the backend about status changes of the given session until the session is deleted. */
    protected trackSession(session: ChatSession): void {
        if (this.sessionListeners.has(session.id)) {
            return;
        }
        this.sessionListeners.set(session.id, session.model.onDidChange(event => {
            if (ChatChangeEvent.isStatusChangedEvent(event)) {
                this.notifyBackend();
            }
        }));
    }
}
