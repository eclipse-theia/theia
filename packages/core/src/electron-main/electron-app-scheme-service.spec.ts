// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import type { OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails, Session } from '../../electron-shared/electron';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { APP_ORIGIN } from './app-scheme';
import { ElectronAppSchemeServiceImpl } from './electron-app-scheme-service';

const BACKEND_URL = 'http://localhost:3000/some/resource';
const TOKEN = 'secret';

/** Exposes the request bridging of the service, which is not reachable without an Electron session otherwise. */
class TestElectronAppSchemeService extends ElectronAppSchemeServiceImpl {
    override isFrontendCrossOriginRequest(details: { initiatorOrigin?: string, url: string }): boolean {
        return super.isFrontendCrossOriginRequest(details);
    }
    override addBackendCookie(electronSession: Session, details: OnBeforeSendHeadersListenerDetails): Promise<Record<string, string>> {
        return super.addBackendCookie(electronSession, details);
    }
    override addBackendCorsHeaders(details: OnHeadersReceivedListenerDetails): { responseHeaders?: Record<string, string[]>, statusLine?: string } {
        return super.addBackendCorsHeaders(details);
    }
    override bridgeBackendRequests(electronSession: Session): void {
        super.bridgeBackendRequests(electronSession);
    }
}

/** A session that holds the token cookie for {@link BACKEND_URL} only. */
function createSession(): Session {
    return {
        cookies: {
            get: async ({ url, name }: { url: string, name: string }) =>
                url.startsWith('http://localhost:3000/') && name === ElectronSecurityToken ? [{ name, value: TOKEN }] : []
        }
    } as unknown as Session;
}

function request(id: number, requestHeaders: Record<string, string>, method = 'GET', url = BACKEND_URL): OnBeforeSendHeadersListenerDetails {
    return { id, url, method, requestHeaders, initiatorOrigin: APP_ORIGIN } as unknown as OnBeforeSendHeadersListenerDetails;
}

function response(id: number, responseHeaders?: Record<string, string[]>): OnHeadersReceivedListenerDetails {
    return { id, url: BACKEND_URL, responseHeaders } as unknown as OnHeadersReceivedListenerDetails;
}

