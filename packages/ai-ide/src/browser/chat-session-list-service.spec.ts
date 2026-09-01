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
import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { ChatAgentLocation, ChatService, ChatSession, ChatSessionMetadata, ChatSessionStatus } from '@theia/ai-chat';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { ApplicationShell, Widget } from '@theia/core/lib/browser';
import { ChatSessionListService } from './chat-session-list-service';
import { SectionedSessions, SessionRow, computeVisibleSessionSlots } from './chat-session-list-components';
disableJSDOM();

/**
 * Subclass that exposes the protected watch hook and lets tests inject fake services.
 * We don't go through inversify here because the only behaviour under test is the
 * unread bookkeeping; spinning up the full container would pull in unrelated
 * services and obscure the assertion.
 */
class TestableService extends ChatSessionListService {
    constructor(chatService: ChatService, shell: ApplicationShell) {
        super();
        (this as unknown as { chatService: ChatService }).chatService = chatService;
        (this as unknown as { shell: ApplicationShell }).shell = shell;
    }

    watch(session: ChatSession): void {
        this.watchSession(session);
    }
}

interface RequestStub {
    response: { isComplete: boolean };
}

function createFakeSession(id: string): {
    session: ChatSession;
    fire: () => void;
    pushRequest: (complete: boolean) => void;
} {
    const requests: RequestStub[] = [];
    const onDidChangeEmitter = new Emitter<unknown>();
    const session = {
        id,
        isActive: false,
        model: {
            status: 'idle' as ChatSessionStatus,
            getRequests: () => requests,
            onDidChange: onDidChangeEmitter.event,
        }
    } as unknown as ChatSession;
    return {
        session,
        fire: () => onDidChangeEmitter.fire(undefined),
        pushRequest: complete => requests.push({ response: { isComplete: complete } })
    };
}

