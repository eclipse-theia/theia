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

import { CommunicationRecordingService } from '@theia/ai-core';
import { DisposableCollection } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatHistoryEntry } from './chat-history-entry';
import {
    ActiveSessionChangedEvent,
    ChatService,
    isSessionCreatedEvent,
    isSessionDeletedEvent,
    SessionCreatedEvent,
    SessionDeletedEvent
} from './chat-service';

@injectable()
export class ChatCommunicationRecorder {
    private readonly chatModelListeners = new Map<string, DisposableCollection>();
    private readonly trackedSessions = new Set<string>();
    private readonly recordedResponses = new Set<string>();

    @inject(ChatService)
    private readonly chatService: ChatService;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    @postConstruct()
    protected initialize(): void {
        this.chatService.onSessionEvent(this.handleSessionEvent.bind(this));
    }

    private handleSessionEvent(event: ActiveSessionChangedEvent | SessionCreatedEvent | SessionDeletedEvent): void {
        if (isSessionCreatedEvent(event)) {
            this.setupSessionListener(event.sessionId);
        } else if (isSessionDeletedEvent(event)) {
            this.cleanupSessionListener(event.sessionId);
        }
    }

    private setupSessionListener(sessionId: string): void {
        const session = this.chatService.getSession(sessionId);
        if (!session || this.trackedSessions.has(sessionId)) { return; }

        const toDispose = new DisposableCollection();
        this.trackedSessions.add(sessionId);
        this.chatModelListeners.set(session.id, toDispose);

        toDispose.push(
            session.model.onDidChange(modelChangeEvent => {
                if (modelChangeEvent.kind !== 'addRequest') { return; }

                const { request } = modelChangeEvent;
                const agentId = request.agentId || 'unknown';

                this.recordingService.recordRequest(ChatHistoryEntry.fromRequest(agentId, request));

                toDispose.push(
                    request.response.onDidChange(() => {
                        if (request.response.isComplete && !this.recordedResponses.has(request.id)) {
                            this.recordingService.recordResponse(ChatHistoryEntry.fromResponse(agentId, request));
                            this.recordedResponses.add(request.id);
                        }
                    })
                );
            })
        );
    }

    private cleanupSessionListener(sessionId: string): void {
        this.trackedSessions.delete(sessionId);
        this.chatModelListeners.get(sessionId)?.dispose();
        this.chatModelListeners.delete(sessionId);
    }
}
