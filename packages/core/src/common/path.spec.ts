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
import { expect } from 'chai';

describe('Path', () => {

    it('new from /foo/bar/file.txt', () => {
        const path = new Path('/foo/bar/file.txt');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/');
        assert.deepStrictEqual(path.dir.toString(), '/foo/bar');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, 'file.txt');
        assert.deepStrictEqual(path.name, 'file');
        assert.deepStrictEqual(path.ext, '.txt');
    });

    it('new from foo/bar/file.txt', () => {
        const path = new Path('foo/bar/file.txt');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, false);
        assert.deepStrictEqual(path.root, undefined);
        assert.deepStrictEqual(path.dir.toString(), 'foo/bar');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, 'file.txt');
        assert.deepStrictEqual(path.name, 'file');
        assert.deepStrictEqual(path.ext, '.txt');
    });

    it('new from /foo', () => {
        const path = new Path('/foo');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/');
        assert.deepStrictEqual(path.dir.toString(), '/');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, 'foo');
        assert.deepStrictEqual(path.name, 'foo');
        assert.deepStrictEqual(path.ext, '');
    });

    it('new from foo', () => {
        const path = new Path('foo');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, false);
        assert.deepStrictEqual(path.root, undefined);
        assert.deepStrictEqual(path.dir.toString(), 'foo');
        assert.deepStrictEqual(path.hasDir, false);
        assert.deepStrictEqual(path.base, 'foo');
        assert.deepStrictEqual(path.name, 'foo');
        assert.deepStrictEqual(path.ext, '');
    });

    it('new from /', () => {
        const path = new Path('/');
        assert.deepStrictEqual(path.isRoot, true);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/');
        assert.deepStrictEqual(path.dir.toString(), '/');
        assert.deepStrictEqual(path.hasDir, false);
        assert.deepStrictEqual(path.base, '');
        assert.deepStrictEqual(path.name, '');
        assert.deepStrictEqual(path.ext, '');
    });

    it('new from /c:/foo/bar/file.txt', () => {
        const path = new Path('/c:/foo/bar/file.txt');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/c:');
        assert.deepStrictEqual(path.dir.toString(), '/c:/foo/bar');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, 'file.txt');
        assert.deepStrictEqual(path.name, 'file');
        assert.deepStrictEqual(path.ext, '.txt');
    });

    it('new from /c:/foo', () => {
        const path = new Path('/c:/foo');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/c:');
        assert.deepStrictEqual(path.dir.toString(), '/c:');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, 'foo');
        assert.deepStrictEqual(path.name, 'foo');
        assert.deepStrictEqual(path.ext, '');
    });

    it('new from /c:/', () => {
        const path = new Path('/c:/');
        assert.deepStrictEqual(path.isRoot, false);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/c:');
        assert.deepStrictEqual(path.dir.toString(), '/c:');
        assert.deepStrictEqual(path.hasDir, true);
        assert.deepStrictEqual(path.base, '');
        assert.deepStrictEqual(path.name, '');
        assert.deepStrictEqual(path.ext, '');
    });

    it('new from /c:', () => {
        const path = new Path('/c:');
        assert.deepStrictEqual(path.isRoot, true);
        assert.deepStrictEqual(path.isAbsolute, true);
        assert.deepStrictEqual(path.root!.toString(), '/c:');
        assert.deepStrictEqual(path.dir.toString(), '/c:');
        assert.deepStrictEqual(path.hasDir, false);
        assert.deepStrictEqual(path.base, 'c:');
        assert.deepStrictEqual(path.name, 'c:');
        assert.deepStrictEqual(path.ext, '');
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
            assert.deepStrictEqual(expectation, path && path.toString());
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

    const linuxHome = '/home/test-user';
    const windowsHome = '/C:/Users/test-user';

    describe('Linux', () => {
        it('should shorten path on Linux, path starting with home', async () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = '~/a/b/theia';
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should shorten path on Linux, path starting with home with duplication', async () => {
            const path = `${linuxHome}/${linuxHome}/a/b/theia`;
            const expected = `~/${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with home', async () => {
            const path = `/test/${linuxHome}/a/b/theia`;
            const expected = `/test/${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with correct home', async () => {
            const path = `/test/${linuxHome}123/a/b/theia`;
            const expected = `/test/${linuxHome}123/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux when home is empty', async () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = `${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, '')).eq(expected);
        });
    });

    describe('Windows', () => {
        it('should not shorten path on Windows', async () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(Path.tildify(path, windowsHome)).eq(expected);
        });

        it('should not shorten path on Windows when home is empty', async () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(Path.tildify(path, '')).eq(expected);
        });
    });
});
