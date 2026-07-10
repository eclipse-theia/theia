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
import * as http from 'http';
import {
    BrowserConnectionToken,
    BrowserConnectionTokenBackendContribution,
    BROWSER_TOKEN_COOKIE_NAME,
    createBrowserConnectionToken
} from './browser-connection-token';

describe('BrowserConnectionToken', () => {

    it('should generate unique tokens', () => {
        const token1 = createBrowserConnectionToken();
        const token2 = createBrowserConnectionToken();
        expect(token1.value).to.not.equal(token2.value);
    });

    it('should generate tokens of sufficient length', () => {
        const token = createBrowserConnectionToken();
        expect(token.value.length).to.be.greaterThan(16);
    });
});

describe('BrowserConnectionTokenBackendContribution', () => {

    const token: BrowserConnectionToken = createBrowserConnectionToken();

    function createContribution(): BrowserConnectionTokenBackendContribution {
        const contribution = new BrowserConnectionTokenBackendContribution();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contribution as any)['browserConnectionToken'] = token;
        return contribution;
    }

    function createRequest(cookieValue?: string): http.IncomingMessage {
        const request = {
            headers: {} as http.IncomingHttpHeaders
        } as http.IncomingMessage;
        if (cookieValue !== undefined) {
            request.headers.cookie = `${BROWSER_TOKEN_COOKIE_NAME}=${cookieValue}`;
        }
        return request;
    }

    describe('allowWsUpgrade (WebSocket validation)', () => {

        it('should allow WebSocket with valid token cookie', () => {
            const contribution = createContribution();
            expect(contribution.allowWsUpgrade(createRequest(token.value))).to.be.true;
        });

        it('should reject WebSocket with no cookie', () => {
            const contribution = createContribution();
            expect(contribution.allowWsUpgrade(createRequest())).to.be.false;
        });

        it('should reject WebSocket with invalid token', () => {
            const contribution = createContribution();
            expect(contribution.allowWsUpgrade(createRequest('wrong-token'))).to.be.false;
        });

        it('should reject WebSocket with stale token from previous server', () => {
            const contribution = createContribution();
            const staleToken = createBrowserConnectionToken().value;
            expect(contribution.allowWsUpgrade(createRequest(staleToken))).to.be.false;
        });

        it('should reject WebSocket with empty token', () => {
            const contribution = createContribution();
            expect(contribution.allowWsUpgrade(createRequest(''))).to.be.false;
        });

        it('should handle multiple cookies correctly', () => {
            const contribution = createContribution();
            const request = {
                headers: {
                    cookie: `other-cookie=foo; ${BROWSER_TOKEN_COOKIE_NAME}=${token.value}; another=bar`
                } as http.IncomingHttpHeaders
            } as http.IncomingMessage;
            expect(contribution.allowWsUpgrade(request)).to.be.true;
        });
    });

    describe('expressMiddleware (HTTP cookie flow)', () => {

        interface CookieCall {
            name: string;
            value: string;
            options: Record<string, unknown>;
        }

        interface MockResponse {
            cookieCalls: CookieCall[];
            nextCalled: boolean;
        }

        function callMiddleware(cookieValue?: string): MockResponse {
            const contribution = createContribution();
            const result: MockResponse = { cookieCalls: [], nextCalled: false };

            const req = {
                headers: {} as Record<string, string | undefined>,
                socket: { remoteAddress: '127.0.0.1' }
            };
            if (cookieValue !== undefined) {
                req.headers.cookie = `${BROWSER_TOKEN_COOKIE_NAME}=${cookieValue}`;
            }

            const res = {
                cookie: (name: string, value: string, options: Record<string, unknown>) => {
                    result.cookieCalls.push({ name, value, options });
                }
            };

            const next = (): void => { result.nextCalled = true; };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (contribution as any).expressMiddleware(req, res, next);
            return result;
        }

        it('should set cookie and allow request when no cookie present', () => {
            const result = callMiddleware();
            expect(result.nextCalled).to.be.true;
            expect(result.cookieCalls).to.have.length(1);
            expect(result.cookieCalls[0].name).to.equal(BROWSER_TOKEN_COOKIE_NAME);
            expect(result.cookieCalls[0].value).to.equal(token.value);
        });

        it('should set cookie with HttpOnly, SameSite=Strict, and path=/', () => {
            const result = callMiddleware();
            const opts = result.cookieCalls[0].options;
            expect(opts.httpOnly).to.be.true;
            expect(opts.sameSite).to.equal('strict');
            expect(opts.path).to.equal('/');
        });

        it('should allow request with valid cookie without re-setting it', () => {
            const result = callMiddleware(token.value);
            expect(result.nextCalled).to.be.true;
            expect(result.cookieCalls).to.have.length(0);
        });

        it('should refresh stale cookie and allow request', () => {
            const result = callMiddleware('stale-token-from-old-server');
            expect(result.nextCalled).to.be.true;
            expect(result.cookieCalls).to.have.length(1);
            expect(result.cookieCalls[0].value).to.equal(token.value);
        });
    });
});
