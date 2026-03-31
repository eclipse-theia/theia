/********************************************************************************
 * Copyright (C) 2025 EclipseSource GmbH.
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
import { NodeRequestService } from './node-request-service';
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

        it('should inject Proxy-Authorization header when authorization is configured', async () => {
            const configuredService = new NodeRequestService();
            await configuredService.configure({
                proxyAuthorization: 'Basic dGVzdDp0ZXN0'
            });
            const result = await configuredService.request({ url: url('/echo-headers') });
            const headers = RequestContext.asJson<Record<string, string>>(result);
            expect(headers['proxy-authorization']).to.equal('Basic dGVzdDp0ZXN0');
        });
    });

    describe('resolveProxy', () => {
        it('should return undefined by default', async () => {
            const proxy = await service.resolveProxy('https://example.com');
            expect(proxy).to.be.undefined;
        });
    });
});
