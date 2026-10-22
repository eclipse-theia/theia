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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { ChatChangeEvent } from '@theia/ai-chat/lib/common/chat-model';
import { ChatService, ChatSession } from '@theia/ai-chat/lib/common/chat-service';
import { Emitter } from '@theia/core';
import { expect } from 'chai';
import { AIExternalApiFrontendContribution } from './ai-external-api-frontend-contribution';

disableJSDOM();

type SessionEvent = Parameters<Parameters<ChatService['onSessionEvent']>[0]>[0];

describe('AIExternalApiFrontendContribution', () => {

    interface TrackedSession {
        session: ChatSession;
        fireStatusChanged(): void;
        fireOtherModelChange(): void;
    }

    function trackedSession(id: string): TrackedSession {
        const modelChanges = new Emitter<ChatChangeEvent>();
        return {
            session: { id, model: { onDidChange: modelChanges.event } } as unknown as ChatSession,
            fireStatusChanged: () => modelChanges.fire({ kind: 'statusChanged' } as ChatChangeEvent),
            fireOtherModelChange: () => modelChanges.fire({ kind: 'responseChanged' } as ChatChangeEvent)
        };
    }

    interface ContributionContext {
        sessionEvents: Emitter<SessionEvent>;
        addSession(tracked: TrackedSession): void;
        removeSession(id: string): void;
        notifications(): number;
    }

    function startContribution(initialSessions: TrackedSession[] = []): ContributionContext {
        const sessionEvents = new Emitter<SessionEvent>();
        const sessions = [...initialSessions];
        const chatService = {
            onSessionEvent: sessionEvents.event,
            getSessions: () => sessions.map(tracked => tracked.session),
            getSession: (id: string) => sessions.find(tracked => tracked.session.id === id)?.session
        } as unknown as ChatService;
        let count = 0;
        const contribution = new AIExternalApiFrontendContribution();
        (contribution as unknown as Record<string, unknown>)['chatService'] = chatService;
        (contribution as unknown as Record<string, unknown>)['backendService'] = { notifySessionsChanged: () => count++ };
        contribution.onStart();
        return {
            sessionEvents,
            addSession: tracked => sessions.push(tracked),
            removeSession: id => sessions.splice(sessions.findIndex(tracked => tracked.session.id === id), 1),
            notifications: () => count
        };
    }

    /** Waits long enough for a debounced notification to be delivered. */
    function settle(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 300));
    }

    it('notifies the backend when a session is created', async () => {
        const context = startContribution();
        context.addSession(trackedSession('1'));
        context.sessionEvents.fire({ type: 'created', sessionId: '1' });
        await settle();
        expect(context.notifications()).to.equal(1);
    });

    it('notifies the backend on session status changes', async () => {
        const tracked = trackedSession('1');
        const context = startContribution([tracked]);
        tracked.fireStatusChanged();
        await settle();
        expect(context.notifications()).to.equal(1);
    });

    it('coalesces bursts of changes into a single notification', async () => {
        const tracked = trackedSession('1');
        const context = startContribution([tracked]);
        context.sessionEvents.fire({ type: 'renamed', sessionId: '1' });
        tracked.fireStatusChanged();
        tracked.fireStatusChanged();
        await settle();
        expect(context.notifications()).to.equal(1);
    });

    it('ignores changes that are not visible to external clients', async () => {
        const tracked = trackedSession('1');
        const context = startContribution([tracked]);
        context.sessionEvents.fire({ type: 'activeChange', sessionId: '1' });
        tracked.fireOtherModelChange();
        await settle();
        expect(context.notifications()).to.equal(0);
    });

    it('stops observing deleted sessions', async () => {
        const tracked = trackedSession('1');
        const context = startContribution([tracked]);
        context.removeSession('1');
        context.sessionEvents.fire({ type: 'deleted', sessionId: '1' });
        await settle();
        expect(context.notifications()).to.equal(1);
        tracked.fireStatusChanged();
        await settle();
        expect(context.notifications()).to.equal(1);
    });
});
