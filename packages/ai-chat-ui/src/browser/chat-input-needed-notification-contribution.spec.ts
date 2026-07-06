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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser';
import {
    ChatChangeEvent,
    ChatModel,
    ChatRequestModel,
    ChatService,
    ChatSession,
    ChatSessionStatus
} from '@theia/ai-chat';
import {
    AgentNotificationKind,
    AGENT_NOTIFICATION_KIND_INPUT_NEEDED
} from '@theia/ai-core';
import { AgentNotificationService, AgentNotificationOptions } from '@theia/ai-core/lib/browser';
import { ChatInputNeededNotificationContribution } from './chat-input-needed-notification-contribution';

disableJSDOM();

interface FakeRequest {
    agentId?: string;
    response: { agentId?: string };
}

interface NotificationCall {
    agentId: string;
    kind: AgentNotificationKind;
    options?: AgentNotificationOptions;
}

class FakeChatModel {
    readonly id = 'test-model';
    protected readonly emitter = new Emitter<ChatChangeEvent>();
    readonly onDidChange = this.emitter.event;
    status: ChatSessionStatus = 'idle';
    requests: FakeRequest[] = [];

    getRequests(): ChatRequestModel[] {
        return this.requests as unknown as ChatRequestModel[];
    }

    setStatus(status: ChatSessionStatus): void {
        this.status = status;
        this.emitter.fire({ kind: 'statusChanged', status });
    }

    fireResponseChanged(): void {
        this.emitter.fire({ kind: 'responseChanged' });
    }
}

function createSession(id: string, model: FakeChatModel, title = 'Session ' + id): ChatSession {
    return {
        id,
        title,
        model: model as unknown as ChatModel,
        isActive: false
    };
}

class TestableContribution extends ChatInputNeededNotificationContribution {
    // Expose protected hooks so we can drive the contribution from tests without going through DI.
    setChatService(service: ChatService): void {
        (this as unknown as { chatService: ChatService }).chatService = service;
    }
    setNotificationService(service: AgentNotificationService): void {
        (this as unknown as { notificationService: AgentNotificationService }).notificationService = service;
    }
    setShell(shell: ApplicationShell): void {
        (this as unknown as { shell: ApplicationShell }).shell = shell;
    }
}

describe('ChatInputNeededNotificationContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let contribution: TestableContribution;
    let chatModel: FakeChatModel;
    let session: ChatSession;
    let notifications: NotificationCall[];
    let chatService: ChatService;
    let sessionEventEmitter: Emitter<unknown>;

    beforeEach(() => {
        chatModel = new FakeChatModel();
        session = createSession('session-1', chatModel);

        notifications = [];
        const notificationService = {
            async showNotification(agentId: string, kind: AgentNotificationKind, options?: AgentNotificationOptions): Promise<void> {
                notifications.push({ agentId, kind, options });
            }
        } as unknown as AgentNotificationService;

        sessionEventEmitter = new Emitter<unknown>();
        chatService = {
            getSessions: () => [session],
            getSession: (id: string) => (id === session.id ? session : undefined),
            onSessionEvent: sessionEventEmitter.event,
            setActiveSession: () => { /* no-op */ }
        } as unknown as ChatService;

        const shell = { currentWidget: undefined } as unknown as ApplicationShell;

        contribution = new TestableContribution();
        contribution.setChatService(chatService);
        contribution.setNotificationService(notificationService);
        contribution.setShell(shell);
        contribution.onStart();
    });

    it('fires a notification on the transition into a waiting status', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('awaitingInput');

        expect(notifications).to.have.lengthOf(1);
        expect(notifications[0].agentId).to.equal('agent-a');
        expect(notifications[0].kind).to.equal(AGENT_NOTIFICATION_KIND_INPUT_NEEDED);
        expect(notifications[0].options?.sessionTitle).to.equal(session.title);
    });

    it('fires a notification when a tool approval is needed', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('awaitingApproval');

        expect(notifications).to.have.lengthOf(1);
        expect(notifications[0].kind).to.equal(AGENT_NOTIFICATION_KIND_INPUT_NEEDED);
    });

    it('does not re-fire when switching between waiting statuses', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('awaitingApproval');
        chatModel.setStatus('awaitingInput');

        expect(notifications).to.have.lengthOf(1);
    });

    it('fires again after the waiting state cleared and then started again', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('awaitingInput');

        // The waiting state clears — e.g. the question was answered.
        chatModel.setStatus('running');

        // The agent asks for a tool approval next.
        chatModel.setStatus('awaitingApproval');

        expect(notifications).to.have.lengthOf(2);
    });

    it('does not fire for statuses that do not require user action', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('running');
        chatModel.setStatus('awaitingToolCall');
        chatModel.setStatus('idle');
        chatModel.setStatus('failed');

        expect(notifications).to.have.lengthOf(0);
    });

    it('ignores model changes that are not status changes', () => {
        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.status = 'awaitingInput';
        chatModel.fireResponseChanged();

        expect(notifications).to.have.lengthOf(0);
    });

    it('falls back to the response.agentId when the request has no agentId', () => {
        chatModel.requests = [{
            response: { agentId: 'response-agent' }
        }];
        chatModel.setStatus('awaitingInput');

        expect(notifications).to.have.lengthOf(1);
        expect(notifications[0].agentId).to.equal('response-agent');
    });

    it('does not fire when no agent id is available on the waiting request', () => {
        chatModel.requests = [{
            response: {}
        }];
        chatModel.setStatus('awaitingInput');

        expect(notifications).to.have.lengthOf(0);
    });

    it('does not double-watch a session when a created event arrives after onStart', () => {
        // The session was already returned from getSessions() in onStart, so re-watching it via
        // the 'created' event must not install a second listener that would fire duplicate
        // notifications.
        sessionEventEmitter.fire({ type: 'created', sessionId: session.id });

        chatModel.requests = [{
            agentId: 'agent-a',
            response: {}
        }];
        chatModel.setStatus('awaitingInput');

        expect(notifications).to.have.lengthOf(1);
    });
});
