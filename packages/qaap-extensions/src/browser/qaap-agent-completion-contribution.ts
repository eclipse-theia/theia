// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatService, ChatSession } from '@theia/ai-chat/lib/common/chat-service';
import { ChatChangeEvent } from '@theia/ai-chat/lib/common/chat-model';
import { QAAP_AGENT_COMPLETED_EVENT, QAAP_AGENT_CONFIRMATION_NEEDED_EVENT } from './qaap-push-notification-contribution';

/**
 * Bridges chat-agent completion to the Qaap notification pipeline: when a chat response
 * finishes, it fires {@link QAAP_AGENT_COMPLETED_EVENT}, which the local notification, window
 * blink and Web Push contributions already listen for. This is what lets a user background
 * the app, let the agent work, and be pinged when it is done.
 */
@injectable()
export class QaapAgentCompletionContribution implements FrontendApplicationContribution {

    @inject(ChatService)
    protected readonly chatService: ChatService;

    /** Response ids already announced — guards against the model firing repeatedly. */
    protected readonly notifiedResponses = new Set<string>();
    /** Confirmation content-part ids already announced — same prompt fires onDidChange repeatedly. */
    protected readonly notifiedConfirmations = new Set<string>();
    protected readonly hookedSessions = new Set<string>();
    protected readonly toDispose = new DisposableCollection();

    onStart(): void {
        for (const session of this.chatService.getSessions()) {
            this.hookSession(session);
        }
        this.toDispose.push(this.chatService.onSessionEvent(event => {
            if (event.type === 'created') {
                const session = this.chatService.getSession(event.sessionId);
                if (session) {
                    this.hookSession(session);
                }
            }
        }));
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected hookSession(session: ChatSession): void {
        if (this.hookedSessions.has(session.id)) {
            return;
        }
        this.hookedSessions.add(session.id);
        this.toDispose.push(session.model.onDidChange(event => {
            if (ChatChangeEvent.isInteractionNeededEvent(event)) {
                this.announceConfirmationNeeded(session, event.contentPart.interactionId);
                return;
            }
            this.checkLatestResponse(session);
        }));
    }

    protected announceConfirmationNeeded(session: ChatSession, interactionId: string | undefined): void {
        if (!interactionId) {
            return;
        }
        const key = `${session.id}:${interactionId}`;
        if (this.notifiedConfirmations.has(key)) {
            return;
        }
        this.notifiedConfirmations.add(key);
        const requests = session.model.getRequests();
        const latest = requests[requests.length - 1];
        window.dispatchEvent(new CustomEvent(QAAP_AGENT_CONFIRMATION_NEEDED_EVENT, {
            detail: { agentName: latest?.agentId },
        }));
    }

    protected checkLatestResponse(session: ChatSession): void {
        const requests = session.model.getRequests();
        const latest = requests[requests.length - 1];
        if (!latest) {
            return;
        }
        const response = latest.response;
        if (this.notifiedResponses.has(response.id)) {
            return;
        }
        // Only announce a genuine, successful completion — not cancellation or error.
        if (response.isComplete && !response.isCanceled && !response.isError) {
            this.notifiedResponses.add(response.id);
            window.dispatchEvent(new CustomEvent(QAAP_AGENT_COMPLETED_EVENT, {
                detail: { agentName: latest.agentId },
            }));
        }
    }
}
