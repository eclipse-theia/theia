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
    });
});