describe('ChatSessionListService', () => {

    describe('unread state', () => {
        let activeSessionId: string | undefined;
        let activeWidget: unknown;
        let widgetForActiveElement: Widget | undefined;
        let chatService: ChatService;
        let shell: ApplicationShell;
        let chatViewWidget: ChatViewWidget;
        let otherWidget: object;

        before(() => {
            disableJSDOM = enableJSDOM();
        });
        after(() => {
            disableJSDOM();
        });

        beforeEach(() => {
            activeSessionId = undefined;
            chatViewWidget = Object.create(ChatViewWidget.prototype) as ChatViewWidget;
            otherWidget = {};
            activeWidget = undefined;
            widgetForActiveElement = undefined;
            // ChatViewWidget.findActive consults document.activeElement. Provide an HTMLElement
            // so the lookup path through shell.findWidgetForElement is exercised.
            const focusTarget = document.createElement('div');
            document.body.appendChild(focusTarget);
            focusTarget.tabIndex = -1;
            focusTarget.focus();
            chatService = {
                getActiveSession: () => activeSessionId ? { id: activeSessionId } as ChatSession : undefined,
            } as unknown as ChatService;
            shell = {
                get activeWidget(): unknown {
                    return activeWidget;
                },
                findWidgetForElement: () => widgetForActiveElement
            } as unknown as ApplicationShell;
        });

        it('marks the session unread when a new request arrives and the chat view is not focused', () => {
            const service = new TestableService(chatService, shell);
            const { session, fire, pushRequest } = createFakeSession('s1');
            activeSessionId = 's1';
            activeWidget = otherWidget;

            service.watch(session);
            pushRequest(true);
            fire();

            expect(service.isUnread('s1')).to.equal(true);
        });

        it('does not mark unread when the session is active AND the chat view is focused', () => {
            const service = new TestableService(chatService, shell);
            const { session, fire, pushRequest } = createFakeSession('s1');
            activeSessionId = 's1';
            activeWidget = chatViewWidget;

            service.watch(session);
            pushRequest(true);
            fire();

            expect(service.isUnread('s1')).to.equal(false);
        });

        it('does not mark unread when focus is inside a child widget of the chat view', () => {
            const service = new TestableService(chatService, shell);
            const { session, fire, pushRequest } = createFakeSession('s1');
            activeSessionId = 's1';
            // Simulate focus inside a descendant (e.g. AIChatInputWidget): the shell's
            // activeWidget is the inner widget, but its parent chain leads to ChatViewWidget.
            const childWidget = { parent: chatViewWidget } as unknown as Widget;
            activeWidget = childWidget;
            widgetForActiveElement = childWidget;

            service.watch(session);
            pushRequest(true);
            fire();

            expect(service.isUnread('s1')).to.equal(false);
        });

        it('marks unread when the session is not the active one, even if the chat view is focused', () => {
            const service = new TestableService(chatService, shell);
            const { session, fire, pushRequest } = createFakeSession('s1');
            activeSessionId = 'other';
            activeWidget = chatViewWidget;

            service.watch(session);
            pushRequest(true);
            fire();

            expect(service.isUnread('s1')).to.equal(true);
        });

        it('fires onUnreadChanged once when a session transitions to unread', () => {
            const service = new TestableService(chatService, shell);
            const { session, fire, pushRequest } = createFakeSession('s1');
            activeSessionId = undefined;
            activeWidget = otherWidget;

            let fired = 0;
            service.onUnreadChanged(() => { fired++; });

            service.watch(session);
            pushRequest(true);
            fire();
            pushRequest(true);
            fire();

            expect(service.isUnread('s1')).to.equal(true);
            expect(fired).to.equal(1);
        });
    });

    describe('computeVisibleSessionSlots', () => {

        it('hides the inline list when the cap is 0', () => {
            expect(computeVisibleSessionSlots(10, 10, 0)).to.deep.equal({ activeCount: 0, restoredCount: 0 });
        });

        it('clamps a negative cap to 0', () => {
            expect(computeVisibleSessionSlots(10, 10, -5)).to.deep.equal({ activeCount: 0, restoredCount: 0 });
        });

        it('caps active when there are no restored sessions', () => {
            expect(computeVisibleSessionSlots(30, 0, 20)).to.deep.equal({ activeCount: 20, restoredCount: 0 });
        });

        it('shows all active when below the cap and there are no restored sessions', () => {
            expect(computeVisibleSessionSlots(5, 0, 20)).to.deep.equal({ activeCount: 5, restoredCount: 0 });
        });

        it('caps restored when there are no active sessions', () => {
            expect(computeVisibleSessionSlots(0, 30, 20)).to.deep.equal({ activeCount: 0, restoredCount: 20 });
        });

        it('reserves up to 5 restored slots when both sections overflow the cap', () => {
            // 5 slots reserved for restored, the remaining 15 go to active.
            expect(computeVisibleSessionSlots(20, 10, 20)).to.deep.equal({ activeCount: 15, restoredCount: 5 });
        });

        it('only reserves as many restored slots as there are restored sessions', () => {
            // Just 3 restored exist, so active gets the other 17.
            expect(computeVisibleSessionSlots(20, 3, 20)).to.deep.equal({ activeCount: 17, restoredCount: 3 });
        });

        it('gives leftover slots to restored when active does not fill its share', () => {
            // Total (12) fits under the cap, so everything is shown.
            expect(computeVisibleSessionSlots(2, 10, 20)).to.deep.equal({ activeCount: 2, restoredCount: 10 });
        });

        it('shows everything when the cap exceeds the total', () => {
            expect(computeVisibleSessionSlots(2, 2, 20)).to.deep.equal({ activeCount: 2, restoredCount: 2 });
        });

        it('keeps a restored slot even when the cap is 1 and both sections are non-empty', () => {
            expect(computeVisibleSessionSlots(10, 10, 1)).to.deep.equal({ activeCount: 0, restoredCount: 1 });
        });

        it('splits a cap of 2 evenly between both sections', () => {
            expect(computeVisibleSessionSlots(10, 10, 2)).to.deep.equal({ activeCount: 1, restoredCount: 1 });
        });
    });

    describe('getSections', () => {

        class SectionsTestService extends ChatSessionListService {
            constructor(sessions: ChatSession[], persistedSessions: ChatSessionMetadata[]) {
                super();
                (this as unknown as { chatService: ChatService }).chatService = { getSessions: () => sessions } as unknown as ChatService;
                (this as unknown as { _persistedSessions: ChatSessionMetadata[] })._persistedSessions = persistedSessions;
            }
            sections(): SectionedSessions {
                return this.getSections();
            }
        }

        function makeSession(id: string, title: string | undefined, opts?: {
            lastInteraction?: Date;
            pinnedAgentId?: string;
            location?: ChatAgentLocation;
            status?: ChatSessionStatus;
        }): ChatSession {
            return {
                id,
                title,
                isActive: false,
                lastInteraction: opts?.lastInteraction,
                pinnedAgent: opts?.pinnedAgentId ? { id: opts.pinnedAgentId } : undefined,
                model: {
                    location: opts?.location ?? ChatAgentLocation.Panel,
                    status: opts?.status ?? 'idle',
                    getRequests: () => []
                }
            } as unknown as ChatSession;
        }

        function persisted(sessionId: string, saveDate: number): ChatSessionMetadata {
            return { sessionId, title: sessionId, saveDate, location: ChatAgentLocation.Panel };
        }

        function getSections(sessions: ChatSession[], persistedSessions: ChatSessionMetadata[]): SectionedSessions {
            return new SectionsTestService(sessions, persistedSessions).sections();
        }

        it('excludes active sessions without a title', () => {
            const sections = getSections([
                makeSession('a', 'Titled'),
                makeSession('b', undefined)
            ], []);
            expect(sections.active.map(s => s.sessionId)).to.deep.equal(['a']);
        });

        it('sorts active sessions by last interaction, newest first', () => {
            const sections = getSections([
                makeSession('old', 'Old', { lastInteraction: new Date(1000) }),
                makeSession('new', 'New', { lastInteraction: new Date(3000) }),
                makeSession('mid', 'Mid', { lastInteraction: new Date(2000) })
            ], []);
            expect(sections.active.map(s => s.sessionId)).to.deep.equal(['new', 'mid', 'old']);
        });

        it('drops persisted entries that are already loaded as active sessions', () => {
            const sections = getSections(
                [makeSession('a', 'A', { lastInteraction: new Date(1000) })],
                [persisted('a', 1000), persisted('b', 2000)]
            );
            expect(sections.active.map(s => s.sessionId)).to.deep.equal(['a']);
            expect(sections.restored.map(s => s.sessionId)).to.deep.equal(['b']);
        });

        it('flags an active session whose status is failed', () => {
            const sections = getSections([
                makeSession('ok', 'Ok', { status: 'idle' }),
                makeSession('err', 'Err', { status: 'failed' }),
                makeSession('running', 'Running', { status: 'running' })
            ], []);
            const byId = new Map(sections.active.map(s => [s.sessionId, s.hasError]));
            expect(byId.get('ok')).to.equal(false);
            expect(byId.get('err')).to.equal(true);
            expect(byId.get('running')).to.equal(false);
        });

        it('carries over the pinned agent id and location', () => {
            const sections = getSections([
                makeSession('a', 'A', { pinnedAgentId: 'Coder', location: ChatAgentLocation.Panel })
            ], []);
            expect(sections.active[0].pinnedAgentId).to.equal('Coder');
            expect(sections.active[0].location).to.equal(ChatAgentLocation.Panel);
        });
    });

    describe('session hierarchy', () => {

        class HierarchyTestService extends ChatSessionListService {
            constructor(chatService: ChatService, persistedSessions: ChatSessionMetadata[] = []) {
                super();
                (this as unknown as { chatService: ChatService }).chatService = chatService;
                (this as unknown as { _persistedSessions: ChatSessionMetadata[] })._persistedSessions = persistedSessions;
            }
            rows(sections: SectionedSessions): SessionRow[] {
                return this.buildRows(sections);
            }
            subtreeRequiresAction(row: SessionRow): boolean {
                return this.descendantRequiresAction(row);
            }
            expand(session: ChatSession): void {
                this.expandAncestors(session);
            }
            get expanded(): Set<string> {
                return this.expandedRoots;
            }
        }

        function meta(sessionId: string, opts?: { rootSessionId?: string; parentSessionId?: string }): ChatSessionMetadata {
            return {
                sessionId,
                title: sessionId,
                saveDate: 0,
                location: ChatAgentLocation.Panel,
                rootSessionId: opts?.rootSessionId,
                parentSessionId: opts?.parentSessionId
            };
        }

        function loadedSession(id: string, status: ChatSessionStatus, opts?: { rootSessionId?: string; parentSessionId?: string }): ChatSession {
            return {
                id,
                rootSessionId: opts?.rootSessionId,
                parentSessionId: opts?.parentSessionId,
                model: { status }
            } as unknown as ChatSession;
        }

        function findRow(rows: SessionRow[], sessionId: string): SessionRow {
            const row = rows.find(r => r.session.sessionId === sessionId);
            expect(row, `row ${sessionId}`).to.not.be.undefined;
            return row!;
        }

        it('nests a restored A -> B hierarchy with an active C under the root', () => {
            const service = new HierarchyTestService({ getSession: () => undefined } as unknown as ChatService);
            const sections: SectionedSessions = {
                active: [meta('C', { rootSessionId: 'A', parentSessionId: 'B' })],
                restored: [meta('A'), meta('B', { rootSessionId: 'A', parentSessionId: 'A' })]
            };

            const rows = service.rows(sections);
            const rowA = findRow(rows, 'A');
            expect(rowA.isRestored).to.equal(true);
            expect(rowA.childSessions.map(c => c.session.sessionId)).to.deep.equal(['B']);
            const rowB = rowA.childSessions[0];
            expect(rowB.isRestored).to.equal(true);
            expect(rowB.childSessions.map(c => c.session.sessionId)).to.deep.equal(['C']);
            expect(rowB.childSessions[0].isRestored).to.equal(false);
        });

        it('propagates a deep descendant needing action up the tree', () => {
            // Only the leaf C awaits input; both B and the root A must report a descendant needing action.
            const chatService = {
                getSession: (id: string) => id === 'C' ? loadedSession('C', 'awaitingInput') : loadedSession(id, 'idle')
            } as unknown as ChatService;
            const service = new HierarchyTestService(chatService);
            const sections: SectionedSessions = {
                active: [meta('C', { rootSessionId: 'A', parentSessionId: 'B' })],
                restored: [meta('A'), meta('B', { rootSessionId: 'A', parentSessionId: 'A' })]
            };

            const rows = service.rows(sections);
            const rowA = findRow(rows, 'A');
            const rowB = rowA.childSessions[0];
            const rowC = rowB.childSessions[0];
            expect(service.subtreeRequiresAction(rowA)).to.equal(true);
            expect(service.subtreeRequiresAction(rowB)).to.equal(true);
            expect(service.subtreeRequiresAction(rowC)).to.equal(false);
        });

        it('expands every ancestor of a session that needs action, falling back to persisted-only ancestors', () => {
            // C is loaded and awaiting input; its ancestors B and A exist only in the persisted index
            // (e.g. C was opened directly from "Browse all chats"). The walk must reach the root A, not
            // stop at the first ancestor `getSession` cannot resolve.
            const c = loadedSession('C', 'awaitingInput', { rootSessionId: 'A', parentSessionId: 'B' });
            const chatService = {
                getSession: (id: string) => id === 'C' ? c : undefined
            } as unknown as ChatService;
            const service = new HierarchyTestService(chatService, [
                meta('A'),
                meta('B', { rootSessionId: 'A', parentSessionId: 'A' })
            ]);

            service.expand(c);

            expect([...service.expanded].sort()).to.deep.equal(['A', 'B']);
        });
    });
});
