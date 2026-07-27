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

import { ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatModel, ChatSessionStatus } from '@theia/ai-chat/lib/common/chat-model';
import { ChatService, ChatSession, NoChatAgentError, SessionOptions } from '@theia/ai-chat/lib/common/chat-service';
import { ChatSessionMetadata } from '@theia/ai-chat/lib/common/chat-session-store';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { expect } from 'chai';
import { FrontendExternalChatSessionProvider } from './frontend-external-chat-session-provider';

disableJSDOM();

describe('FrontendExternalChatSessionProvider', () => {

    interface Exchange {
        request?: string;
        response?: string;
    }

    function liveSession(
        id: string, status: ChatSessionStatus, exchanges: Exchange[] = [], lastInteraction?: Date, title?: string,
        pinnedAgent?: { id: string; name: string }
    ): ChatSession {
        const requests = exchanges.map(exchange => ({
            request: { text: exchange.request ?? '' },
            response: { response: { asDisplayString: () => exchange.response ?? '' } }
        }));
        const model = { status, getRequests: () => requests } as unknown as ChatModel;
        return { id, title, lastInteraction, model, isActive: false, pinnedAgent } as ChatSession;
    }

    function persisted(id: string, extra: Partial<ChatSessionMetadata> = {}): ChatSessionMetadata {
        return { sessionId: id, title: `persisted ${id}`, saveDate: 400, location: ChatAgentLocation.Panel, ...extra };
    }

    interface ProviderContext {
        provider: FrontendExternalChatSessionProvider;
        activatedSessions: { sessionId: string; options?: SessionOptions }[];
        sentRequests: { sessionId: string; text: string }[];
        createdSessions: { options?: SessionOptions; agent?: { id: string } }[];
        deletedSessions: string[];
    }

    function createProvider(options: {
        sessions?: ChatSession[],
        persisted?: ChatSessionMetadata[],
        persistedFailure?: boolean,
        restorable?: ChatSession[],
        agents?: Record<string, { id: string; name: string }>,
        workspace?: string,
        noAgent?: boolean,
        requestFailure?: Error
    }): ProviderContext {
        const sessions = options.sessions ?? [];
        const activatedSessions: { sessionId: string; options?: SessionOptions }[] = [];
        const sentRequests: { sessionId: string; text: string }[] = [];
        const createdSessions: { options?: SessionOptions; agent?: { id: string } }[] = [];
        const deletedSessions: string[] = [];
        const chatService = {
            getSessions: () => sessions,
            getSession: (id: string) => sessions.find(candidate => candidate.id === id),
            getPersistedSessions: async () => {
                if (options.persistedFailure) {
                    throw new Error('storage failure');
                }
                return Object.fromEntries((options.persisted ?? []).map(metadata => [metadata.sessionId, metadata]));
            },
            getOrRestoreSession: async (id: string) =>
                sessions.find(candidate => candidate.id === id) ?? options.restorable?.find(candidate => candidate.id === id),
            setActiveSession: (sessionId: string, sessionOptions?: SessionOptions) => {
                activatedSessions.push({ sessionId, options: sessionOptions });
            },
            sendRequest: async (sessionId: string, request: { text: string }) => {
                sentRequests.push({ sessionId, text: request.text });
                const failure = options.noAgent ? new NoChatAgentError('no agent') : options.requestFailure;
                return {
                    requestCompleted: failure
                        ? Promise.reject(failure)
                        : Promise.resolve({ id: `request-for-${sessionId}` })
                };
            },
            createSession: (location: unknown, sessionOptions?: SessionOptions, agent?: { id: string; name: string }) => {
                const session = liveSession('created-session', 'idle', [], new Date(100), undefined, agent);
                sessions.push(session);
                createdSessions.push({ options: sessionOptions, agent });
                return session;
            },
            deleteSession: async (id: string) => {
                deletedSessions.push(id);
                sessions.splice(sessions.findIndex(candidate => candidate.id === id), 1);
            }
        } as unknown as ChatService;
        const workspaceService = {
            ready: Promise.resolve(),
            workspace: options.workspace ? { resource: { toString: () => options.workspace } } : undefined
        } as unknown as WorkspaceService;
        const provider = new FrontendExternalChatSessionProvider();
        (provider as unknown as Record<string, unknown>)['logger'] = new MockLogger();
        (provider as unknown as Record<string, unknown>)['chatService'] = chatService;
        (provider as unknown as Record<string, unknown>)['agentService'] = {
            getAgent: (id: string) => options.agents?.[id]
        };
        (provider as unknown as Record<string, unknown>)['workspaceService'] = workspaceService;
        return { provider, activatedSessions, sentRequests, createdSessions, deletedSessions };
    }

    describe('getSessions', () => {
        it('reports live sessions with status, workspace, agent, and preview', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'awaitingApproval', [{ request: 'fix the build', response: 'Sure.' }], new Date(500), 'my session',
                    { id: 'coder', name: 'Coder' })],
                workspace: 'file:///test/workspace'
            });
            const sessions = await provider.getSessions();
            expect(sessions).to.deep.equal([{
                id: '1',
                title: 'my session',
                status: 'awaitingApproval',
                lastInteraction: 500,
                workspace: 'file:///test/workspace',
                preview: 'fix the build\nSure.',
                agentId: 'coder',
                agentName: 'Coder',
                restored: true
            }]);
        });

        it('reports no workspace when none is open', async () => {
            const { provider } = createProvider({ sessions: [liveSession('1', 'idle')] });
            const sessions = await provider.getSessions();
            expect(sessions).to.have.length(1);
            expect(sessions[0].workspace).to.equal(undefined);
        });

        it('reports no preview for an empty conversation', async () => {
            const { provider } = createProvider({ sessions: [liveSession('1', 'idle')] });
            const sessions = await provider.getSessions();
            expect(sessions[0].preview).to.equal(undefined);
        });

        it('limits the preview to the last few non-empty lines', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'running', [
                    { request: 'first question', response: 'old answer' },
                    { request: 'second question', response: 'one\n\ntwo\nthree\nfour\nfive' }
                ])]
            });
            const sessions = await provider.getSessions();
            expect(sessions[0].preview).to.equal('one\ntwo\nthree\nfour\nfive');
        });

        it('truncates overlong preview lines', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'running', [{ request: 'call a tool', response: `Tool call: writeFile(${'x'.repeat(300)})` }])]
            });
            const sessions = await provider.getSessions();
            const lines = sessions[0].preview!.split('\n');
            expect(lines[1]).to.have.length(201);
            expect(lines[1].endsWith('…')).to.equal(true);
        });

        it('reports persisted sessions with their metadata', async () => {
            const { provider } = createProvider({
                persisted: [persisted('2', { pinnedAgentId: 'coder', hasError: true })],
                agents: { coder: { id: 'coder', name: 'Coder' } },
                workspace: 'file:///test/workspace'
            });
            const sessions = await provider.getSessions();
            expect(sessions).to.deep.equal([{
                id: '2',
                title: 'persisted 2',
                status: 'failed',
                lastInteraction: 400,
                workspace: 'file:///test/workspace',
                agentId: 'coder',
                agentName: 'Coder',
                restored: false
            }]);
        });

        it('reports persisted sessions as idle without a recorded error', async () => {
            const { provider } = createProvider({ persisted: [persisted('2')] });
            const sessions = await provider.getSessions();
            expect(sessions[0].status).to.equal('idle');
            expect(sessions[0].agentName).to.equal(undefined);
        });

        it('does not duplicate restored sessions from the persisted index', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'running')],
                persisted: [persisted('1'), persisted('2')]
            });
            const sessions = await provider.getSessions();
            expect(sessions.map(session => `${session.id}:${session.restored}`)).to.deep.equal(['1:true', '2:false']);
        });

        it('reports only live sessions when reading the persisted index fails', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'running')],
                persisted: [persisted('2')],
                persistedFailure: true
            });
            const sessions = await provider.getSessions();
            expect(sessions.map(session => session.id)).to.deep.equal(['1']);
        });
    });

    describe('getSession', () => {
        it('reduces the conversation to plain-text messages', async () => {
            const { provider } = createProvider({
                sessions: [liveSession('1', 'idle', [
                    { request: 'fix the build', response: 'Done, the build passes now.' },
                    { request: 'thanks' }
                ], new Date(300), 'live')],
                workspace: 'file:///test/workspace'
            });
            const session = await provider.getSession('1');
            expect(session).to.deep.equal({
                id: '1',
                title: 'live',
                status: 'idle',
                lastInteraction: 300,
                workspace: 'file:///test/workspace',
                preview: 'fix the build\nDone, the build passes now.\nthanks',
                agentId: undefined,
                agentName: undefined,
                restored: true,
                messages: [
                    { actor: 'user', text: 'fix the build' },
                    { actor: 'ai', text: 'Done, the build passes now.' },
                    { actor: 'user', text: 'thanks' }
                ]
            });
        });

        it('returns persisted metadata without messages for unrestored sessions', async () => {
            const { provider } = createProvider({ persisted: [persisted('2')] });
            const session = await provider.getSession('2');
            expect(session?.restored).to.equal(false);
            expect(session?.title).to.equal('persisted 2');
            expect(session?.messages).to.equal(undefined);
        });

        it('returns undefined for unknown sessions', async () => {
            const { provider } = createProvider({});
            expect(await provider.getSession('missing')).to.equal(undefined);
        });
    });

    describe('openSession', () => {
        it('activates and focuses a live session', async () => {
            const { provider, activatedSessions } = createProvider({ sessions: [liveSession('1', 'idle')] });
            expect(await provider.openSession('1')).to.equal(true);
            expect(activatedSessions).to.deep.equal([{ sessionId: '1', options: { focus: true } }]);
        });

        it('restores a persisted session before activating it', async () => {
            const { provider, activatedSessions } = createProvider({ restorable: [liveSession('2', 'idle')] });
            expect(await provider.openSession('2')).to.equal(true);
            expect(activatedSessions).to.have.length(1);
        });

        it('returns false for unknown sessions', async () => {
            const { provider, activatedSessions } = createProvider({});
            expect(await provider.openSession('missing')).to.equal(false);
            expect(activatedSessions).to.deep.equal([]);
        });
    });

    describe('sendPrompt', () => {
        it('sends a prompt to an idle session', async () => {
            const { provider, sentRequests } = createProvider({ sessions: [liveSession('1', 'idle')] });
            const result = await provider.sendPrompt('1', { text: 'continue' });
            expect(result).to.deep.equal({ sent: { sessionId: '1', requestId: 'request-for-1' } });
            expect(sentRequests).to.deep.equal([{ sessionId: '1', text: 'continue' }]);
        });

        it('rejects prompting a busy session', async () => {
            const { provider, sentRequests } = createProvider({ sessions: [liveSession('1', 'running')] });
            const result = await provider.sendPrompt('1', { text: 'continue' });
            expect(result).to.deep.equal({ failure: 'busy' });
            expect(sentRequests).to.deep.equal([]);
        });

        it('interrupts a busy session when requested', async () => {
            const { provider, sentRequests } = createProvider({ sessions: [liveSession('1', 'awaitingApproval')] });
            const result = await provider.sendPrompt('1', { text: 'continue', interrupt: true });
            expect(result).to.deep.equal({ sent: { sessionId: '1', requestId: 'request-for-1' } });
            expect(sentRequests).to.have.length(1);
        });

        it('restores a persisted session before prompting', async () => {
            const { provider } = createProvider({ restorable: [liveSession('2', 'idle')] });
            const result = await provider.sendPrompt('2', { text: 'continue' });
            expect(result).to.deep.equal({ sent: { sessionId: '2', requestId: 'request-for-2' } });
        });

        it('returns undefined for unknown sessions', async () => {
            const { provider } = createProvider({});
            expect(await provider.sendPrompt('missing', { text: 'continue' })).to.equal(undefined);
        });

        it('reports when no agent can handle the prompt', async () => {
            const { provider } = createProvider({ sessions: [liveSession('1', 'idle')], noAgent: true });
            expect(await provider.sendPrompt('1', { text: 'continue' })).to.deep.equal({ failure: 'noAgent' });
        });

        it('propagates unexpected request failures instead of reporting them as missing agents', async () => {
            const { provider } = createProvider({ sessions: [liveSession('1', 'idle')], requestFailure: new Error('connection lost') });
            let thrown: unknown;
            try {
                await provider.sendPrompt('1', { text: 'continue' });
            } catch (error) {
                thrown = error;
            }
            expect((thrown as Error).message).to.equal('connection lost');
        });
    });

    describe('createSession', () => {
        it('creates a session with a pinned agent and sends the initial prompt', async () => {
            const { provider, sentRequests, createdSessions } = createProvider({
                agents: { coder: { id: 'coder', name: 'Coder' } },
                workspace: 'file:///test/workspace'
            });
            const result = await provider.createSession({ agentId: 'coder', prompt: 'fix the build', focus: true });
            expect('created' in result && result.created.session.id).to.equal('created-session');
            expect('created' in result && result.created.session.agentId).to.equal('coder');
            expect('created' in result && result.created.requestId).to.equal('request-for-created-session');
            expect(createdSessions).to.deep.equal([{ options: { focus: true }, agent: { id: 'coder', name: 'Coder' } }]);
            expect(sentRequests).to.deep.equal([{ sessionId: 'created-session', text: 'fix the build' }]);
        });

        it('creates a session without an initial prompt', async () => {
            const { provider, sentRequests } = createProvider({});
            const result = await provider.createSession({});
            expect('created' in result && result.created.session.id).to.equal('created-session');
            expect('created' in result && result.created.requestId).to.equal(undefined);
            expect(sentRequests).to.deep.equal([]);
        });

        it('rejects an unknown agent without creating a session', async () => {
            const { provider, createdSessions } = createProvider({});
            expect(await provider.createSession({ agentId: 'ghost' })).to.deep.equal({ failure: 'unknownAgent' });
            expect(createdSessions).to.deep.equal([]);
        });

        it('deletes the session when no agent handles the initial prompt', async () => {
            const { provider, deletedSessions } = createProvider({ noAgent: true });
            expect(await provider.createSession({ prompt: 'fix the build' })).to.deep.equal({ failure: 'noAgent' });
            expect(deletedSessions).to.deep.equal(['created-session']);
        });

        it('deletes the session and propagates unexpected initial prompt failures', async () => {
            const { provider, deletedSessions } = createProvider({ requestFailure: new Error('connection lost') });
            let thrown: unknown;
            try {
                await provider.createSession({ prompt: 'fix the build' });
            } catch (error) {
                thrown = error;
            }
            expect((thrown as Error).message).to.equal('connection lost');
            expect(deletedSessions).to.deep.equal(['created-session']);
        });
    });

    describe('getWorkspace', () => {
        it('reports the workspace of this frontend', async () => {
            const { provider } = createProvider({ workspace: 'file:///test/workspace' });
            expect(await provider.getWorkspace()).to.equal('file:///test/workspace');
        });
    });

    describe('restoreSession', () => {
        it('restores a persisted session without activating it', async () => {
            const { provider, activatedSessions } = createProvider({
                restorable: [liveSession('2', 'idle', [{ request: 'old question', response: 'old answer' }])]
            });
            const session = await provider.restoreSession('2');
            expect(session?.restored).to.equal(true);
            expect(session?.messages).to.deep.equal([
                { actor: 'user', text: 'old question' },
                { actor: 'ai', text: 'old answer' }
            ]);
            expect(activatedSessions).to.deep.equal([]);
        });

        it('returns undefined for unknown sessions', async () => {
            const { provider } = createProvider({});
            expect(await provider.restoreSession('missing')).to.equal(undefined);
        });
    });
});
