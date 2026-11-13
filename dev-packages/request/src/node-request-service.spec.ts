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
import { constants } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import { NodeRequestOptions, NodeRequestService } from './node-request-service';
import { CancellationToken, RequestContext } from './common-request-service';

describe('NodeRequestService', () => {
    let service: NodeRequestService;
    let server: http.Server;
    let serverPort: number;

    before(done => {
        service = new NodeRequestService();
        server = http.createServer((req, res) => {
            if (req.url === '/json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'hello' }));
            } else if (req.url === '/text') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('hello world');
            } else if (req.url === '/echo-headers') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(req.headers));
            } else if (req.url === '/echo-method') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(req.method);
            } else if (req.url === '/echo-body') {
                const chunks: Buffer[] = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(Buffer.concat(chunks).toString());
                });
            } else if (req.url === '/status/404') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('not found');
            } else if (req.url === '/status/500') {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('server error');
            } else if (req.url === '/slow') {
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('slow response');
                }, 5000);
            } else if (req.url === '/empty') {
                res.writeHead(204);
                res.end();
            } else if (req.url === '/redirect') {
                res.writeHead(302, { 'Location': '/text' });
                res.end();
            } else if (req.url === '/redirect-chain') {
                res.writeHead(302, { 'Location': '/redirect' });
                res.end();
            } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('ok');
            }
        });
        server.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                serverPort = addr.port;
            }
            done();
        });
    });

    after(done => {
        server.close(done);
    });

    function url(path: string): string {
        return `http://localhost:${serverPort}${path}`;
    }

    it('should perform a basic GET request', async () => {
        const result = await service.request({ url: url('/text') });
        expect(result.res.statusCode).to.equal(200);
        expect(RequestContext.asText(result)).to.equal('hello world');
    });

    it('should parse JSON responses', async () => {
        const result = await service.request({ url: url('/json') });
        expect(result.res.statusCode).to.equal(200);
        const json = RequestContext.asJson<{ message: string }>(result);
        expect(json.message).to.equal('hello');
    });

    it('should handle non-200 status codes', async () => {
        const result = await service.request({ url: url('/status/404') });
        expect(result.res.statusCode).to.equal(404);
    });

    it('should handle 500 status codes', async () => {
        const result = await service.request({ url: url('/status/500') });
        expect(result.res.statusCode).to.equal(500);
    });

    it('should handle 204 No Content', async () => {
        const result = await service.request({ url: url('/empty') });
        expect(result.res.statusCode).to.equal(204);
        expect(RequestContext.asText(result)).to.equal('');
    });

    it('should send custom headers', async () => {
        const result = await service.request({
            url: url('/echo-headers'),
            headers: { 'X-Custom': 'test-value' }
        });
        const headers = RequestContext.asJson<Record<string, string>>(result);
        expect(headers['x-custom']).to.equal('test-value');
    });

    it('should use specified HTTP method', async () => {
        const result = await service.request({
            url: url('/echo-method'),
            type: 'POST'
        });
        expect(RequestContext.asText(result)).to.equal('POST');
    });

    it('should send request body', async () => {
        const result = await service.request({
            url: url('/echo-body'),
            type: 'POST',
            data: 'test body content'
        });
        expect(RequestContext.asText(result)).to.equal('test body content');
    });

    it('should timeout when request takes too long', async () => {
        try {
            await service.request({
                url: url('/slow'),
                timeout: 100
            });
            expect.fail('Should have thrown a timeout error');
        } catch (e) {
            expect(e).to.be.an.instanceOf(Error);
        }
    });

    it('should abort on cancellation', async () => {
        const listeners: Array<() => void> = [];
        const token: CancellationToken = {
            isCancellationRequested: false,
            onCancellationRequested: (listener: () => void) => {
                listeners.push(listener);
            }
        };

        const promise = service.request({
            url: url('/slow'),
        }, token);

        // Trigger cancellation shortly after the request starts
        setTimeout(() => {
            listeners.forEach(l => l());
        }, 50);

        try {
            await promise;
            expect.fail('Should have thrown an abort error');
        } catch (e) {
            expect(e).to.be.an.instanceOf(Error);
        }
    });

    it('should include response headers', async () => {
        const result = await service.request({ url: url('/json') });
        expect(result.res.headers['content-type']).to.equal('application/json');
    });

    it('should set the url on the result', async () => {
        const requestUrl = url('/text');
        const result = await service.request({ url: requestUrl });
        expect(result.url).to.equal(requestUrl);
    });

    describe('configure', () => {
        it('should configure proxy settings', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({
                proxyUrl: 'http://proxy.example.com:8080',
                strictSSL: false,
                proxyAuthorization: 'Basic dGVzdDp0ZXN0'
            });
            // Just verify configuration doesn't throw
        });

        it('should not send the proxy authorization to the server when no proxy is used', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({
                proxyAuthorization: 'Basic dGVzdDp0ZXN0'
            });
            const result = await configuredService.request({ url: url('/echo-headers') });
            const headers = RequestContext.asJson<Record<string, string>>(result);
            expect(headers['proxy-authorization']).to.be.undefined;
        });

        it('should not send a Proxy-Authorization request header to the server', async () => {
            const result = await service.request({ url: url('/echo-headers'), headers: { 'Proxy-Authorization': 'Basic dGVzdDp0ZXN0', 'X-Custom': 'kept' } });
            const headers = RequestContext.asJson<Record<string, string>>(result);
            expect(headers['proxy-authorization']).to.be.undefined;
            expect(headers['x-custom']).to.equal('kept');
        });
    });

    describe('proxy authorization', () => {
        let proxy: http.Server;
        let proxyUrl: string;
        let tunnelAuthorizations: (string | undefined)[];

        before(done => {
            // a proxy that refuses every tunnel, recording the authorization it was offered
            proxy = http.createServer();
            proxy.on('connect', (req: http.IncomingMessage, socket) => {
                tunnelAuthorizations.push(req.headers['proxy-authorization']);
                socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            });
            proxy.listen(0, () => {
                proxyUrl = `http://localhost:${(proxy.address() as { port: number }).port}`;
                done();
            });
        });

        after(done => {
            proxy.close(done);
        });

        beforeEach(() => {
            tunnelAuthorizations = [];
        });

        async function requestThroughProxy(configuredService: NodeRequestService, options: Partial<NodeRequestOptions> = {}): Promise<void> {
            try {
                await configuredService.request({ url: 'https://example.com/', ...options });
            } catch {
                return;
            }
            throw new Error('expected the proxy to refuse the tunnel');
        }

        it('should send the configured authorization to the proxy', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({ proxyUrl, proxyAuthorization: 'Basic dGVzdDp0ZXN0' });
            await requestThroughProxy(configuredService);
            expect(tunnelAuthorizations).to.deep.equal(['Basic dGVzdDp0ZXN0']);
        });

        it('should send the authorization of the request options to the proxy', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({ proxyUrl });
            await requestThroughProxy(configuredService, { proxyAuthorization: 'Basic dGVzdDp0ZXN0' });
            expect(tunnelAuthorizations).to.deep.equal(['Basic dGVzdDp0ZXN0']);
        });

        it('should send the authorization of a Proxy-Authorization request header to the proxy', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({ proxyUrl, proxyAuthorization: 'Basic configured' });
            await requestThroughProxy(configuredService, { headers: { 'proxy-authorization': 'Basic dGVzdDp0ZXN0' } });
            expect(tunnelAuthorizations).to.deep.equal(['Basic dGVzdDp0ZXN0']);
        });

        it('should prefer credentials in the proxy URL', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({ proxyUrl: proxyUrl.replace('http://', 'http://user:pass@'), proxyAuthorization: 'Basic ignored' });
            await requestThroughProxy(configuredService);
            expect(tunnelAuthorizations).to.deep.equal([`Basic ${Buffer.from('user:pass').toString('base64')}`]);
        });
    });

    describe('loopback requests', () => {
        it('should not send requests to loopback hosts through the configured proxy', async () => {
            const configuredService = new NodeRequestService();
            // nothing listens on port 1, so a proxied request would fail
            await configuredService.configure({ proxyUrl: 'http://127.0.0.1:1' });
            const result = await configuredService.request({ url: url('/text') });
            expect(RequestContext.asText(result)).to.equal('hello world');
        });
    });

    describe('system certificates', () => {
        let tlsServer: https.Server;
        let tlsPort: number;
        let tunnelProxy: http.Server;
        let tunnelProxyUrl: string;
        let tunnels: string[];
        const tunnelSockets = new Set<net.Socket>();

        class TestRequestService extends NodeRequestService {
            constructor(protected readonly systemCertificateList: string[]) {
                super();
            }
            protected override getSystemCertificates(): string[] {
                return this.systemCertificateList;
            }
            caCertificatesForTest(): readonly string[] {
                return this.getCACertificates();
            }
        }

        before(done => {
            // without session resumption, so that every request verifies the certificate
            tlsServer = https.createServer({ key: TEST_LEAF_KEY, cert: TEST_LEAF_CERTIFICATE, secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('secure');
            });
            // a proxy that tunnels every CONNECT to the TLS server, whatever host was asked for
            tunnelProxy = http.createServer();
            tunnelProxy.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
                tunnels.push(req.url ?? '');
                const serverSocket = net.connect(tlsPort, '127.0.0.1', () => {
                    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                    serverSocket.write(head);
                    serverSocket.pipe(clientSocket);
                    clientSocket.pipe(serverSocket);
                });
                tunnelSockets.add(clientSocket).add(serverSocket);
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
            tunnelSockets.forEach(socket => socket.destroy());
            tlsServer.closeAllConnections();
            tunnelProxy.close(() => tlsServer.close(done));
        });

        beforeEach(() => {
            tunnels = [];
        });

        async function expectFailure(promise: Promise<unknown>): Promise<void> {
            try {
                await promise;
            } catch {
                return;
            }
            throw new Error('expected the request to fail');
        }

        it('should not trust a certificate that only the operating system trusts by default', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            await expectFailure(configuredService.request({ url: `https://localhost:${tlsPort}/` }));
        });

        it('should trust the certificates of the operating system when enabled', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            await configuredService.configure({ systemCertificates: true });
            const result = await configuredService.request({ url: `https://localhost:${tlsPort}/` });
            expect(RequestContext.asText(result)).to.equal('secure');
        });

        it('should not trust the certificates of the operating system when disabled again', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            await configuredService.configure({ systemCertificates: true });
            await configuredService.configure({ systemCertificates: false });
            await expectFailure(configuredService.request({ url: `https://localhost:${tlsPort}/` }));
        });

        it('should keep the default certificates of Node', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            const ca = configuredService.caCertificatesForTest();
            expect(ca).to.include.members(tls.getCACertificates('default'));
            expect(ca).to.include(TEST_ROOT_CERTIFICATE);
        });

        it('should trust the certificates of the operating system through a proxy', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            await configuredService.configure({ proxyUrl: tunnelProxyUrl, systemCertificates: true });
            const result = await configuredService.request({ url: `https://theia-test.example:${tlsPort}/` });
            expect(RequestContext.asText(result)).to.equal('secure');
            expect(tunnels).to.deep.equal([`theia-test.example:${tlsPort}`]);
        });

        it('should not trust a certificate that only the operating system trusts through a proxy by default', async () => {
            const configuredService = new TestRequestService([TEST_ROOT_CERTIFICATE]);
            await configuredService.configure({ proxyUrl: tunnelProxyUrl });
            await expectFailure(configuredService.request({ url: `https://theia-test.example:${tlsPort}/` }));
            expect(tunnels).to.deep.equal([`theia-test.example:${tlsPort}`]);
        });
    });

    describe('redirect handling', () => {
        it('should follow redirects by default', async () => {
            const result = await service.request({ url: url('/redirect') });
            expect(result.res.statusCode).to.equal(200);
            expect(RequestContext.asText(result)).to.equal('hello world');
        });

        it('should not follow redirects when followRedirects is 0', async () => {
            const result = await service.request({ url: url('/redirect'), followRedirects: 0 });
            expect(result.res.statusCode).to.equal(302);
            expect(result.res.headers['location']).to.equal('/text');
        });

        it('should follow redirect chains by default', async () => {
            const result = await service.request({ url: url('/redirect-chain') });
            expect(result.res.statusCode).to.equal(200);
            expect(RequestContext.asText(result)).to.equal('hello world');
        });
    });

    describe('resolveProxy', () => {
        it('should return undefined by default', async () => {
            const proxy = await service.resolveProxy('https://example.com');
            expect(proxy).to.be.undefined;
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
