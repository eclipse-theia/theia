// *****************************************************************************
// Copyright (C) 2026 Panagiotis Georgakopoulos and others.
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

import { expect } from 'chai';
import { constants } from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import { Duplex } from 'stream';
import tls from 'tls';
import { createFetchPatch, createHttpPatch, createProxyResolver, createTlsPatch, resetCaches } from '@vscode/proxy-agent';
import { createProxyAgentParams } from './plugin-host-proxy.js';

describe('plugin host proxy', () => {

    let settings: Record<string, unknown>;

    const configProvider = {
        getConfiguration: () => ({ get: (key: string) => settings[key] })
    } as unknown as Parameters<typeof createProxyAgentParams>[1];
    const workspaceExt = { resolveProxy: async () => undefined };

    beforeEach(() => {
        settings = {};
        resetCaches();
    });

    function createParams(): ReturnType<typeof createProxyAgentParams> {
        return createProxyAgentParams(workspaceExt, configProvider, { loadAdditionalCertificates: async () => [TEST_ROOT_CERTIFICATE] });
    }

    describe('createProxyAgentParams', () => {

        it('should use the defaults of the preferences', () => {
            const params = createParams();
            expect(params.getProxyURL()).to.be.undefined;
            expect(params.getProxySupport()).to.equal('override');
            expect(params.getNoProxyConfig!()).to.deep.equal([]);
            expect(params.isAdditionalFetchSupportEnabled()).to.be.true;
            expect(params.isWebSocketPatchEnabled()).to.be.true;
            expect(params.addCertificatesV1()).to.be.true;
            expect(params.addCertificatesV2()).to.be.false;
            expect(params.loadSystemCertificatesFromNode()).to.be.true;
        });

        it('should read the preferences on every call', () => {
            const params = createParams();
            settings = {
                proxy: 'http://proxy.example.com:8080',
                proxySupport: 'fallback',
                noProxy: ['example.org'],
                fetchAdditionalSupport: false,
                systemCertificates: false
            };
            expect(params.getProxyURL()).to.equal('http://proxy.example.com:8080');
            expect(params.getProxySupport()).to.equal('fallback');
            expect(params.getNoProxyConfig!()).to.deep.equal(['example.org']);
            expect(params.isAdditionalFetchSupportEnabled()).to.be.false;
            expect(params.addCertificatesV1()).to.be.false;
        });

        it('should use the defaults while the preferences are not available', () => {
            const uninitialized = {
                getConfiguration: () => {
                    throw new TypeError("Cannot read properties of undefined (reading 'getValue')");
                }
            } as unknown as Parameters<typeof createProxyAgentParams>[1];
            const params = createProxyAgentParams(workspaceExt, uninitialized);
            expect(params.getProxySupport()).to.equal('override');
            expect(params.addCertificatesV1()).to.be.true;
            expect(() => createProxyResolver(params)).to.not.throw();
        });

        it('should treat an empty proxy setting as no proxy', () => {
            settings = { proxy: '' };
            expect(createParams().getProxyURL()).to.be.undefined;
        });
    });

    describe('requests', () => {
        let tlsServer: https.Server;
        let tlsPort: number;
        let tunnelProxy: http.Server;
        let tunnelProxyUrl: string;
        let tunnels: string[];
        const sockets = new Set<Duplex>();
        let originalCreateSecureContext: typeof tls.createSecureContext;
        let originalConnect: typeof tls.connect;

        before(done => {
            originalCreateSecureContext = tls.createSecureContext;
            originalConnect = tls.connect;
            // without session resumption, so that every request verifies the certificate
            tlsServer = https.createServer({ key: TEST_LEAF_KEY, cert: TEST_LEAF_CERTIFICATE, secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('secure');
            });
            tlsServer.on('connection', socket => sockets.add(socket));
            // a proxy that tunnels every CONNECT to the TLS server, whatever host was asked for
            tunnelProxy = http.createServer();
            tunnelProxy.on('connect', (req: http.IncomingMessage, clientSocket: Duplex, head: Buffer) => {
                tunnels.push(req.url ?? '');
                const serverSocket = net.connect(tlsPort, '127.0.0.1', () => {
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    serverSocket.write(head);
                    serverSocket.pipe(clientSocket);
                    clientSocket.pipe(serverSocket);
                });
                sockets.add(clientSocket).add(serverSocket);
                serverSocket.on('error', () => clientSocket.destroy());
                clientSocket.on('error', () => serverSocket.destroy());
            });
            tlsServer.listen(0, '127.0.0.1', () => {
                tlsPort = (tlsServer.address() as net.AddressInfo).port;
                tunnelProxy.listen(0, '127.0.0.1', () => {
                    tunnelProxyUrl = `http://127.0.0.1:${(tunnelProxy.address() as net.AddressInfo).port}`;
                    done();
                });
            });
        });

        after(done => {
            tunnelProxy.close(() => tlsServer.close(done));
        });

        beforeEach(() => {
            tunnels = [];
        });

        afterEach(() => {
            Object.assign(tls, { createSecureContext: originalCreateSecureContext, connect: originalConnect });
            sockets.forEach(socket => socket.destroy());
            sockets.clear();
        });

        function httpsGet(url: string): Promise<string> {
            const params = createParams();
            Object.assign(tls, createTlsPatch(params, tls));
            const { get } = createHttpPatch(params, https, createProxyResolver(params).resolveProxyWithRequest);
            return new Promise((resolve, reject) => {
                get(url, {}, (res: http.IncomingMessage) => {
                    let body = '';
                    res.on('data', (chunk: Buffer) => body += chunk);
                    res.on('end', () => resolve(body));
                }).on('error', reject);
            });
        }

        async function patchedFetch(url: string): Promise<string> {
            const params = createParams();
            const fetch = createFetchPatch(params, globalThis.fetch, createProxyResolver(params).resolveProxyURL);
            const response = await fetch(url);
            return response.text();
        }

        async function expectFailure(promise: Promise<unknown>): Promise<void> {
            try {
                await promise;
            } catch {
                return;
            }
            throw new Error('expected the request to fail');
        }

        it('should add the system certificates to the trust of the http(s) modules', async () => {
            expect(await httpsGet(`https://localhost:${tlsPort}/`)).to.equal('secure');
        });

        it('should not add the system certificates to the trust of the http(s) modules when disabled', async () => {
            settings = { systemCertificates: false };
            await expectFailure(httpsGet(`https://localhost:${tlsPort}/`));
        });

        it('should add the system certificates to the trust of fetch', async () => {
            expect(await patchedFetch(`https://localhost:${tlsPort}/`)).to.equal('secure');
        });

        it('should leave fetch alone when its additional support is disabled', async () => {
            settings = { fetchAdditionalSupport: false };
            await expectFailure(patchedFetch(`https://localhost:${tlsPort}/`));
        });

        it('should send fetch requests through the proxy of the preferences', async () => {
            settings = { proxy: tunnelProxyUrl };
            expect(await patchedFetch(`https://theia-test.example:${tlsPort}/`)).to.equal('secure');
            expect(tunnels).to.deep.equal([`theia-test.example:${tlsPort}`]);
        });

        it('should not send fetch requests for hosts of http.noProxy through the proxy', async () => {
            settings = { proxy: tunnelProxyUrl, noProxy: ['theia-test.example'] };
            // the host does not resolve, so a direct request fails
            await expectFailure(patchedFetch(`https://theia-test.example:${tlsPort}/`));
            expect(tunnels).to.deep.equal([]);
        });

        it('should not send fetch requests for localhost through the proxy', async () => {
            settings = { proxy: tunnelProxyUrl };
            expect(await patchedFetch(`https://localhost:${tlsPort}/`)).to.equal('secure');
            expect(tunnels).to.deep.equal([]);
        });
    });
});

