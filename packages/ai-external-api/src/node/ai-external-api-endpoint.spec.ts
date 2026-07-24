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

import { Emitter } from '@theia/core';
import * as express from '@theia/core/shared/express';
import { ExternalApiRouter } from '@theia/external-api/lib/node/external-api-router';
import { ExternalApiTestSupport } from '@theia/external-api/lib/node/test/external-api-test-support';
import { expect } from 'chai';
import * as http from 'http';
import { AddressInfo } from 'net';
import { ExternalChatSessionSummary } from '../common/external-chat-session-provider';
import { AIExternalApiEndpoint } from './ai-external-api-endpoint';
import { ExternalChatSessionRegistry } from './external-chat-session-registry';

describe('AIExternalApiEndpoint', () => {

    const sessions: ExternalChatSessionSummary[] = [
        {
            id: '1', title: 'session', status: 'running', lastInteraction: 100, workspace: 'file:///test/workspace',
            preview: 'fix the build\nSure.', agentId: 'coder', agentName: 'Coder', restored: true
        }
    ];

    let server: http.Server | undefined;

    afterEach(() => {
        server?.close();
        server?.closeAllConnections();
        server = undefined;
    });

    interface ServedEndpoint {
        url: string;
        router: ExternalApiRouter;
        sessionsChanged: Emitter<void>;
    }

    async function serve(registry: Partial<ExternalChatSessionRegistry> = {}): Promise<ServedEndpoint> {
        const sessionsChanged = new Emitter<void>();
        const endpoint = new AIExternalApiEndpoint();
        (endpoint as unknown as Record<string, unknown>)['registry'] = {
            getSessions: async () => sessions,
            getSession: async (id: string) => sessions.find(candidate => candidate.id === id),
            openSession: async (id: string) => sessions.some(candidate => candidate.id === id),
            restoreSession: async (id: string) => sessions.find(candidate => candidate.id === id),
            sendPrompt: async (id: string) => sessions.some(candidate => candidate.id === id)
                ? { sent: { sessionId: id, requestId: 'r1' } }
                : undefined,
            createSession: async () => ({ created: { session: sessions[0], requestId: 'r1' } }),
            onDidChangeSessions: sessionsChanged.event,
            ...registry
        };
        const app = express();
        const router = ExternalApiTestSupport.mountContribution(app, endpoint);
        const listening = new Promise<void>(resolve => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        await listening;
        return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}${endpoint.path}`, router, sessionsChanged };
    }

    function wait(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function eventData(event: string | undefined): unknown {
        const data = event?.split('\n').find(line => line.startsWith('data: '));
        expect(data, `expected a data line in event: ${event}`).to.not.equal(undefined);
        return JSON.parse(data!.substring('data: '.length));
    }

    it('lists sessions', async () => {
        const { url } = await serve();
        const response = await fetch(url);
        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal({ sessions });
    });

    it('returns a single session', async () => {
        const { url } = await serve();
        const response = await fetch(`${url}/1`);
        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal(sessions[0]);
    });

    it('returns 404 for unknown sessions', async () => {
        const { url } = await serve();
        const response = await fetch(`${url}/missing`);
        expect(response.status).to.equal(404);
        expect(await response.json()).to.deep.equal({ error: 'not found' });
    });

    it('returns 500 when gathering session data fails', async () => {
        const { url } = await serve({ getSessions: async () => { throw new Error('boom'); } });
        const response = await fetch(url);
        expect(response.status).to.equal(500);
        expect(await response.json()).to.deep.equal({ error: 'internal error' });
    });

    describe('open and restore', () => {
        it('opens a session', async () => {
            const opened: string[] = [];
            const { url } = await serve({ openSession: async (id: string) => { opened.push(id); return true; } });
            const response = await fetch(`${url}/1/open`, { method: 'POST' });
            expect(response.status).to.equal(204);
            expect(opened).to.deep.equal(['1']);
        });

        it('returns 404 when opening an unknown session', async () => {
            const { url } = await serve();
            const response = await fetch(`${url}/missing/open`, { method: 'POST' });
            expect(response.status).to.equal(404);
        });

        it('restores a session and returns its detail', async () => {
            const { url } = await serve();
            const response = await fetch(`${url}/1/restore`, { method: 'POST' });
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal(sessions[0]);
        });

        it('returns 404 when restoring an unknown session', async () => {
            const { url } = await serve();
            const response = await fetch(`${url}/missing/restore`, { method: 'POST' });
            expect(response.status).to.equal(404);
        });
    });

    describe('create and prompt', () => {
        function post(url: string, body: unknown): Promise<Response> {
            return fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });
        }

        it('creates a session', async () => {
            const { url } = await serve();
            const response = await post(url, { workspace: 'file:///test/workspace', agentId: 'coder', prompt: 'fix the build' });
            expect(response.status).to.equal(201);
            expect(await response.json()).to.deep.equal({ session: sessions[0], requestId: 'r1' });
        });

        it('rejects an invalid creation request with the validation errors as details', async () => {
            const { url } = await serve();
            const response = await post(url, { focus: 'yes' });
            expect(response.status).to.equal(400);
            const body = await response.json();
            expect(body.error).to.equal('invalid request');
            expect(body.details).to.have.length(1);
            expect(body.details[0]).to.contain('focus');
        });

        it('rejects a creation request with a blank workspace', async () => {
            const { url } = await serve();
            const response = await post(url, { workspace: '   ' });
            expect(response.status).to.equal(400);
            const error = await response.json();
            expect(error.error).to.equal('invalid request');
            expect(error.details[0]).to.contain('workspace');
        });

        it('rejects an unknown agent', async () => {
            const { url } = await serve({ createSession: async () => ({ failure: 'unknownAgent' }) });
            const response = await post(url, { agentId: 'ghost' });
            expect(response.status).to.equal(400);
            expect(await response.json()).to.deep.equal({ error: 'unknown agent' });
        });

        it('rejects an unknown workspace', async () => {
            const { url } = await serve({ createSession: async () => ({ failure: 'workspaceNotFound' }) });
            const response = await post(url, { workspace: 'file:///other' });
            expect(response.status).to.equal(404);
            expect(await response.json()).to.deep.equal({ error: 'workspace not found' });
        });

        it('rejects an ambiguous workspace', async () => {
            const { url } = await serve({ createSession: async () => ({ failure: 'ambiguousWorkspace' }) });
            const response = await post(url, {});
            expect(response.status).to.equal(409);
            expect(await response.json()).to.deep.equal({ error: 'ambiguous workspace' });
        });

        it('sends a prompt to a session', async () => {
            const { url } = await serve();
            const response = await post(`${url}/1/prompt`, { text: 'continue' });
            expect(response.status).to.equal(202);
            expect(await response.json()).to.deep.equal({ sessionId: '1', requestId: 'r1' });
        });

        it('returns 404 when prompting an unknown session', async () => {
            const { url } = await serve();
            const response = await post(`${url}/missing/prompt`, { text: 'continue' });
            expect(response.status).to.equal(404);
        });

        it('returns 409 when the session is busy', async () => {
            const { url } = await serve({ sendPrompt: async () => ({ failure: 'busy' }) });
            const response = await post(`${url}/1/prompt`, { text: 'continue' });
            expect(response.status).to.equal(409);
            expect(await response.json()).to.deep.equal({ error: 'busy' });
        });

        it('returns 409 when no agent is available', async () => {
            const { url } = await serve({ sendPrompt: async () => ({ failure: 'noAgent' }) });
            const response = await post(`${url}/1/prompt`, { text: 'continue' });
            expect(response.status).to.equal(409);
            expect(await response.json()).to.deep.equal({ error: 'no agent available' });
        });

        it('rejects a prompt without text', async () => {
            const { url } = await serve();
            const response = await post(`${url}/1/prompt`, { text: '   ' });
            expect(response.status).to.equal(400);
            const error = await response.json();
            expect(error.error).to.equal('invalid request');
            expect(error.details[0]).to.contain('text');
        });

        it('rejects malformed JSON bodies', async () => {
            const { url } = await serve();
            const response = await post(`${url}/1/prompt`, 'not json');
            expect(response.status).to.equal(400);
            expect(await response.json()).to.deep.equal({ error: 'invalid request' });
        });
    });

    describe('events', () => {
        it('streams the current sessions on connect', async () => {
            const { url } = await serve();
            const response = await fetch(`${url}/events`);
            expect(response.status).to.equal(200);
            expect(response.headers.get('content-type')).to.equal('text/event-stream');
            const events = ExternalApiTestSupport.sseReader(response);
            const first = await events.next();
            expect(first).to.contain('event: sessions');
            expect(eventData(first)).to.deep.equal({ sessions });
            await events.cancel();
        });

        it('pushes an updated list when sessions change', async () => {
            const { url, sessionsChanged } = await serve();
            const response = await fetch(`${url}/events`);
            const events = ExternalApiTestSupport.sseReader(response);
            await events.next();
            sessionsChanged.fire();
            const update = await events.next();
            expect(eventData(update)).to.deep.equal({ sessions });
            await events.cancel();
        });

        it('coalesces change bursts into one push', async () => {
            const { url, sessionsChanged } = await serve();
            const response = await fetch(`${url}/events`);
            const events = ExternalApiTestSupport.sseReader(response);
            await events.next();
            sessionsChanged.fire();
            sessionsChanged.fire();
            sessionsChanged.fire();
            expect(eventData(await events.next())).to.deep.equal({ sessions });
            const extra = await Promise.race([events.next(), wait(300).then(() => 'no extra push')]);
            expect(extra).to.equal('no extra push');
            await events.cancel();
        });

        it('closes event streams when the routing is rebuilt', async () => {
            const { url, router } = await serve();
            const response = await fetch(`${url}/events`);
            const events = ExternalApiTestSupport.sseReader(response);
            await events.next();
            router.dispose();
            expect(await events.next()).to.equal(undefined);
        });
    });
});
