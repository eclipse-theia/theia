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
import * as tls from 'tls';
import { Agent, ProxyAgent } from 'undici';
import { getProxyAgent } from './proxy';

describe('proxy', () => {
    describe('getProxyAgent', () => {
        it('should return undefined when no proxy is configured', () => {
            const agent = getProxyAgent('https://example.com', {});
            expect(agent).to.be.undefined;
        });

        it('should return a dispatcher when proxy URL is provided via options', () => {
            const agent = getProxyAgent('https://example.com', {}, {
                proxyUrl: 'http://proxy.example.com:8080'
            });
            expect(agent).to.not.be.undefined;
        });

        it('should return a dispatcher when HTTP_PROXY env variable is set for http URLs', () => {
            const env = { HTTP_PROXY: 'http://proxy.example.com:8080' };
            const agent = getProxyAgent('http://example.com', env);
            expect(agent).to.not.be.undefined;
        });

        it('should return a dispatcher when http_proxy env variable is set for http URLs', () => {
            const env = { http_proxy: 'http://proxy.example.com:8080' };
            const agent = getProxyAgent('http://example.com', env);
            expect(agent).to.not.be.undefined;
        });

        it('should return a dispatcher when HTTPS_PROXY env variable is set for https URLs', () => {
            const env = { HTTPS_PROXY: 'http://proxy.example.com:8080' };
            const agent = getProxyAgent('https://example.com', env);
            expect(agent).to.not.be.undefined;
        });

        it('should fall back to HTTP_PROXY for https URLs when HTTPS_PROXY is not set', () => {
            const env = { HTTP_PROXY: 'http://proxy.example.com:8080' };
            const agent = getProxyAgent('https://example.com', env);
            expect(agent).to.not.be.undefined;
        });

        it('should return undefined for invalid request URLs', () => {
            const agent = getProxyAgent('not-a-url', {}, {
                proxyUrl: 'http://proxy.example.com:8080'
            });
            expect(agent).to.be.undefined;
        });

        it('should return undefined for non-http proxy protocols', () => {
            const agent = getProxyAgent('https://example.com', {}, {
                proxyUrl: 'socks5://proxy.example.com:1080'
            });
            expect(agent).to.be.undefined;
        });

        it('should return undefined for invalid proxy URLs', () => {
            const agent = getProxyAgent('https://example.com', {}, {
                proxyUrl: 'not-a-valid-url'
            });
            expect(agent).to.be.undefined;
        });

        it('should return an Agent (not ProxyAgent) when strictSSL is false and no proxy is set', () => {
            const agent = getProxyAgent('https://example.com', {}, {
                strictSSL: false
            });
            expect(agent).to.not.be.undefined;
        });

        it('should prefer proxyUrl option over environment variables', () => {
            const env = { HTTP_PROXY: 'http://env-proxy.example.com:8080' };
            const agent = getProxyAgent('http://example.com', env, {
                proxyUrl: 'http://option-proxy.example.com:9090'
            });
            expect(agent).to.not.be.undefined;
        });

        for (const url of ['http://localhost:3000', 'https://LOCALHOST', 'http://app.localhost:8080', 'http://127.0.0.1:3000', 'http://127.1.2.3', 'http://[::1]:3000']) {
            it(`should not use a proxy for the loopback URL ${url}`, () => {
                const env = { HTTP_PROXY: 'http://env-proxy.example.com:8080', HTTPS_PROXY: 'http://env-proxy.example.com:8080' };
                expect(getProxyAgent(url, env, { proxyUrl: 'http://option-proxy.example.com:9090' })).to.be.undefined;
            });
        }

        it('should use a proxy for hosts that only look like loopback hosts', () => {
            const proxyUrl = 'http://proxy.example.com:8080';
            expect(getProxyAgent('http://localhost.example.com', {}, { proxyUrl })).to.be.instanceOf(ProxyAgent);
            expect(getProxyAgent('http://127.0.0.1.example.com', {}, { proxyUrl })).to.be.instanceOf(ProxyAgent);
        });

        it('should share one Agent per CA list when no proxy is used', () => {
            const ca = tls.getCACertificates('default');
            const agent = getProxyAgent('https://example.com', {}, { ca });
            expect(agent).to.be.instanceOf(Agent);
            expect(getProxyAgent('https://other.example.com', {}, { ca })).to.equal(agent);
            expect(getProxyAgent('https://example.com', {}, { ca: [...ca] })).to.not.equal(agent);
        });

        it('should not share the Agent that skips certificate verification', () => {
            const ca = tls.getCACertificates('default');
            const shared = getProxyAgent('https://example.com', {}, { ca });
            const insecure = getProxyAgent('https://example.com', {}, { ca, strictSSL: false });
            expect(insecure).to.be.instanceOf(Agent);
            expect(insecure).to.not.equal(shared);
        });

        it('should return a ProxyAgent when a CA list and a proxy are given', () => {
            const agent = getProxyAgent('https://example.com', {}, {
                proxyUrl: 'https://proxy.example.com:8443',
                ca: tls.getCACertificates('default')
            });
            expect(agent).to.be.instanceOf(ProxyAgent);
        });
    });
});