// A test CA and a certificate it issued for `localhost`, `127.0.0.1` and `theia-test.example`, valid until 2126.
const TEST_ROOT_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBoTCCAUegAwIBAgIUMhem9+3+sb0i7CUk2OHBikwYsLgwCgYIKoZIzj0EAwIw
HTEbMBkGA1UEAwwSVGhlaWEgVGVzdCBSb290IENBMCAXDTI2MTExMTE3MzQxOVoY
DzIxMjYxMDE4MTczNDE5WjAdMRswGQYDVQQDDBJUaGVpYSBUZXN0IFJvb3QgQ0Ew
WTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARULdMYsl2bysGj5S0lglBMc27JKjnl
VHq8QPqRzb/n9K0XfePxqU1fTdzMOdOgS0FrFsIman8qNoHO0x55WS2Co2MwYTAd
BgNVHQ4EFgQUp7Mf9BCOPWigEMBjsTLjfHPwNpswHwYDVR0jBBgwFoAUp7Mf9BCO
PWigEMBjsTLjfHPwNpswDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwIDSAAwRQIhAMjU3qpexGUDLewlvRcDFXSMhuQa+N7ZhaXDyZ46
D8/eAiAe784y/BIWfp07BKly4oTtkTwPAONKOf9RS9jnIozBHg==
-----END CERTIFICATE-----
`;

const TEST_LEAF_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIB2TCCAX+gAwIBAgIULoP/Rb/AOeLCXkhKzhorQXgw3RUwCgYIKoZIzj0EAwIw
HTEbMBkGA1UEAwwSVGhlaWEgVGVzdCBSb290IENBMCAXDTI2MTExMTE3MzQxOVoY
DzIxMjYxMDE4MTczNDE5WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjO
PQIBBggqhkjOPQMBBwNCAASMHCfAiSXjGjn1SXt4aUxsxq2wkTPfOqr3+aBO3ymw
jrpq8O6HQQ4eq4UF7G3sHQL3TYW+hZdR8ldpgM5SVMuro4GjMIGgMAkGA1UdEwQC
MAAwDgYDVR0PAQH/BAQDAgeAMBMGA1UdJQQMMAoGCCsGAQUFBwMBMC4GA1UdEQQn
MCWCCWxvY2FsaG9zdIcEfwAAAYISdGhlaWEtdGVzdC5leGFtcGxlMB0GA1UdDgQW
BBTB0tTdLZuPwnYCWGYApVxssEyiOjAfBgNVHSMEGDAWgBSnsx/0EI49aKAQwGOx
MuN8c/A2mzAKBggqhkjOPQQDAgNIADBFAiAPAfZmAyClZigcjWNrq8W/vecVi+Sv
aebYzhkVv5Ea3wIhAIJnIIDENlP9KymdpKUO5Omyzb9bEotAu44Ap9EZbXI6
-----END CERTIFICATE-----
`;

const TEST_LEAF_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg2govYeQf0yzCGKfU
fB26QFykGAZwmtuF+BDaRO1hFZahRANCAASMHCfAiSXjGjn1SXt4aUxsxq2wkTPf
Oqr3+aBO3ymwjrpq8O6HQQ4eq4UF7G3sHQL3TYW+hZdR8ldpgM5SVMur
-----END PRIVATE KEY-----
`;
