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

import * as express from '@theia/core/shared/express';
import { expect } from 'chai';
import * as http from 'http';
import { AddressInfo } from 'net';
import { RestBodySchema } from '../common/rest-body-schema';
import { ExternalApiContribution } from './external-api-contribution';
import { ExternalApiRouter } from './external-api-router';
import { RestResult } from './rest-result';
import { ExternalApiTestSupport } from './test/external-api-test-support';

describe('ExternalApiRouter', () => {

    let server: http.Server | undefined;

    afterEach(() => {
        server?.close();
        server?.closeAllConnections();
        server = undefined;
    });

    interface ServedRouter {
        url: string;
        router: ExternalApiRouter;
    }

    async function serve(configure: (router: ExternalApiRouter) => void,
        isAuthorized?: (request: express.Request) => boolean): Promise<ServedRouter> {
        const app = express();
        const contribution: ExternalApiContribution = { path: '/api/test', configure };
        const router = ExternalApiTestSupport.mountContribution(app, contribution, isAuthorized);
        await new Promise<void>(resolve => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}${contribution.path}`, router };
    }

    function send(method: string, url: string, body?: unknown): Promise<Response> {
        return fetch(url, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
        });
    }

    interface EchoBody {
        text: string;
    }

    const ECHO_SCHEMA: RestBodySchema<EchoBody> = {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: { text: { type: 'string' } }
    };

    describe('typed routes', () => {
        it('renders success results as JSON', async () => {
            const { url } = await serve(router => router.get('/', () => RestResult.ok({ hello: 'world' })));
            const response = await fetch(url);
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ hello: 'world' });
        });

        it('renders bodyless success results', async () => {
            const { url } = await serve(router => router.post('/', () => RestResult.noContent()));
            const response = await send('POST', url);
            expect(response.status).to.equal(204);
            expect(await response.text()).to.equal('');
        });

        it('renders error results in the uniform error format', async () => {
            const { url } = await serve(router => router.get('/', () => RestResult.conflict('busy')));
            const response = await fetch(url);
            expect(response.status).to.equal(409);
            expect(await response.json()).to.deep.equal({ error: 'busy' });
        });

        it('passes path parameters to handlers', async () => {
            const { url } = await serve(router => router.get('/items/:itemId', ({ params }) => RestResult.ok({ item: params.itemId })));
            const response = await fetch(`${url}/items/42`);
            expect(await response.json()).to.deep.equal({ item: '42' });
        });

        it('passes schema-valid bodies to handlers', async () => {
            const { url } = await serve(router => router.post('/echo', { bodySchema: ECHO_SCHEMA }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, { text: 'hello' });
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ echo: 'hello' });
        });

        it('rejects bodies violating the schema with the validation errors as details', async () => {
            const { url } = await serve(router => router.post('/echo', { bodySchema: ECHO_SCHEMA }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, { text: 42 });
            expect(response.status).to.equal(400);
            const error = await response.json();
            expect(error.error).to.equal('invalid request');
            expect(error.details).to.have.length(1);
            expect(error.details[0]).to.contain('text');
        });

        it('rejects bodies failing the custom validation with its message', async () => {
            const { url } = await serve(router => router.post('/echo', {
                bodySchema: ECHO_SCHEMA,
                validate: body => body.text.trim() ? undefined : 'text must not be blank'
            }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, { text: '   ' });
            expect(response.status).to.equal(400);
            expect(await response.json()).to.deep.equal({ error: 'invalid request', details: ['text must not be blank'] });
        });

        it('treats an empty custom validation message as valid', async () => {
            const { url } = await serve(router => router.post('/echo', {
                bodySchema: ECHO_SCHEMA,
                validate: () => ''
            }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, { text: 'hello' });
            expect(response.status).to.equal(200);
        });

        it('rejects malformed JSON bodies', async () => {
            const { url } = await serve(router => router.post('/echo', { bodySchema: ECHO_SCHEMA }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, 'not json');
            expect(response.status).to.equal(400);
            expect(await response.json()).to.deep.equal({ error: 'invalid request' });
        });

        it('rejects bodies exceeding the size limit with their client error status', async () => {
            const { url } = await serve(router => router.post('/echo', { bodySchema: ECHO_SCHEMA, jsonLimit: '1kb' }, ({ body }) => RestResult.ok({ echo: body.text })));
            const response = await send('POST', `${url}/echo`, { text: 'x'.repeat(2000) });
            expect(response.status).to.equal(413);
            expect(await response.json()).to.deep.equal({ error: 'payload too large' });
        });

        it('reduces handler errors to internal errors', async () => {
            const { url } = await serve(router => router.get('/', () => { throw new Error('boom'); }));
            const response = await fetch(url);
            expect(response.status).to.equal(500);
            expect(await response.json()).to.deep.equal({ error: 'internal error' });
        });

        it('records typed routes and event streams for the OpenAPI document', async () => {
            const { router } = await serve(r => {
                r.get('/', { operationId: 'listItems' }, () => RestResult.ok({}));
                r.post('/', { bodySchema: ECHO_SCHEMA, summary: 'Echo.' }, ({ body }) => RestResult.ok({ echo: body.text }));
                r.eventStream('/events', { event: 'items' });
            });
            expect(router.routeRegistrations.map(route => ({ method: route.method, path: route.path }))).to.deep.equal([
                { method: 'get', path: '/' },
                { method: 'post', path: '/' }
            ]);
            expect(router.routeRegistrations[0].documentation?.operationId).to.equal('listItems');
            expect(router.routeRegistrations[1].bodySchema).to.equal(ECHO_SCHEMA);
            expect(router.eventStreamRegistrations.map(stream => stream.path)).to.deep.equal(['/events']);
        });

        it('answers unmatched paths below the contribution with the uniform JSON 404', async () => {
            const { url } = await serve(router => router.get('/', () => RestResult.ok({})));
            const response = await fetch(`${url}/no-such-route`);
            expect(response.status).to.equal(404);
            expect(await response.json()).to.deep.equal({ error: 'not found' });
        });

        it('reports whether requests are authorized to handlers', async () => {
            const { url } = await serve(
                router => router.get('/', ({ authorized }) => RestResult.ok({ authorized })),
                request => request.headers.authorization === 'Bearer secret'
            );
            expect(await (await fetch(url)).json()).to.deep.equal({ authorized: false });
            expect(await (await fetch(url, { headers: { authorization: 'Bearer secret' } })).json()).to.deep.equal({ authorized: true });
        });

        it('treats requests as authorized without an authorization check', async () => {
            const { url } = await serve(router => router.get('/', ({ authorized }) => RestResult.ok({ authorized })));
            expect(await (await fetch(url)).json()).to.deep.equal({ authorized: true });
        });

        it('supports put, patch, and delete routes', async () => {
            const { url } = await serve(router => {
                router.put('/item', { bodySchema: ECHO_SCHEMA }, ({ body }) => RestResult.ok({ put: body.text }));
                router.patch('/item', { bodySchema: ECHO_SCHEMA }, ({ body }) => RestResult.ok({ patched: body.text }));
                router.delete('/item', () => RestResult.noContent());
            });
            expect(await (await send('PUT', `${url}/item`, { text: 'a' })).json()).to.deep.equal({ put: 'a' });
            expect(await (await send('PATCH', `${url}/item`, { text: 'b' })).json()).to.deep.equal({ patched: 'b' });
            expect((await send('DELETE', `${url}/item`)).status).to.equal(204);
        });
    });

    describe('raw routes', () => {
        it('serves raw routes alongside typed routes', async () => {
            const { url } = await serve(router => {
                router.get('/', () => RestResult.ok({ typed: true }));
                router.raw.get('/custom', (request, response) => response.status(418).send('teapot'));
            });
            expect(await (await fetch(url)).json()).to.deep.equal({ typed: true });
            const custom = await fetch(`${url}/custom`);
            expect(custom.status).to.equal(418);
            expect(await custom.text()).to.equal('teapot');
        });

        it('reduces unhandled raw route errors to the uniform error format', async () => {
            const { url } = await serve(router => router.raw.get('/boom', () => { throw new Error('boom'); }));
            const response = await fetch(`${url}/boom`);
            expect(response.status).to.equal(500);
            expect(await response.json()).to.deep.equal({ error: 'internal error' });
        });

        it('keeps the status of unhandled raw route client errors', async () => {
            const { url } = await serve(router => router.raw.get('/missing', () => { throw Object.assign(new Error('nope'), { status: 404 }); }));
            const response = await fetch(`${url}/missing`);
            expect(response.status).to.equal(404);
            expect(await response.json()).to.deep.equal({ error: 'not found' });
        });
    });

    describe('event streams', () => {
        it('serves event streams and closes them on dispose', async () => {
            const { url, router } = await serve(r => r.eventStream('/events', { event: 'items', snapshot: () => ({ items: [1] }) }));
            const response = await fetch(`${url}/events`);
            expect(response.status).to.equal(200);
            expect(response.headers.get('content-type')).to.equal('text/event-stream');
            const events = ExternalApiTestSupport.sseReader(response);
            const first = await events.next();
            expect(first).to.contain('event: items');
            expect(first).to.contain('data: {"items":[1]}');
            router.dispose();
            expect(await events.next()).to.equal(undefined);
        });
    });
});
