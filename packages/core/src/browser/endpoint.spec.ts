// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import * as chai from 'chai';
import { Endpoint } from './endpoint';

const expect = chai.expect;

describe('Endpoint', () => {

    describe('00 #isServedByBackend', () => {
        it('is served by the backend over HTTP and HTTPS only', () => {
            expect(Endpoint.isServedByBackend({ protocol: 'http:' })).to.be.true;
            expect(Endpoint.isServedByBackend({ protocol: 'https:' })).to.be.true;
            expect(Endpoint.isServedByBackend({ protocol: 'file:' })).to.be.false;
            expect(Endpoint.isServedByBackend({ protocol: 'theia-app:' })).to.be.false;
        });
    });

    describe('01 #getWebSocketUrl', () => {

        it('Should correctly join root pathname', () => {
            expectWsUri(
                {
                    httpScheme: 'ws',
                    path: '/miau/'
                },
                {
                    host: 'example.org',
                    pathname: '/',
                    search: '',
                    protocol: 'http:'
                }, 'ws://example.org/miau/');
        });

        it('Should correctly join pathname and path', () => {
            expectWsUri(
                {
                    httpScheme: 'ws',
                    path: '/miau/'
                },
                {
                    host: 'example.org',
                    pathname: '/mainresource',
                    search: '',
                    protocol: 'http:'
                }, 'ws://example.org/mainresource/miau/');
        });

        it('Should correctly join pathname and path, ignoring double slash in between', () => {
            expectWsUri(
                {
                    httpScheme: 'ws',
                    path: '/miau/'
                },
                {
                    host: 'example.org',
                    pathname: '/mainresource/',
                    search: '',
                    protocol: 'http:'
                }, 'ws://example.org/mainresource/miau/');
        });

        it('uses the backend port for a privileged application scheme', () => {
            expectWsUri(
                { path: '/services' },
                { host: 'theia', pathname: '/index.html', search: '?port=3001', protocol: 'theia-app:' },
                'ws://localhost:3001/services');
        });

        it('uses the backend port for a file origin', () => {
            expectWsUri(
                { path: '/services' },
                { host: '', pathname: '/Users/x/lib/frontend/index.html', search: '?port=3002', protocol: 'file:' },
                'ws://localhost:3002/services');
        });

        it('keeps an explicit host for the local connection source', () => {
            expectWsUri(
                { path: '/services', host: 'localhost:4000' },
                { host: 'theia', pathname: '/index.html', search: '', protocol: 'theia-app:' },
                'ws://localhost:4000/services');
        });

        it('Should correctly join pathname and path, without trailing slash', () => {
            expectWsUri(
                {
                    httpScheme: 'ws',
                    path: '/miau'
                },
                {
                    host: 'example.org',
                    pathname: '/mainresource',
                    search: '',
                    protocol: 'http:'
                }, 'ws://example.org/mainresource/miau');
        });
    });

    describe('02 #httpScheme', () => {

        it('Should choose https:// if location protocol is https://', () => {
            expectRestUri(
                {
                    path: '/'
                },
                {
                    host: 'example.org',
                    pathname: '/',
                    search: '',
                    protocol: 'https:'
                }, 'https://example.org/');
        });

        it("should return with the 'options.httpScheme' if defined", () => {
            expect(new Endpoint({ httpScheme: 'foo:' }, {
                host: 'example.org',
                pathname: '/',
                search: '',
                protocol: 'https:'
            }).httpScheme).to.be.equal('foo:');
        });

        it('should return with the HTTP if the protocol is HTTP.', () => {
            expect(new Endpoint({}, {
                host: 'example.org',
                pathname: '/',
                search: '',
                protocol: 'http:'
            }).httpScheme).to.be.equal('http:');
        });

        it('should return with the HTTPS if the protocol is HTTPS.', () => {
            expect(new Endpoint({}, {
                host: 'example.org',
                pathname: '/',
                search: '',
                protocol: 'https:'
            }).httpScheme).to.be.equal('https:');
        });

        it('should return with the HTTP if the protocol is *not* HTTP or HTTPS.', () => {
            expect(new Endpoint({}, {
                host: 'example.org',
                pathname: '/',
                search: '',
                protocol: 'file:'
            }).httpScheme).to.be.equal('http:');
        });

    });

});

function expectWsUri(options: Endpoint.Options, mockLocation: Endpoint.Location, expectedUri: string): void {
    const cut = new Endpoint(options, mockLocation);
    const uri = cut.getWebSocketUrl();
    expect(uri.toString()).to.eq(expectedUri);
}

function expectRestUri(options: Endpoint.Options, mockLocation: Endpoint.Location, expectedUri: string): void {
    const cut = new Endpoint(options, mockLocation);
    const uri = cut.getRestUrl();
    expect(uri.toString()).to.eq(expectedUri);
}
