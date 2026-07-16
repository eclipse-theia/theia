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

import { ChatSessionStatus } from '@theia/ai-chat/lib/common/chat-model';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { expect } from 'chai';
import { ExternalChatSessionDetail, ExternalChatSessionProvider, ExternalChatSessionSummary } from '../common/external-chat-session-provider';
import { ExternalChatSessionRegistry } from './external-chat-session-registry';

describe('ExternalChatSessionRegistry', () => {

    function createRegistry(): ExternalChatSessionRegistry {
        const registry = new ExternalChatSessionRegistry();
        (registry as unknown as Record<string, unknown>)['logger'] = new MockLogger();
        return registry;
    }

    function summary(id: string, status: ChatSessionStatus = 'idle', lastInteraction?: number, restored: boolean = true): ExternalChatSessionSummary {
        return { id, status, lastInteraction, restored };
    }

    function detail(id: string, status: ChatSessionStatus = 'idle', lastInteraction?: number, restored: boolean = true): ExternalChatSessionDetail {
        return { ...summary(id, status, lastInteraction, restored), messages: [{ actor: 'user', text: `question for ${id}` }] };
    }

    function provider(
        sessions: ExternalChatSessionSummary[],
        details: ExternalChatSessionDetail[] = [],
        actions: Partial<ExternalChatSessionProvider> = {}
    ): ExternalChatSessionProvider {
        return {
            getWorkspace: async () => undefined,
            getSessions: async () => sessions,
            getSession: async sessionId => details.find(candidate => candidate.id === sessionId),
            openSession: async () => false,
            restoreSession: async () => undefined,
            sendPrompt: async () => undefined,
            createSession: async () => ({ created: { session: summary('created') } }),
            ...actions
        };
    }

    function failingProvider(): ExternalChatSessionProvider {
        const fail = async (): Promise<never> => { throw new Error('connection lost'); };
        return {
            getWorkspace: fail,
            getSessions: fail,
            getSession: fail,
            openSession: fail,
            restoreSession: fail,
            sendPrompt: fail,
            createSession: fail
        };
    }

    describe('getSessions', () => {
        it('returns an empty list without providers', async () => {
            const registry = createRegistry();
            expect(await registry.getSessions()).to.deep.equal([]);
        });

        it('aggregates sessions of all providers sorted by last interaction', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([summary('1', 'idle', 100)]));
            registry.addProvider(provider([summary('2', 'idle', 300), summary('3', 'idle', 200)]));
            const sessions = await registry.getSessions();
            expect(sessions.map(session => session.id)).to.deep.equal(['2', '3', '1']);
        });

        it('deduplicates sessions preferring restored reports', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([summary('1', 'running', 300, false)]));
            registry.addProvider(provider([summary('1', 'idle', 100, true)]));
            const sessions = await registry.getSessions();
            expect(sessions).to.have.length(1);
            expect(sessions[0].restored).to.equal(true);
        });

        it('deduplicates sessions preferring in-progress reports', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([summary('1', 'idle', 200)]));
            registry.addProvider(provider([summary('1', 'running', 100)]));
            const sessions = await registry.getSessions();
            expect(sessions).to.have.length(1);
            expect(sessions[0].status).to.equal('running');
        });

        it('deduplicates sessions preferring more recent reports', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([summary('1', 'idle', 100)]));
            registry.addProvider(provider([summary('1', 'failed', 200)]));
            const sessions = await registry.getSessions();
            expect(sessions).to.have.length(1);
            expect(sessions[0].status).to.equal('failed');
        });

        it('no longer reports sessions of removed providers', async () => {
            const registry = createRegistry();
            const removed = provider([summary('1')]);
            registry.addProvider(removed);
            registry.addProvider(provider([summary('2')]));
            registry.removeProvider(removed);
            const sessions = await registry.getSessions();
            expect(sessions.map(session => session.id)).to.deep.equal(['2']);
        });

        it('skips failing providers', async () => {
            const registry = createRegistry();
            registry.addProvider(failingProvider());
            registry.addProvider(provider([summary('1')]));
            const sessions = await registry.getSessions();
            expect(sessions.map(session => session.id)).to.deep.equal(['1']);
        });
    });

    describe('getSession', () => {
        it('returns undefined for unknown sessions', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([]));
            expect(await registry.getSession('missing')).to.equal(undefined);
        });

        it('returns the session from the provider that knows it', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([]));
            registry.addProvider(provider([], [detail('1', 'running')]));
            const session = await registry.getSession('1');
            expect(session?.status).to.equal('running');
            expect(session?.messages).to.deep.equal([{ actor: 'user', text: 'question for 1' }]);
        });

        it('prefers the in-progress duplicate', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [detail('1', 'idle', 200)]));
            registry.addProvider(provider([], [detail('1', 'awaitingApproval', 100)]));
            const session = await registry.getSession('1');
            expect(session?.status).to.equal('awaitingApproval');
        });

        it('prefers the restored duplicate', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)]));
            registry.addProvider(provider([], [detail('1', 'failed', 200, false)]));
            const session = await registry.getSession('1');
            expect(session?.restored).to.equal(true);
        });

        it('skips failing providers', async () => {
            const registry = createRegistry();
            registry.addProvider(failingProvider());
            registry.addProvider(provider([], [detail('1')]));
            const session = await registry.getSession('1');
            expect(session?.id).to.equal('1');
        });
    });

    describe('openSession', () => {
        it('returns false when no provider knows the session', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([]));
            expect(await registry.openSession('missing')).to.equal(false);
        });

        it('opens the session in the frontend that knows it', async () => {
            const registry = createRegistry();
            const opened: string[] = [];
            registry.addProvider(provider([]));
            registry.addProvider(provider([], [detail('1')], {
                openSession: async sessionId => { opened.push(sessionId); return true; }
            }));
            expect(await registry.openSession('1')).to.equal(true);
            expect(opened).to.deep.equal(['1']);
        });

        it('prefers the frontend with the restored session', async () => {
            const registry = createRegistry();
            const opened: string[] = [];
            registry.addProvider(provider([], [detail('1', 'idle', 300, false)], {
                openSession: async () => { opened.push('persisted-only'); return true; }
            }));
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)], {
                openSession: async () => { opened.push('restored'); return true; }
            }));
            expect(await registry.openSession('1')).to.equal(true);
            expect(opened).to.deep.equal(['restored']);
        });

        it('falls back to the next frontend when the preferred one fails', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [detail('1', 'running', 200, true)], {
                openSession: async () => { throw new Error('connection lost'); }
            }));
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)], {
                openSession: async () => true
            }));
            expect(await registry.openSession('1')).to.equal(true);
        });

        it('keeps the registration order when neither report is preferred', async () => {
            const registry = createRegistry();
            const opened: string[] = [];
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)], {
                openSession: async () => { opened.push('first'); return true; }
            }));
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)], {
                openSession: async () => { opened.push('second'); return true; }
            }));
            expect(await registry.openSession('1')).to.equal(true);
            expect(opened).to.deep.equal(['first']);
        });
    });

    describe('restoreSession', () => {
        it('returns undefined when no provider knows the session', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([]));
            expect(await registry.restoreSession('missing')).to.equal(undefined);
        });

        it('restores the session in the frontend that knows it', async () => {
            const registry = createRegistry();
            const restored = detail('1', 'idle', 100, true);
            registry.addProvider(provider([]));
            registry.addProvider(provider([], [detail('1', 'idle', 100, false)], {
                restoreSession: async () => restored
            }));
            expect(await registry.restoreSession('1')).to.deep.equal(restored);
        });
    });

    describe('sendPrompt', () => {
        it('returns undefined when no provider knows the session', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([]));
            expect(await registry.sendPrompt('missing', { text: 'hello' })).to.equal(undefined);
        });

        it('sends the prompt via the frontend that knows the session', async () => {
            const registry = createRegistry();
            const prompts: string[] = [];
            registry.addProvider(provider([]));
            registry.addProvider(provider([], [detail('1')], {
                sendPrompt: async (sessionId, prompt) => { prompts.push(prompt.text); return { sent: { sessionId, requestId: 'r1' } }; }
            }));
            expect(await registry.sendPrompt('1', { text: 'hello' })).to.deep.equal({ sent: { sessionId: '1', requestId: 'r1' } });
            expect(prompts).to.deep.equal(['hello']);
        });

        it('does not retry a busy rejection on other frontends', async () => {
            const registry = createRegistry();
            const prompted: string[] = [];
            registry.addProvider(provider([], [detail('1', 'running', 100, true)], {
                sendPrompt: async () => { prompted.push('restored'); return { failure: 'busy' }; }
            }));
            registry.addProvider(provider([], [detail('1', 'idle', 300, false)], {
                sendPrompt: async sessionId => { prompted.push('persisted-only'); return { sent: { sessionId, requestId: 'r1' } }; }
            }));
            expect(await registry.sendPrompt('1', { text: 'hello' })).to.deep.equal({ failure: 'busy' });
            expect(prompted).to.deep.equal(['restored']);
        });

        it('falls back to the next frontend when the preferred one fails', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [detail('1', 'running', 200, true)], {
                sendPrompt: async () => { throw new Error('connection lost'); }
            }));
            registry.addProvider(provider([], [detail('1', 'idle', 100, true)], {
                sendPrompt: async sessionId => ({ sent: { sessionId, requestId: 'r1' } })
            }));
            expect(await registry.sendPrompt('1', { text: 'hello' })).to.deep.equal({ sent: { sessionId: '1', requestId: 'r1' } });
        });
    });

    describe('createSession', () => {
        it('rejects when no frontend is connected', async () => {
            const registry = createRegistry();
            expect(await registry.createSession({})).to.deep.equal({ failure: 'workspaceNotFound' });
        });

        it('creates in the frontend with the requested workspace', async () => {
            const registry = createRegistry();
            const creators: string[] = [];
            registry.addProvider(provider([], [], {
                getWorkspace: async () => 'file:///other',
                createSession: async () => { creators.push('a'); return { created: { session: summary('a') } }; }
            }));
            registry.addProvider(provider([], [], {
                getWorkspace: async () => 'file:///project',
                createSession: async () => { creators.push('b'); return { created: { session: summary('b') } }; }
            }));
            const result = await registry.createSession({ workspace: 'file:///project', prompt: 'hello' });
            expect(result).to.deep.equal({ created: { session: summary('b') } });
            expect(creators).to.deep.equal(['b']);
        });

        it('matches workspaces ignoring trailing slashes', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///project/' }));
            const result = await registry.createSession({ workspace: 'file:///project' });
            expect('created' in result).to.equal(true);
        });

        it('rejects an unknown workspace', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///other' }));
            expect(await registry.createSession({ workspace: 'file:///project' })).to.deep.equal({ failure: 'workspaceNotFound' });
        });

        it('creates in the only connected frontend when no workspace is given', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///project' }));
            const result = await registry.createSession({});
            expect('created' in result).to.equal(true);
        });

        it('rejects when no workspace is given and the frontends have different workspaces', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///one' }));
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///two' }));
            expect(await registry.createSession({})).to.deep.equal({ failure: 'ambiguousWorkspace' });
        });

        it('creates when no workspace is given and the frontends share a workspace', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///project' }));
            registry.addProvider(provider([], [], { getWorkspace: async () => 'file:///project/' }));
            const result = await registry.createSession({});
            expect('created' in result).to.equal(true);
        });

        it('passes provider failures through', async () => {
            const registry = createRegistry();
            registry.addProvider(provider([], [], { createSession: async () => ({ failure: 'unknownAgent' }) }));
            expect(await registry.createSession({ agentId: 'ghost' })).to.deep.equal({ failure: 'unknownAgent' });
        });
    });

    describe('onDidChangeSessions', () => {
        it('fires when providers are added, removed, or report changes', () => {
            const registry = createRegistry();
            let events = 0;
            registry.onDidChangeSessions(() => events++);
            const added = provider([]);
            registry.addProvider(added);
            expect(events).to.equal(1);
            registry.notifySessionsChanged();
            expect(events).to.equal(2);
            registry.removeProvider(added);
            expect(events).to.equal(3);
        });

        it('does not fire when removing an unknown provider', () => {
            const registry = createRegistry();
            let events = 0;
            registry.onDidChangeSessions(() => events++);
            registry.removeProvider(provider([]));
            expect(events).to.equal(0);
        });
    });
});
