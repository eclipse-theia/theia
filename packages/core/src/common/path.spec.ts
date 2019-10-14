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

import * as assert from 'assert';
import { Path } from './path';

describe('Path', () => {

    it('new from /foo/bar/file.txt', () => {
        const path = new Path('/foo/bar/file.txt');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/foo/bar');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it('new from foo/bar/file.txt', () => {
        const path = new Path('foo/bar/file.txt');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, false);
        assert.deepEqual(path.root, undefined);
        assert.deepEqual(path.dir.toString(), 'foo/bar');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it('new from /foo', () => {
        const path = new Path('/foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it('new from foo', () => {
        const path = new Path('foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, false);
        assert.deepEqual(path.root, undefined);
        assert.deepEqual(path.dir.toString(), 'foo');
        assert.deepEqual(path.hasDir, false);
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it('new from /', () => {
        const path = new Path('/');
        assert.deepEqual(path.isRoot, true);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.hasDir, false);
        assert.deepEqual(path.base, '');
        assert.deepEqual(path.name, '');
        assert.deepEqual(path.ext, '');
    });

    it('new from /c:/foo/bar/file.txt', () => {
        const path = new Path('/c:/foo/bar/file.txt');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:/foo/bar');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it('new from /c:/foo', () => {
        const path = new Path('/c:/foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it('new from /c:/', () => {
        const path = new Path('/c:/');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.hasDir, true);
        assert.deepEqual(path.base, '');
        assert.deepEqual(path.name, '');
        assert.deepEqual(path.ext, '');
    });

    it('new from /c:', () => {
        const path = new Path('/c:');
        assert.deepEqual(path.isRoot, true);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.hasDir, false);
        assert.deepEqual(path.base, 'c:');
        assert.deepEqual(path.name, 'c:');
        assert.deepEqual(path.ext, '');
    });

    assertRelative({
        from: '/foo',
        to: '/foo',
        expectation: ''
    });

    assertRelative({
        from: '/foo',
        to: '/foo/bar',
        expectation: 'bar'
    });

    assertRelative({
        from: '/foo/',
        to: '/foo/bar',
        expectation: 'bar'
    });

    assertRelative({
        from: '/f',
        to: '/foo/bar',
        expectation: undefined
    });

    function assertRelative({ from, to, expectation }: {
        from: string,
        to: string,
        expectation: string | undefined
    }): void {
        it(`the relative path from '${from}' to '${to}' should be '${expectation}'`, () => {
            const path = new Path(from).relative(new Path(to));
            assert.deepEqual(expectation, path && path.toString());
        });
    }

    assertNormalize({
        from: '/',
        expectation: '/'
    });

    assertNormalize({
        from: '/c://',
        expectation: '/c:/'
    });

    assertNormalize({
        from: '/foo',
        expectation: '/foo'
    });

    assertNormalize({
        from: '/foo/',
        expectation: '/foo/'
    });

    assertNormalize({
        from: '/foo/bar',
        expectation: '/foo/bar'
    });

    assertNormalize({
        from: '/foo/../file.txt',
        expectation: '/file.txt'
    });

    assertNormalize({
        from: '/foo/bar/../file.txt',
        expectation: '/foo/file.txt'
    });

    assertNormalize({
        from: '/foo/../../file.txt',
        expectation: '/file.txt'
    });

    assertNormalize({
        from: '',
        expectation: '.'
    });

    assertNormalize({
        from: '.',
        expectation: '.'
    });

    assertNormalize({
        from: '..',
        expectation: '..'
    });

    assertNormalize({
        from: './foo',
        expectation: 'foo'
    });

    assertNormalize({
        from: './foo/./.',
        expectation: 'foo'
    });

    assertNormalize({
        from: './foo/',
        expectation: 'foo/'
    });

    assertNormalize({
        from: '../foo',
        expectation: '../foo'
    });

    assertNormalize({
        from: 'foo/..',
        expectation: '.'
    });

    assertNormalize({
        from: 'foo/bar/../../../',
        expectation: '../'
    });

    function assertNormalize({ from, expectation }: {
        from: string,
        expectation: string
    }): void {
        it(`path ${from} should be normalized as ${expectation}`, () => {
            assert.deepStrictEqual(new Path(from).normalize().toString(), expectation);
        });
    }

});
