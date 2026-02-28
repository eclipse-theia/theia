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

import { expect } from 'chai';
import { shouldBypassProxy, getProxyUrl } from './proxy-util';

describe('proxy-util', () => {
    describe('shouldBypassProxy', () => {
        it('should return false when targetUrl is undefined', () => {
            expect(shouldBypassProxy(undefined, 'localhost')).to.be.false;
        });

        it('should return false when noProxyValue is undefined', () => {
            expect(shouldBypassProxy('http://example.com', undefined)).to.be.false;
        });

        it('should return false when noProxyValue is empty', () => {
            expect(shouldBypassProxy('http://example.com', '')).to.be.false;
        });

        it('should return false when targetUrl cannot be parsed', () => {
            expect(shouldBypassProxy('not-a-url', 'localhost')).to.be.false;
        });

        it('should match exact hostname (case-insensitive)', () => {
            expect(shouldBypassProxy('http://myhost.local/v1', 'myhost.local')).to.be.true;
            expect(shouldBypassProxy('http://MyHost.Local/v1', 'myhost.local')).to.be.true;
            expect(shouldBypassProxy('http://myhost.local/v1', 'MyHost.Local')).to.be.true;
        });

        it('should not match partial hostname', () => {
            expect(shouldBypassProxy('http://notmyhost.local', 'myhost.local')).to.be.false;
        });

        it('should match domain suffix with leading dot', () => {
            expect(shouldBypassProxy('http://api.example.com/v1', '.example.com')).to.be.true;
            expect(shouldBypassProxy('http://deep.sub.example.com', '.example.com')).to.be.true;
        });

        it('should match exact domain for leading dot rule', () => {
            expect(shouldBypassProxy('http://example.com/v1', '.example.com')).to.be.true;
        });

        it('should match suffix without leading dot', () => {
            expect(shouldBypassProxy('http://sub.example.com/v1', 'example.com')).to.be.true;
            expect(shouldBypassProxy('http://example.com/v1', 'example.com')).to.be.true;
        });

        it('should match wildcard', () => {
            expect(shouldBypassProxy('http://anything.com', '*')).to.be.true;
            expect(shouldBypassProxy('https://secure.host.org/path', '*')).to.be.true;
        });

        it('should match IP addresses', () => {
            expect(shouldBypassProxy('http://192.168.1.100:8080/v1', '192.168.1.100')).to.be.true;
            expect(shouldBypassProxy('http://192.168.1.100/v1', '192.168.1.100')).to.be.true;
        });

        it('should not match different IP addresses', () => {
            expect(shouldBypassProxy('http://192.168.1.101/v1', '192.168.1.100')).to.be.false;
        });

        it('should match port-specific rules', () => {
            expect(shouldBypassProxy('http://myhost:8080/v1', 'myhost:8080')).to.be.true;
        });

        it('should not match when port differs', () => {
            expect(shouldBypassProxy('http://myhost:9090/v1', 'myhost:8080')).to.be.false;
        });

        it('should not match port-specific rule when target has no port', () => {
            expect(shouldBypassProxy('http://myhost/v1', 'myhost:8080')).to.be.false;
        });

        it('should trim whitespace around entries', () => {
            expect(shouldBypassProxy('http://example.com', '  example.com  ')).to.be.true;
            expect(shouldBypassProxy('http://foo.com', ' foo.com , bar.com ')).to.be.true;
        });

        it('should handle multiple comma-separated rules', () => {
            const noProxy = 'localhost,127.0.0.1,.internal.net';
            expect(shouldBypassProxy('http://localhost/api', noProxy)).to.be.true;
            expect(shouldBypassProxy('http://127.0.0.1:3000', noProxy)).to.be.true;
            expect(shouldBypassProxy('http://service.internal.net', noProxy)).to.be.true;
            expect(shouldBypassProxy('http://external.com', noProxy)).to.be.false;
        });

        it('should skip empty rules from consecutive commas', () => {
            expect(shouldBypassProxy('http://example.com', 'example.com,,localhost')).to.be.true;
        });
    });

    describe('getProxyUrl', () => {
        const savedEnv: Record<string, string | undefined> = {};
        const envVars = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY'];

        beforeEach(() => {
            for (const key of envVars) {
                savedEnv[key] = process.env[key];
                delete process.env[key];
            }
        });

        afterEach(() => {
            for (const key of envVars) {
                if (savedEnv[key] !== undefined) {
                    process.env[key] = savedEnv[key];
                } else {
                    delete process.env[key];
                }
            }
        });

        it('should return settingsProxy when provided', () => {
            expect(getProxyUrl('http://example.com', 'http://settings-proxy:8080')).to.equal('http://settings-proxy:8080');
        });

        it('should return undefined when no proxy is configured', () => {
            expect(getProxyUrl('http://example.com')).to.be.undefined;
        });

        it('should return undefined when targetUrl is undefined and no settingsProxy', () => {
            expect(getProxyUrl(undefined)).to.be.undefined;
        });

        it('should return undefined when targetUrl is not parseable', () => {
            expect(getProxyUrl('not-a-url')).to.be.undefined;
        });

        it('should resolve http_proxy for http URLs', () => {
            process.env.http_proxy = 'http://http-proxy:3128';
            expect(getProxyUrl('http://example.com')).to.equal('http://http-proxy:3128');
        });

        it('should resolve HTTP_PROXY for http URLs when http_proxy is not set', () => {
            process.env.HTTP_PROXY = 'http://HTTP-PROXY:3128';
            expect(getProxyUrl('http://example.com')).to.equal('http://HTTP-PROXY:3128');
        });

        (process.platform === 'win32' ? it.skip : it)('should prefer http_proxy over HTTP_PROXY for http URLs', () => {
            process.env.http_proxy = 'http://lower-proxy:3128';
            process.env.HTTP_PROXY = 'http://upper-proxy:3128';
            expect(getProxyUrl('http://example.com')).to.equal('http://lower-proxy:3128');
        });

        it('should resolve https_proxy for https URLs', () => {
            process.env.https_proxy = 'http://https-proxy:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://https-proxy:3128');
        });

        it('should fall back to http_proxy for https URLs', () => {
            process.env.http_proxy = 'http://http-proxy:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://http-proxy:3128');
        });

        it('should prefer https_proxy over http_proxy for https URLs', () => {
            process.env.https_proxy = 'http://https-proxy:3128';
            process.env.http_proxy = 'http://http-proxy:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://https-proxy:3128');
        });

        it('should resolve HTTPS_PROXY for https URLs', () => {
            process.env.HTTPS_PROXY = 'http://HTTPS-PROXY:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://HTTPS-PROXY:3128');
        });

        (process.platform === 'win32' ? it.skip : it)('should follow https resolution order: https_proxy > HTTPS_PROXY > http_proxy > HTTP_PROXY', () => {
            process.env.HTTP_PROXY = 'http://HTTP-PROXY:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://HTTP-PROXY:3128');

            process.env.http_proxy = 'http://http-proxy:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://http-proxy:3128');

            process.env.HTTPS_PROXY = 'http://HTTPS-PROXY:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://HTTPS-PROXY:3128');

            process.env.https_proxy = 'http://https-proxy:3128';
            expect(getProxyUrl('https://example.com')).to.equal('http://https-proxy:3128');
        });

        it('should bypass proxy when no_proxy matches', () => {
            process.env.http_proxy = 'http://proxy:3128';
            process.env.no_proxy = 'example.com';
            expect(getProxyUrl('http://example.com')).to.be.undefined;
        });

        it('should bypass proxy when NO_PROXY matches', () => {
            process.env.http_proxy = 'http://proxy:3128';
            process.env.NO_PROXY = 'example.com';
            expect(getProxyUrl('http://example.com')).to.be.undefined;
        });

        (process.platform === 'win32' ? it.skip : it)('should prefer no_proxy over NO_PROXY', () => {
            process.env.http_proxy = 'http://proxy:3128';
            process.env.no_proxy = 'example.com';
            process.env.NO_PROXY = 'other.com';
            expect(getProxyUrl('http://example.com')).to.be.undefined;
            expect(getProxyUrl('http://other.com')).to.equal('http://proxy:3128');
        });

        it('should not bypass proxy when no_proxy does not match', () => {
            process.env.http_proxy = 'http://proxy:3128';
            process.env.no_proxy = 'other.com';
            expect(getProxyUrl('http://example.com')).to.equal('http://proxy:3128');
        });

        it('should bypass proxy even when settingsProxy is provided', () => {
            process.env.no_proxy = 'example.com';
            expect(getProxyUrl('http://example.com', 'http://settings-proxy:8080')).to.be.undefined;
        });

        it('should bypass proxy with NO_PROXY (uppercase) when settingsProxy is provided', () => {
            process.env.NO_PROXY = 'example.com';
            expect(getProxyUrl('http://example.com', 'http://settings-proxy:8080')).to.be.undefined;
        });
    });
});
