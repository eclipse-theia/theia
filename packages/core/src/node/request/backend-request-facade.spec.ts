// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import * as sinon from 'sinon';
import { BackendRequestFacade, isUrlAllowed } from './backend-request-facade';
import { BackendApplicationConfigProvider } from '../backend-application-config-provider';

describe('isUrlAllowed', () => {

    it('should allow a URL that matches an exact origin pattern', () => {
        const patterns = ['https://open-vsx.org'];
        expect(isUrlAllowed('https://open-vsx.org/api/extensions', patterns)).to.be.true;
    });

    it('should allow a URL with a path when pattern has no path', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('https://example.com/some/deep/path?query=1', patterns)).to.be.true;
    });

    it('should allow a URL that exactly matches the origin', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('https://example.com', patterns)).to.be.true;
        expect(isUrlAllowed('https://example.com/', patterns)).to.be.true;
    });

    it('should reject a URL with a different scheme', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('http://example.com/path', patterns)).to.be.false;
    });

    it('should reject a URL with a different host', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('https://evil.com/path', patterns)).to.be.false;
    });

    it('should reject a URL with a different port', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('https://example.com:8443/path', patterns)).to.be.false;
    });

    it('should allow a URL when port matches explicitly', () => {
        const patterns = ['https://example.com:8443'];
        expect(isUrlAllowed('https://example.com:8443/path', patterns)).to.be.true;
    });

    it('should treat default ports as equivalent', () => {
        const patterns = ['https://example.com:443'];
        expect(isUrlAllowed('https://example.com/path', patterns)).to.be.true;

        const httpPatterns = ['http://example.com:80'];
        expect(isUrlAllowed('http://example.com/path', httpPatterns)).to.be.true;

        const implicitPatterns = ['http://example.com'];
        expect(isUrlAllowed('http://example.com:80/path', implicitPatterns)).to.be.true;
    });

    it('should match wildcard subdomains', () => {
        const patterns = ['https://*.example.com'];
        expect(isUrlAllowed('https://foo.example.com/path', patterns)).to.be.true;
        expect(isUrlAllowed('https://bar.baz.example.com/path', patterns)).to.be.true;
    });

    it('should not match the bare domain with a wildcard subdomain pattern', () => {
        const patterns = ['https://*.example.com'];
        expect(isUrlAllowed('https://example.com/path', patterns)).to.be.false;
    });

    it('should reject non-http(s) schemes', () => {
        const patterns = ['file:///etc/passwd'];
        expect(isUrlAllowed('file:///etc/passwd', patterns)).to.be.false;
    });

    it('should reject ftp scheme', () => {
        const patterns = ['ftp://files.example.com'];
        expect(isUrlAllowed('ftp://files.example.com/data', patterns)).to.be.false;
    });

    it('should reject a URL when target uses non-http(s) scheme even if patterns exist', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('file:///etc/passwd', patterns)).to.be.false;
        expect(isUrlAllowed('ftp://example.com/data', patterns)).to.be.false;
    });

    it('should reject all URLs when allowlist is empty', () => {
        expect(isUrlAllowed('https://example.com', [])).to.be.false;
        expect(isUrlAllowed('http://localhost:3000', [])).to.be.false;
    });

    it('should reject invalid URLs', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('not a url', patterns)).to.be.false;
        expect(isUrlAllowed('', patterns)).to.be.false;
    });

    it('should allow private IPs only when explicitly in the allowlist', () => {
        expect(isUrlAllowed('http://127.0.0.1:8080/secret', [])).to.be.false;
        expect(isUrlAllowed('http://127.0.0.1:8080/secret', ['https://example.com'])).to.be.false;

        const patternsWithLoopback = ['http://127.0.0.1:8080'];
        expect(isUrlAllowed('http://127.0.0.1:8080/secret', patternsWithLoopback)).to.be.true;
    });

    it('should reject cloud metadata endpoint by default', () => {
        expect(isUrlAllowed('http://169.254.169.254/latest/meta-data/', [])).to.be.false;
        expect(isUrlAllowed('http://169.254.169.254/latest/meta-data/', ['https://example.com'])).to.be.false;
    });

    it('should merge multiple patterns correctly', () => {
        const patterns = [
            'https://open-vsx.org',
            'https://marketplace.example.com',
            'https://*.cdn.example.com'
        ];
        expect(isUrlAllowed('https://open-vsx.org/api/v2/extensions', patterns)).to.be.true;
        expect(isUrlAllowed('https://marketplace.example.com/download', patterns)).to.be.true;
        expect(isUrlAllowed('https://files.cdn.example.com/ext.vsix', patterns)).to.be.true;
        expect(isUrlAllowed('https://evil.com/malware', patterns)).to.be.false;
    });

    it('should handle patterns with trailing slashes', () => {
        const patterns = ['https://example.com/'];
        expect(isUrlAllowed('https://example.com/path', patterns)).to.be.true;
    });

    it('should handle invalid patterns gracefully', () => {
        const patterns = ['not a valid pattern', 'https://example.com'];
        expect(isUrlAllowed('https://example.com/path', patterns)).to.be.true;
        expect(isUrlAllowed('https://other.com/path', patterns)).to.be.false;
    });

    it('should prevent host spoofing via subdomain prefix', () => {
        const patterns = ['https://example.com'];
        expect(isUrlAllowed('https://example.com.evil.com/path', patterns)).to.be.false;
    });
});

describe('BackendRequestFacade', () => {

    describe('configure', () => {

        let configProviderStub: sinon.SinonStub;

        beforeEach(() => {
            configProviderStub = sinon.stub(BackendApplicationConfigProvider, 'get');
        });

        afterEach(() => {
            configProviderStub.restore();
        });

        it('should be a no-op when configureProxyFromPreferences is false', async () => {
            configProviderStub.returns({
                singleInstance: true,
                frontendConnectionTimeout: 0,
                configurationFolder: '.theia',
                configureProxyFromPreferences: false
            });

            const facade = new BackendRequestFacade();
            const configureStub = sinon.stub().resolves();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (facade as any).requestService = {
                configure: configureStub
            };
            await facade.configure({ proxyUrl: 'http://evil.com', strictSSL: false });
            expect(configureStub.called).to.be.false;
        });

        it('should pass through to the underlying request service when configureProxyFromPreferences is true', async () => {
            configProviderStub.returns({
                singleInstance: true,
                frontendConnectionTimeout: 0,
                configurationFolder: '.theia',
                configureProxyFromPreferences: true
            });

            const facade = new BackendRequestFacade();
            const configureStub = sinon.stub().resolves();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (facade as any).requestService = {
                configure: configureStub
            };
            const config = { proxyUrl: 'http://my-proxy.com:8080', strictSSL: true, proxyAuthorization: 'Bearer token' };
            await facade.configure(config);
            expect(configureStub.calledOnce).to.be.true;
            expect(configureStub.firstCall.args[0]).to.deep.equal(config);
        });
    });
});
