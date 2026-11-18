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
import { shouldBypassProxy, shouldBypassProxyForEnv } from './no-proxy';

describe('no-proxy', () => {
    describe('shouldBypassProxy', () => {
        const bypasses = (url: string, ...noProxy: string[]): boolean => shouldBypassProxy(new URL(url), noProxy);

        it('should not match without rules', () => {
            expect(bypasses('http://example.com')).to.be.false;
            expect(bypasses('http://example.com', '', '  ')).to.be.false;
        });

        it('should match exact hostname (case-insensitive)', () => {
            expect(bypasses('http://myhost.local/v1', 'myhost.local')).to.be.true;
            expect(bypasses('http://MyHost.Local/v1', 'myhost.local')).to.be.true;
            expect(bypasses('http://myhost.local/v1', 'MyHost.Local')).to.be.true;
        });

        it('should not match partial hostname', () => {
            expect(bypasses('http://notmyhost.local', 'myhost.local')).to.be.false;
        });

        it('should match domain and subdomains with leading dot', () => {
            expect(bypasses('http://example.com/v1', '.example.com')).to.be.true;
            expect(bypasses('http://api.example.com/v1', '.example.com')).to.be.true;
            expect(bypasses('http://deep.sub.example.com', '.example.com')).to.be.true;
        });

        it('should match domain and subdomains without leading dot', () => {
            expect(bypasses('http://example.com/v1', 'example.com')).to.be.true;
            expect(bypasses('http://sub.example.com/v1', 'example.com')).to.be.true;
        });

        it('should match wildcard', () => {
            expect(bypasses('http://anything.com', '*')).to.be.true;
            expect(bypasses('https://secure.host.org/path', '*')).to.be.true;
        });

        it('should match IP addresses', () => {
            expect(bypasses('http://192.168.1.100:8080/v1', '192.168.1.100')).to.be.true;
            expect(bypasses('http://192.168.1.100/v1', '192.168.1.100')).to.be.true;
            expect(bypasses('http://192.168.1.101/v1', '192.168.1.100')).to.be.false;
        });

        it('should match IPv6 addresses', () => {
            expect(bypasses('http://[::1]:3000', '[::1]')).to.be.true;
            expect(bypasses('http://[::1]:3000', '[::1]:3000')).to.be.true;
            expect(bypasses('http://[::1]:3000', '[::1]:4000')).to.be.false;
        });

        it('should match port-specific rules', () => {
            expect(bypasses('http://myhost:8080/v1', 'myhost:8080')).to.be.true;
            expect(bypasses('http://myhost:9090/v1', 'myhost:8080')).to.be.false;
            expect(bypasses('http://myhost/v1', 'myhost:8080')).to.be.false;
        });

        it('should match port-specific rules against the default port of the protocol', () => {
            expect(bypasses('http://myhost/v1', 'myhost:80')).to.be.true;
            expect(bypasses('https://myhost/v1', 'myhost:443')).to.be.true;
            expect(bypasses('https://myhost/v1', 'myhost:80')).to.be.false;
        });

        it('should trim whitespace around rules', () => {
            expect(bypasses('http://example.com', '  example.com  ')).to.be.true;
        });

        it('should match any of multiple rules', () => {
            const noProxy = ['localhost', '127.0.0.1', '.internal.net'];
            expect(bypasses('http://localhost/api', ...noProxy)).to.be.true;
            expect(bypasses('http://127.0.0.1:3000', ...noProxy)).to.be.true;
            expect(bypasses('http://service.internal.net', ...noProxy)).to.be.true;
            expect(bypasses('http://external.com', ...noProxy)).to.be.false;
        });
    });

    describe('shouldBypassProxyForEnv', () => {
        it('should match the given rules', () => {
            expect(shouldBypassProxyForEnv(new URL('http://localhost:3000'), {}, ['localhost'])).to.be.true;
        });

        it('should match the rules of no_proxy', () => {
            expect(shouldBypassProxyForEnv(new URL('https://git.corp.internal'), { no_proxy: 'localhost,.corp.internal' })).to.be.true;
        });

        it('should fall back to NO_PROXY', () => {
            expect(shouldBypassProxyForEnv(new URL('https://git.corp.internal'), { NO_PROXY: '.corp.internal' })).to.be.true;
        });

        it('should fall back to NO_PROXY when no_proxy is empty', () => {
            expect(shouldBypassProxyForEnv(new URL('https://git.corp.internal'), { no_proxy: '', NO_PROXY: '.corp.internal' })).to.be.true;
        });

        it('should not match when neither is set', () => {
            expect(shouldBypassProxyForEnv(new URL('https://example.com'), {})).to.be.false;
        });

        it('should skip empty rules of the environment', () => {
            expect(shouldBypassProxyForEnv(new URL('https://example.com'), { no_proxy: 'localhost,, ,.corp' })).to.be.false;
            expect(shouldBypassProxyForEnv(new URL('https://git.corp'), { no_proxy: 'localhost,, ,.corp' })).to.be.true;
        });

        it('should combine the given rules with the rules of the environment', () => {
            const env = { no_proxy: '.corp.internal' };
            expect(shouldBypassProxyForEnv(new URL('http://localhost'), env, ['localhost'])).to.be.true;
            expect(shouldBypassProxyForEnv(new URL('https://git.corp.internal'), env, ['localhost'])).to.be.true;
            expect(shouldBypassProxyForEnv(new URL('https://example.com'), env, ['localhost'])).to.be.false;
        });
    });
});
