/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import URI from './uri';

const expect = chai.expect;

describe('uri', () => {

    describe('#getParent', () => {

        it('of file:///foo/bar.txt', () => {
            expect(new URI('file:///foo/bar.txt').parent.toString()).equals('file:///foo');
        });

        it('of file:///foo/', () => {
            expect(new URI('file:///foo/').parent.toString()).equals('file:///foo');
        });

        it('of file:///foo', () => {
            expect(new URI('file:///foo').parent.toString()).equals('file:///');
        });

        it('of file:///', () => {
            expect(new URI('file:///').parent.toString()).equals('file:///');
        });

        it('of file://', () => {
            expect(new URI('file://').parent.toString()).equals('file:///');
        });

    });

    describe('#lastSegment', () => {

        it('of file:///foo/bar.txt', () => {
            expect(new URI('file:///foo/bar.txt').path.base).equals('bar.txt');
        });

        it('of file:///foo', () => {
            expect(new URI('file:///foo').path.base).equals('foo');
        });

        it('of file:///', () => {
            expect(new URI('file:///').path.base).equals('');
        });

        it('of file://', () => {
            expect(new URI('file://').path.base).equals('');
        });

    });

    describe('#appendPath', () => {

        it("'' to file:///foo", () => {
            const uri = new URI('file:///foo');
            expect(uri.resolve('').toString()).to.be.equal(uri.toString());
        });

        it('bar to file:///foo', () => {
            expect(new URI('file:///foo').resolve('bar').toString()).to.be.equal('file:///foo/bar');
        });

        it('bar/baz to file:///foo', () => {
            expect(new URI('file:///foo').resolve('bar/baz').toString()).to.be.equal('file:///foo/bar/baz');
        });

        it("'' to file:///", () => {
            const uri = new URI('file:///');
            expect(uri.resolve('').toString()).to.be.equal(uri.toString());
        });

        it('bar to file:///', () => {
            expect(new URI('file:///').resolve('bar').toString()).to.be.equal('file:///bar');
        });

        it('bar/baz to file:///', () => {
            expect(new URI('file:///').resolve('bar/baz').toString()).to.be.equal('file:///bar/baz');
        });

    });

    describe('#path', () => {

        it('Should return with the FS path from the URI.', () => {
            expect(new URI('file:///foo/bar/baz.txt').path.toString()).equals('/foo/bar/baz.txt');
        });

        it('Should not return the encoded path', () => {
            expect(new URI('file:///foo 3/bar 4/baz 4.txt').path.toString()).equals('/foo 3/bar 4/baz 4.txt');
        });
    });

    describe('#withFragment', () => {

        it('Should replace the fragment.', () => {
            expect(new URI('file:///foo/bar/baz.txt#345345').withFragment('foo').toString()).equals('file:///foo/bar/baz.txt#foo');
            expect(new URI('file:///foo/bar/baz.txt?foo=2#345345').withFragment('foo').toString(true)).equals('file:///foo/bar/baz.txt?foo=2#foo');
        });

        it('Should remove the fragment.', () => {
            expect(new URI('file:///foo/bar/baz.txt#345345').withFragment('').toString()).equals('file:///foo/bar/baz.txt');
        });
    });

    describe('#toString()', () => {
        it('should produce the non encoded string', () => {
            function check(uri: string): void {
                expect(new URI(uri).toString(true)).equals(uri);
            }
            check('file:///X?test=32');
            check('file:///X?test=32#345');
            check('file:///X test/ddd?test=32#345');
        });
    });

    describe('#Uri.with...()', () => {
        it('produce proper URIs', () => {
            const uri = new URI('').withScheme('file').withPath('/foo/bar.txt').withQuery('x=12').withFragment('baz');
            expect(uri.toString(true)).equals('file:///foo/bar.txt?x=12#baz');

            expect(uri.withScheme('http').toString(true)).equals('http:/foo/bar.txt?x=12#baz');

            expect(uri.withoutQuery().toString(true)).equals('file:///foo/bar.txt#baz');

            expect(uri.withoutFragment().toString(true)).equals(uri.withFragment('').toString(true));

            expect(uri.withPath('hubba-bubba').toString(true)).equals('file:///hubba-bubba?x=12#baz');
        });
    });

    describe('#relative()', () => {
        it('drive letters should be in lowercase', () => {
            const uri = new URI('file:///C:/projects/theia');
            const path = uri.relative(new URI(uri.resolve('node_modules/typescript/lib').toString()));
            expect(String(path)).equals('node_modules/typescript/lib');
        });
    });
});
