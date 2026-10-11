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

import { Disposable } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import * as express from '@theia/core/shared/express';
import { expect } from 'chai';
import * as http from 'http';
import * as net from 'net';
import { ExternalApiContribution } from './external-api-contribution';
import { ExternalApiResponseWriterImpl } from './external-api-response-writer';
import { ExternalApiRouterOptions } from './external-api-router';
import { ExternalApiServer } from './external-api-server';
import { OpenApiDocumentBuilderImpl } from './openapi-document-builder';
import { OpenApiSpecContribution } from './openapi-spec-contribution';
import { RestResult } from './rest-result';
import { ExternalApiTestSupport } from './test/external-api-test-support';

describe('ExternalApiServer', () => {

    const pingContribution: ExternalApiContribution = {
        path: '/api/ping',
        configure: router => router.get('/', () => RestResult.ok({ pong: true }))
    };

    const publicContribution: ExternalApiContribution = {
        path: '/public',
        unprotected: true,
        configure: router => router.get('/', () => RestResult.ok({ public: true }))
    };

    let server: ExternalApiServer | undefined;
    let mainServer: http.Server | undefined;
    /** The document builder injected into each created server, for the spec contribution to read. */
    const documentBuilders = new WeakMap<ExternalApiServer, OpenApiDocumentBuilderImpl>();

    afterEach(async () => {
        await server?.updateConfig({ delivery: 'off', port: 0, hostname: '127.0.0.1' });
        server = undefined;
        mainServer?.close();
        mainServer = undefined;
    });

    function createServer(contributions: ExternalApiContribution[] = [pingContribution, publicContribution]): ExternalApiServer {
        const documentBuilder = ExternalApiTestSupport.inject(new OpenApiDocumentBuilderImpl(), {
            applicationPackage: {
                pck: { version: '1.2.3' },
                props: { frontend: { config: { applicationName: 'My IDE' } } }
            }
        });
        server = ExternalApiTestSupport.inject(new ExternalApiServer(), {
            logger: new MockLogger(),
            contributions: { getContributions: () => contributions },
            responseWriter: new ExternalApiResponseWriterImpl(),
            routerFactory: ExternalApiTestSupport.createRouterFactory(),
            documentBuilder
        });
        documentBuilders.set(server, documentBuilder);
        return server;
    }

    /** Creates a spec contribution reading from the given server's document builder. */
    function createSpecContribution(apiServer: ExternalApiServer): OpenApiSpecContribution {
        return ExternalApiTestSupport.inject(new OpenApiSpecContribution(), { builder: documentBuilders.get(apiServer) });
    }

    /** Replaces the server's logger with one recording the warning messages. */
    function captureWarnings(apiServer: ExternalApiServer): string[] {
        const warnings: string[] = [];
        ExternalApiTestSupport.inject(apiServer, {
            logger: Object.assign(new MockLogger(), {
                warn: async (message: string) => { warnings.push(message); }
            })
        });
        return warnings;
    }

    /** Simulates Theia's main HTTP server with the api server's middleware installed. */
    async function serveMainApp(apiServer: ExternalApiServer): Promise<string> {
        const app = express();
        apiServer.configure(app);
        // a route of the main server outside the external API, e.g. Theia's own endpoints
        app.get('/main', (request: express.Request, response: express.Response) => {
            response.json({ main: true });
        });
        await new Promise<void>(resolve => {
            mainServer = app.listen(0, '127.0.0.1', () => resolve());
        });
        return `http://127.0.0.1:${(mainServer!.address() as net.AddressInfo).port}`;
    }

    function freePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const probe = net.createServer();
            probe.listen(0, '127.0.0.1', () => {
                const port = (probe.address() as net.AddressInfo).port;
                probe.close(() => resolve(port));
            });
            probe.on('error', reject);
        });
    }

    async function expectUnreachable(url: string): Promise<void> {
        try {
            await fetch(url);
        } catch {
            return;
        }
        expect.fail(`expected ${url} to be unreachable`);
    }

    describe('separatePort delivery', () => {
        it('does not serve when delivery is off', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'off', port, hostname: '127.0.0.1' });
            await expectUnreachable(`http://127.0.0.1:${port}/api/ping`);
        });

        it('does not serve without a configured port', async () => {
            const apiServer = createServer();
            const warnings = captureWarnings(apiServer);
            await apiServer.updateConfig({ delivery: 'separatePort', port: 0, hostname: '127.0.0.1' });
            expect(warnings).to.have.length(1);
            expect(warnings[0]).to.contain('no port is configured');
        });

        it('serves contributions without verification when no token is configured', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ pong: true });
        });

        it('protects contributions when a token is configured', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });

            const unauthorized = await fetch(`http://127.0.0.1:${port}/api/ping`);
            expect(unauthorized.status).to.equal(401);
            expect(await unauthorized.json()).to.deep.equal({ error: 'unauthorized' });

            const wrongToken = await fetch(`http://127.0.0.1:${port}/api/ping`, { headers: { authorization: 'Bearer wrong' } });
            expect(wrongToken.status).to.equal(401);

            const authorized = await fetch(`http://127.0.0.1:${port}/api/ping`, { headers: { authorization: 'Bearer secret' } });
            expect(authorized.status).to.equal(200);
            expect(await authorized.json()).to.deep.equal({ pong: true });
        });

        it('serves unprotected contributions without a token', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });
            const response = await fetch(`http://127.0.0.1:${port}/public`);
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ public: true });
        });

        it('answers unmatched paths with the uniform JSON 404', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            const belowContribution = await fetch(`http://127.0.0.1:${port}/api/ping/no-such-route`);
            expect(belowContribution.status).to.equal(404);
            expect(await belowContribution.json()).to.deep.equal({ error: 'not found' });
            const outsideContributions = await fetch(`http://127.0.0.1:${port}/no-such-contribution`);
            expect(outsideContributions.status).to.equal(404);
            expect(await outsideContributions.json()).to.deep.equal({ error: 'not found' });
        });

        it('treats an empty token as no token', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: '' });
            const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
            expect(response.status).to.equal(200);
        });

        it('warns when serving on a non-local hostname without a token', async () => {
            const apiServer = createServer();
            const warnings = captureWarnings(apiServer);
            ExternalApiTestSupport.inject(apiServer, {
                // do not bind real sockets: '0.0.0.0' would listen on all interfaces
                start: () => Promise.resolve(http.createServer())
            });
            await apiServer.updateConfig({ delivery: 'separatePort', port: 3100, hostname: '127.0.0.1' });
            expect(warnings).to.have.length(0);
            await apiServer.updateConfig({ delivery: 'separatePort', port: 3100, hostname: '0.0.0.0' });
            expect(warnings).to.have.length(1);
            expect(warnings[0]).to.contain('0.0.0.0');
            await apiServer.updateConfig({ delivery: 'separatePort', port: 3100, hostname: '0.0.0.0', token: 'secret' });
            expect(warnings).to.have.length(1);
        });

        it('falls back to the default hostname when the configured hostname is blank', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '  ' });
            // the default hostname 'localhost' may resolve to either loopback address
            const served = await Promise.allSettled([
                fetch(`http://127.0.0.1:${port}/api/ping`),
                fetch(`http://[::1]:${port}/api/ping`)
            ]);
            const statuses = served.filter(result => result.status === 'fulfilled').map(result => result.value.status);
            expect(statuses).to.contain(200);
        });

        it('retries a failed port bind when the same configuration is pushed again', async () => {
            const apiServer = createServer();
            const port = await freePort();
            // occupy the port so that starting the external API server fails
            const blocker = net.createServer();
            await new Promise<void>((resolve, reject) => {
                blocker.listen(port, '127.0.0.1', () => resolve());
                blocker.on('error', reject);
            });
            try {
                await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            } finally {
                await new Promise<void>(resolve => blocker.close(() => resolve()));
            }
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).to.equal(200);
        });

        it('keeps applying configuration changes after a failed routing build', async () => {
            const apiServer = createServer();
            const routerFactory = ExternalApiTestSupport.createRouterFactory();
            let failBuild = true;
            ExternalApiTestSupport.inject(apiServer, {
                routerFactory: (options: ExternalApiRouterOptions) => {
                    if (failBuild) {
                        throw new Error('cannot create a router');
                    }
                    return routerFactory(options);
                }
            });
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            await expectUnreachable(`http://127.0.0.1:${port}/api/ping`);
            // the routing of the failed build is dropped instead of being documented as served
            expect(documentBuilders.get(apiServer)!.build().paths).to.deep.equal({});
            failBuild = false;
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).to.equal(200);
        });

        it('stops when delivery is set back to off', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).to.equal(200);
            await apiServer.updateConfig({ delivery: 'off', port, hostname: '127.0.0.1' });
            await expectUnreachable(`http://127.0.0.1:${port}/api/ping`);
        });

        it('moves to another port on configuration change', async () => {
            const apiServer = createServer();
            const firstPort = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port: firstPort, hostname: '127.0.0.1' });
            const secondPort = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port: secondPort, hostname: '127.0.0.1' });
            await expectUnreachable(`http://127.0.0.1:${firstPort}/api/ping`);
            expect((await fetch(`http://127.0.0.1:${secondPort}/api/ping`)).status).to.equal(200);
        });
    });

    describe('samePort delivery', () => {
        it('serves contributions on the main HTTP server', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            await apiServer.updateConfig({ delivery: 'samePort', port: 0, hostname: '127.0.0.1' });
            const response = await fetch(`${base}/api/ping`);
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ pong: true });
        });

        it('protects contributions on the main HTTP server when a token is configured', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            await apiServer.updateConfig({ delivery: 'samePort', port: 0, hostname: '127.0.0.1', token: 'secret' });
            expect((await fetch(`${base}/api/ping`)).status).to.equal(401);
            expect((await fetch(`${base}/api/ping`, { headers: { authorization: 'Bearer secret' } })).status).to.equal(200);
            expect((await fetch(`${base}/public`)).status).to.equal(200);
        });

        it('stops serving on the main HTTP server when delivery is set back to off', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            await apiServer.updateConfig({ delivery: 'samePort', port: 0, hostname: '127.0.0.1' });
            expect((await fetch(`${base}/api/ping`)).status).to.equal(200);
            await apiServer.updateConfig({ delivery: 'off', port: 0, hostname: '127.0.0.1' });
            expect((await fetch(`${base}/api/ping`)).status).to.equal(404);
        });

        it('switches between samePort and separatePort delivery', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'samePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`${base}/api/ping`)).status).to.equal(200);
            await expectUnreachable(`http://127.0.0.1:${port}/api/ping`);

            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`${base}/api/ping`)).status).to.equal(404);
            expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).to.equal(200);
        });
    });

    describe('cross-origin guard', () => {
        it('rejects requests carrying an Origin header on the separate port', async () => {
            const apiServer = createServer();
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });
            const crossOrigin = await fetch(`http://127.0.0.1:${port}/api/ping`,
                { headers: { origin: 'https://evil.example', authorization: 'Bearer secret' } });
            expect(crossOrigin.status).to.equal(403);
            expect(await crossOrigin.json()).to.deep.equal({ error: 'forbidden' });
            const external = await fetch(`http://127.0.0.1:${port}/api/ping`, { headers: { authorization: 'Bearer secret' } });
            expect(external.status).to.equal(200);
        });

        it('rejects requests carrying an Origin header with samePort delivery', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            await apiServer.updateConfig({ delivery: 'samePort', port: 0, hostname: '127.0.0.1' });
            const crossOrigin = await fetch(`${base}/api/ping`, { headers: { origin: 'https://evil.example' } });
            expect(crossOrigin.status).to.equal(403);
            expect((await fetch(`${base}/api/ping`)).status).to.equal(200);
        });

        it('does not guard main server routes outside the contributions with samePort delivery', async () => {
            const apiServer = createServer();
            const base = await serveMainApp(apiServer);
            await apiServer.updateConfig({ delivery: 'samePort', port: 0, hostname: '127.0.0.1' });
            const response = await fetch(`${base}/main`, { headers: { origin: 'https://some.origin' } });
            expect(response.status).to.equal(200);
            expect(await response.json()).to.deep.equal({ main: true });
        });
    });

    describe('routing rebuild', () => {
        it('disposes the previous build on effective configuration changes only', async () => {
            let disposals = 0;
            const observingContribution: ExternalApiContribution = {
                path: '/api/observer',
                configure: router => router.toDispose.push(Disposable.create(() => disposals++))
            };
            const apiServer = createServer([observingContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect(disposals).to.equal(0);
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect(disposals).to.equal(0);
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });
            expect(disposals).to.equal(1);
        });

        it('keeps serving other contributions when one fails to configure', async () => {
            const failingContribution: ExternalApiContribution = {
                path: '/api/failing',
                configure: () => { throw new Error('boom'); }
            };
            const apiServer = createServer([failingContribution, pingContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect((await fetch(`http://127.0.0.1:${port}/api/failing`)).status).to.equal(404);
            expect((await fetch(`http://127.0.0.1:${port}/api/ping`)).status).to.equal(200);
        });

        it('serves the first contribution when several declare the same path', async () => {
            const rivalContribution: ExternalApiContribution = {
                path: '/api/ping',
                configure: router => router.get('/', () => RestResult.ok({ rival: true }))
            };
            const apiServer = createServer([pingContribution, rivalContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
            expect(await response.json()).to.deep.equal({ pong: true });
        });

        it('skips a contribution whose path nests with the path of another contribution', async () => {
            const nestedContribution: ExternalApiContribution = {
                path: '/api/ping/nested',
                configure: router => router.get('/', () => RestResult.ok({ nested: true }))
            };
            const apiServer = createServer([pingContribution, nestedContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect(await (await fetch(`http://127.0.0.1:${port}/api/ping`)).json()).to.deep.equal({ pong: true });
            expect((await fetch(`http://127.0.0.1:${port}/api/ping/nested`)).status).to.equal(404);
        });

        it('skips a contribution mounted on the root path, which nests with every path', async () => {
            const rootContribution: ExternalApiContribution = {
                path: '/',
                configure: router => router.get('/', () => RestResult.ok({ root: true }))
            };
            const apiServer = createServer([pingContribution, rootContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect(await (await fetch(`http://127.0.0.1:${port}/api/ping`)).json()).to.deep.equal({ pong: true });
            expect((await fetch(`http://127.0.0.1:${port}/`)).status).to.equal(404);
        });

        it('skips a contribution whose path differs only in a trailing separator', async () => {
            const trailingContribution: ExternalApiContribution = {
                path: '/api/ping/',
                configure: router => router.get('/', () => RestResult.ok({ trailing: true }))
            };
            const apiServer = createServer([pingContribution, trailingContribution]);
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            expect(await (await fetch(`http://127.0.0.1:${port}/api/ping`)).json()).to.deep.equal({ pong: true });
        });
    });

    describe('OpenAPI document', () => {
        it('serves the OpenAPI document describing the served contributions', async () => {
            const contributions: ExternalApiContribution[] = [pingContribution];
            const apiServer = createServer(contributions);
            contributions.push(createSpecContribution(apiServer));
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1' });
            const response = await fetch(`http://127.0.0.1:${port}/api/openapi.json`);
            expect(response.status).to.equal(200);
            const document = await response.json();
            expect(document.openapi).to.equal('3.1.0');
            expect(document.paths).to.have.property('/api/ping');
            expect(document.paths).to.have.property('/api/openapi.json');
            expect(document.components).to.equal(undefined);
        });

        it('declares the bearer protection in the OpenAPI document when a token is configured', async () => {
            const contributions: ExternalApiContribution[] = [pingContribution, publicContribution];
            const apiServer = createServer(contributions);
            contributions.push(createSpecContribution(apiServer));
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });
            const response = await fetch(`http://127.0.0.1:${port}/api/openapi.json`, { headers: { authorization: 'Bearer secret' } });
            const document = await response.json();
            expect(document.components.securitySchemes).to.deep.equal({ bearerAuth: { type: 'http', scheme: 'bearer' } });
            expect(document.paths['/api/ping'].get.security).to.deep.equal([{ bearerAuth: [] }]);
            expect(document.paths['/public'].get.security).to.equal(undefined);
        });

        it('scopes the OpenAPI document to the unprotected contributions for unauthorized requests', async () => {
            const contributions: ExternalApiContribution[] = [pingContribution, publicContribution];
            const apiServer = createServer(contributions);
            contributions.push(createSpecContribution(apiServer));
            const port = await freePort();
            await apiServer.updateConfig({ delivery: 'separatePort', port, hostname: '127.0.0.1', token: 'secret' });

            const unauthorized = await fetch(`http://127.0.0.1:${port}/api/openapi.json`);
            expect(unauthorized.status).to.equal(200);
            const publicDocument = await unauthorized.json();
            expect(publicDocument.paths).to.not.have.property('/api/ping');
            expect(publicDocument.paths).to.have.property('/public');
            expect(publicDocument.paths).to.have.property('/api/openapi.json');
            expect(publicDocument.components).to.equal(undefined);

            const authorized = await fetch(`http://127.0.0.1:${port}/api/openapi.json`, { headers: { authorization: 'Bearer secret' } });
            const fullDocument = await authorized.json();
            expect(fullDocument.paths).to.have.property('/api/ping');
            expect(fullDocument.paths).to.have.property('/public');
        });
    });
});