describe('ElectronAppSchemeServiceImpl', () => {

    let service: TestElectronAppSchemeService;
    let electronSession: Session;

    beforeEach(() => {
        service = new TestElectronAppSchemeService();
        electronSession = createSession();
    });

    describe('isFrontendCrossOriginRequest', () => {

        it('accepts HTTP(S) requests of the frontend', () => {
            expect(service.isFrontendCrossOriginRequest({ initiatorOrigin: APP_ORIGIN, url: 'http://localhost:3000/x' })).to.be.true;
            expect(service.isFrontendCrossOriginRequest({ initiatorOrigin: APP_ORIGIN, url: 'https://example.com/x' })).to.be.true;
        });

        it('rejects requests of other origins or to other schemes', () => {
            expect(service.isFrontendCrossOriginRequest({ initiatorOrigin: 'http://localhost:3000', url: BACKEND_URL })).to.be.false;
            expect(service.isFrontendCrossOriginRequest({ url: BACKEND_URL })).to.be.false;
            expect(service.isFrontendCrossOriginRequest({ initiatorOrigin: APP_ORIGIN, url: `${APP_ORIGIN}/bundle.js` })).to.be.false;
            expect(service.isFrontendCrossOriginRequest({ initiatorOrigin: APP_ORIGIN, url: 'ws://localhost:3000/socket' })).to.be.false;
        });
    });

    describe('addBackendCookie', () => {

        it('adds the token cookie to a backend request without cookies', async () => {
            const headers = await service.addBackendCookie(electronSession, request(1, { Accept: '*/*' }));
            expect(headers).to.deep.equal({ Accept: '*/*', Cookie: `${ElectronSecurityToken}=${TOKEN}` });
        });

        it('appends the token cookie to existing cookies, whatever the header casing', async () => {
            const headers = await service.addBackendCookie(electronSession, request(1, { cookie: 'a=b' }));
            expect(headers).to.deep.equal({ cookie: `a=b; ${ElectronSecurityToken}=${TOKEN}` });
        });

        it('keeps a token cookie that the request already has', async () => {
            const requestHeaders = { Cookie: `${ElectronSecurityToken}=other` };
            expect(await service.addBackendCookie(electronSession, request(1, requestHeaders))).to.deep.equal(requestHeaders);
        });

        it('leaves a request alone for which the session has no token cookie', async () => {
            const requestHeaders = { Accept: '*/*' };
            const headers = await service.addBackendCookie(electronSession, request(1, requestHeaders, 'GET', 'http://127.0.0.1:3000/x'));
            expect(headers).to.deep.equal(requestHeaders);
            expect(service.addBackendCorsHeaders(response(1, {}))).to.deep.equal({});
        });
    });

    describe('addBackendCorsHeaders', () => {

        it('leaves responses to requests that are not backend requests alone', () => {
            expect(service.addBackendCorsHeaders(response(1, { 'Content-Type': ['text/plain'] }))).to.deep.equal({});
        });

        it('allows the frontend origin in the response to a backend request', async () => {
            await service.addBackendCookie(electronSession, request(1, {}));
            const result = service.addBackendCorsHeaders(response(1, {
                'Content-Type': ['text/plain'],
                'access-control-allow-origin': ['*']
            }));
            expect(result).to.deep.equal({
                responseHeaders: {
                    'Content-Type': ['text/plain'],
                    'Access-Control-Allow-Origin': [APP_ORIGIN],
                    'Access-Control-Allow-Credentials': ['true']
                }
            });
        });

        it('treats an OPTIONS request without a requested method as a plain request', async () => {
            await service.addBackendCookie(electronSession, request(1, {}, 'OPTIONS'));
            const result = service.addBackendCorsHeaders(response(1));
            expect(result.statusLine).to.be.undefined;
            expect(result.responseHeaders).to.not.have.property('Access-Control-Allow-Methods');
        });

        it('answers a preflight as successful, with the requested headers, whatever their casing', async () => {
            await service.addBackendCookie(electronSession, request(1, {
                'access-control-request-method': 'PUT',
                'Access-Control-Request-Headers': 'x-custom'
            }, 'OPTIONS'));
            const result = service.addBackendCorsHeaders(response(1, {}));
            expect(result.statusLine).to.equal('HTTP/1.1 204 No Content');
            expect(result.responseHeaders!['Access-Control-Allow-Origin']).to.deep.equal([APP_ORIGIN]);
            expect(result.responseHeaders!['Access-Control-Allow-Methods']).to.have.lengthOf(1);
            expect(result.responseHeaders!['Access-Control-Allow-Methods'][0]).to.include('PUT');
            expect(result.responseHeaders!['Access-Control-Allow-Headers']).to.deep.equal(['x-custom']);
        });

        it('omits the allowed headers of a preflight that requests none', async () => {
            await service.addBackendCookie(electronSession, request(1, { 'Access-Control-Request-Method': 'DELETE' }, 'OPTIONS'));
            const result = service.addBackendCorsHeaders(response(1, {}));
            expect(result.statusLine).to.equal('HTTP/1.1 204 No Content');
            expect(result.responseHeaders).to.not.have.property('Access-Control-Allow-Headers');
        });

        it('forgets a backend request once it is answered', async () => {
            await service.addBackendCookie(electronSession, request(1, {}));
            service.addBackendCorsHeaders(response(1, {}));
            expect(service.addBackendCorsHeaders(response(1, {}))).to.deep.equal({});
        });
    });

    describe('bridgeBackendRequests', () => {

        type BeforeSendHeaders = (details: OnBeforeSendHeadersListenerDetails, callback: (response: object) => void) => void;
        type HeadersReceived = (details: OnHeadersReceivedListenerDetails, callback: (response: object) => void) => void;
        type ErrorOccurred = (details: { id: number }) => void;

        let beforeSendHeaders: BeforeSendHeaders;
        let headersReceived: HeadersReceived;
        let errorOccurred: ErrorOccurred;

        beforeEach(() => {
            (electronSession as unknown as { webRequest: object }).webRequest = {
                onBeforeSendHeaders: (listener: BeforeSendHeaders) => beforeSendHeaders = listener,
                onHeadersReceived: (listener: HeadersReceived) => headersReceived = listener,
                onErrorOccurred: (listener: ErrorOccurred) => errorOccurred = listener
            };
            service.bridgeBackendRequests(electronSession);
        });

        const sendHeaders = (details: OnBeforeSendHeadersListenerDetails): Promise<object> =>
            new Promise(resolve => beforeSendHeaders(details, resolve));
        const receiveHeaders = (details: OnHeadersReceivedListenerDetails): Promise<object> =>
            new Promise(resolve => headersReceived(details, resolve));

        it('adds the cookie and CORS headers to a backend request of the frontend', async () => {
            expect(await sendHeaders(request(1, {}))).to.deep.equal({ requestHeaders: { Cookie: `${ElectronSecurityToken}=${TOKEN}` } });
            const result = await receiveHeaders(response(1, {})) as { responseHeaders: Record<string, string[]> };
            expect(result.responseHeaders['Access-Control-Allow-Origin']).to.deep.equal([APP_ORIGIN]);
        });

        it('passes requests of other origins through unchanged', async () => {
            const details = { ...request(1, {}), initiatorOrigin: 'http://localhost:3000' } as OnBeforeSendHeadersListenerDetails;
            expect(await sendHeaders(details)).to.deep.equal({});
            expect(await receiveHeaders(response(1, {}))).to.deep.equal({});
        });

        it('passes a request through unchanged if the cookie lookup fails', async () => {
            (electronSession.cookies as unknown as { get: () => Promise<never> }).get = () => Promise.reject(new Error('lookup failed'));
            expect(await sendHeaders(request(1, {}))).to.deep.equal({});
        });

        it('forgets a backend request that fails', async () => {
            await sendHeaders(request(1, {}));
            errorOccurred({ id: 1 });
            expect(await receiveHeaders(response(1, {}))).to.deep.equal({});
        });
    });
});
