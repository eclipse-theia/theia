/********************************************************************************
 * Copyright (C) 2026 EclipseSource GmbH.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import * as http from 'http';
import * as net from 'net';
import * as tls from 'tls';
import { AddressInfo } from 'net';
import { Agent, Dispatcher, fetch, getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { createProxyDispatcher, getProxyAgent, ProxySettings } from './proxy';

describe('proxy', () => {
    describe('getProxyAgent', () => {
        it('should return undefined for invalid request URLs', () => {
            expect(getProxyAgent('not-a-url', {}, { proxyUrl: 'http://proxy.example.com:8080' })).to.be.undefined;
        });
    });

    describe('createProxyDispatcher', () => {
        it('should return undefined when no proxy is configured', () => {
            expect(createProxyDispatcher({})).to.be.undefined;
        });

        it('should return undefined for non-http proxy protocols', () => {
            expect(createProxyDispatcher({}, { proxyUrl: 'socks5://proxy.example.com:1080' })).to.be.undefined;
        });

        it('should return undefined for invalid proxy URLs', () => {
            expect(createProxyDispatcher({}, { proxyUrl: 'not-a-valid-url' })).to.be.undefined;
        });

        it('should return an Agent when strictSSL is false and no proxy is set', () => {
            expect(createProxyDispatcher({}, { strictSSL: false })).to.be.instanceOf(Agent);
        });

        it('should share one Agent per CA list when no proxy is used', () => {
            const ca = tls.getCACertificates('default');
            const agent = createProxyDispatcher({}, { ca });
            expect(agent).to.be.instanceOf(Agent);
            expect(createProxyDispatcher({}, { ca })).to.equal(agent);
            expect(createProxyDispatcher({}, { ca: [...ca] })).to.not.equal(agent);
        });

        it('should not share the Agent that skips certificate verification', () => {
            const ca = tls.getCACertificates('default');
            const shared = createProxyDispatcher({}, { ca });
            const insecure = createProxyDispatcher({}, { ca, strictSSL: false });
            expect(insecure).to.be.instanceOf(Agent);
            expect(insecure).to.not.equal(shared);
        });

        describe('routing', () => {
            /** A host that is not a loopback host, the proxy tunnels it to the target server. */
            const proxiedHost = 'example.test';
            let target: http.Server;
            let proxy: http.Server;
            let targetPort: number;
            let proxyURL: string;
            /** The `host:port` of each CONNECT request the proxy received. */
            let tunnels: string[];
            /** The `Proxy-Authorization` header of each CONNECT request the proxy received. */
            let authorizations: (string | undefined)[];

            before(async () => {
                target = http.createServer((req, res) => {
                    if (req.url === '/redirect') {
                        res.writeHead(302, { location: `http://${proxiedHost}/` }).end();
                    } else {
                        res.end('ok');
                    }
                });
                proxy = http.createServer();
                proxy.on('connect', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
                    tunnels.push(req.url!);
                    authorizations.push(req.headers['proxy-authorization']);
                    const upstream = net.connect(targetPort, '127.0.0.1', () => {
                        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                        upstream.write(head);
                        upstream.pipe(socket);
                        socket.pipe(upstream);
                    });
                    upstream.on('error', () => socket.destroy());
                    socket.on('error', () => upstream.destroy());
                });
                targetPort = await listen(target);
                proxyURL = `http://127.0.0.1:${await listen(proxy)}`;
            });

            after(() => {
                target.close();
                proxy.close();
            });

            beforeEach(() => {
                tunnels = [];
                authorizations = [];
            });

            async function request(url: string, env: typeof process.env, options?: ProxySettings): Promise<void> {
                const dispatcher = createProxyDispatcher(env, options);
                try {
                    const response = await fetch(url, { dispatcher });
                    expect(await response.text()).to.equal('ok');
                } finally {
                    await dispatcher?.close();
                }
            }

            /**
             * Sends a request that fails: an `https:` request fails behind the tunnel because the target server does not speak TLS,
             * and a request to the proxied host fails without the proxy because the host does not resolve.
             */
            async function requestFailing(url: string, env: typeof process.env, options?: ProxySettings): Promise<void> {
                const dispatcher = createProxyDispatcher(env, options);
                try {
                    await fetch(url, { dispatcher }).catch(() => undefined);
                } finally {
                    await dispatcher?.destroy();
                }
            }

            it('should use the proxy of the HTTP_PROXY env variable', async () => {
                await request(`http://${proxiedHost}/`, { HTTP_PROXY: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:80`]);
            });

            it('should use the proxy of the http_proxy env variable', async () => {
                await request(`http://${proxiedHost}/`, { http_proxy: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:80`]);
            });

            it('should prefer the http_proxy env variable over HTTP_PROXY', async () => {
                await request(`http://${proxiedHost}/`, { HTTP_PROXY: 'http://127.0.0.1:1', http_proxy: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:80`]);
            });

            it('should use the proxy of the HTTPS_PROXY env variable for https URLs', async () => {
                await requestFailing(`https://${proxiedHost}/`, { HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:443`]);
            });

            it('should fall back to the HTTP_PROXY env variable for https URLs', async () => {
                await requestFailing(`https://${proxiedHost}/`, { HTTP_PROXY: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:443`]);
            });

            it('should prefer the proxyUrl option over environment variables', async () => {
                await request(`http://${proxiedHost}/`, { HTTP_PROXY: 'http://127.0.0.1:1' }, { proxyUrl: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:80`]);
            });

            it('should bypass the proxy for hosts of the noProxy option', async () => {
                await requestFailing(`http://${proxiedHost}/`, {}, { proxyUrl: proxyURL, noProxy: [proxiedHost] });
                expect(tunnels).to.be.empty;
            });

            it('should combine the noProxy option with the NO_PROXY env variable', async () => {
                const env = { NO_PROXY: `other.${proxiedHost}` };
                const options = { proxyUrl: proxyURL, noProxy: [proxiedHost] };
                await requestFailing(`http://${proxiedHost}/`, env, options);
                await requestFailing(`http://other.${proxiedHost}/`, env, options);
                expect(tunnels).to.be.empty;
            });

            it('should bypass the proxy for all hosts when the rules contain `*`', async () => {
                await requestFailing(`http://${proxiedHost}/`, { NO_PROXY: 'example.com' }, { proxyUrl: proxyURL, noProxy: ['*'] });
                expect(tunnels).to.be.empty;
            });

            it('should decide again for the target of a redirect', async () => {
                await request(`http://localhost:${targetPort}/redirect`, {}, { proxyUrl: proxyURL });
                expect(tunnels).to.deep.equal([`${proxiedHost}:80`]);
            });

            it('should send the proxyAuthorization option to the proxy', async () => {
                await request(`http://${proxiedHost}/`, {}, { proxyUrl: proxyURL, proxyAuthorization: 'Basic dG9rZW4=' });
                expect(authorizations).to.deep.equal(['Basic dG9rZW4=']);
            });

            it('should prefer the credentials of the proxy URL over the proxyAuthorization option', async () => {
                const proxyWithCredentials = proxyURL.replace('http://', 'http://user:pass@');
                await request(`http://${proxiedHost}/`, {}, { proxyUrl: proxyWithCredentials, proxyAuthorization: 'Basic dG9rZW4=' });
                expect(authorizations).to.deep.equal([`Basic ${Buffer.from('user:pass').toString('base64')}`]);
            });

            it('should send the proxyAuthorization option if the proxy URL has a username but no password', async () => {
                const proxyWithUsername = proxyURL.replace('http://', 'http://user@');
                await request(`http://${proxiedHost}/`, {}, { proxyUrl: proxyWithUsername, proxyAuthorization: 'Basic dG9rZW4=' });
                expect(authorizations).to.deep.equal(['Basic dG9rZW4=']);
            });

            it('should use the proxy for hosts that only look like loopback hosts', async () => {
                await request(`http://localhost.${proxiedHost}/`, {}, { proxyUrl: proxyURL });
                await request(`http://127.0.0.1.${proxiedHost}/`, {}, { proxyUrl: proxyURL });
                expect(tunnels).to.deep.equal([`localhost.${proxiedHost}:80`, `127.0.0.1.${proxiedHost}:80`]);
            });

            describe('loopback hosts', () => {
                let globalDispatcher: Dispatcher;
                let mockAgent: MockAgent;

                // Loopback requests go to the global dispatcher, which answers them without a connection here
                beforeEach(() => {
                    globalDispatcher = getGlobalDispatcher();
                    mockAgent = new MockAgent();
                    mockAgent.disableNetConnect();
                    setGlobalDispatcher(mockAgent);
                });

                afterEach(async () => {
                    setGlobalDispatcher(globalDispatcher);
                    await mockAgent.close();
                });

                for (const url of ['http://localhost:3000', 'https://LOCALHOST', 'http://app.localhost:8080', 'http://127.0.0.1:3000', 'http://127.1.2.3', 'http://[::1]:3000']) {
                    it(`should not use a proxy for the loopback URL ${url}`, async () => {
                        mockAgent.get(new URL(url).origin).intercept({ path: '/' }).reply(200, 'ok');
                        const env = { HTTP_PROXY: proxyURL, HTTPS_PROXY: proxyURL };
                        await request(url, env, { proxyUrl: proxyURL });
                        expect(tunnels).to.be.empty;
                    });
                }
            });
        });
    });
});

async function listen(server: http.Server): Promise<number> {
    await new Promise<void>(resolve => server.listen(0, resolve));
    return (server.address() as AddressInfo).port;
}
