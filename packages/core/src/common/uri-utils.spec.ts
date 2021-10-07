/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
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
import { expect } from 'chai';
import { Uri, Path } from './uri-utils';
import { URI } from 'vscode-uri';

describe('Path', () => {

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
            const path = Path.relative(from, to);
            assert.deepStrictEqual(expectation, path);
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
            assert.deepStrictEqual(Path.normalize(from), expectation);
        });
    }

    const linuxHome = '/home/test-user';
    const windowsHome = '/C:/Users/test-user';

    describe('Linux', () => {
        it('should shorten path on Linux, path starting with home', () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = '~/a/b/theia';
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should shorten path on Linux, path starting with home with duplication', () => {
            const path = `${linuxHome}/${linuxHome}/a/b/theia`;
            const expected = `~/${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with home', () => {
            const path = `/test/${linuxHome}/a/b/theia`;
            const expected = `/test/${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux, path not starting with correct home', () => {
            const path = `/test/${linuxHome}123/a/b/theia`;
            const expected = `/test/${linuxHome}123/a/b/theia`;
            expect(Path.tildify(path, linuxHome)).eq(expected);
        });

        it('should not shorten path on Linux when home is empty', () => {
            const path = `${linuxHome}/a/b/theia`;
            const expected = `${linuxHome}/a/b/theia`;
            expect(Path.tildify(path, '')).eq(expected);
        });

        it('should expand ~ on Linux when path begins with ~', () => {
            const path = '~/a/b/theia';
            const expected = `${linuxHome}/a/b/theia`;
            expect(Path.untildify(path, linuxHome)).eq(expected);
        });

        it('should expand ~ on Linux when path starts with ~ duplication', () => {
            const path = '~/~/a/b/theia';
            const expected = `${linuxHome}/~/a/b/theia`;
            expect(Path.untildify(path, linuxHome)).eq(expected);
        });

        it('should not expand ~ on Linux when path does not start with ~', () => {
            const path = '/test/~/a/b/theia';
            const expected = '/test/~/a/b/theia';
            expect(Path.untildify(path, linuxHome)).eq(expected);
        });

        it('should not expand ~ on Linux when home is empty', () => {
            const path = '~/a/b/theia';
            const expected = '~/a/b/theia';
            expect(Path.untildify(path, '')).eq(expected);
        });
    });

    describe('Windows', () => {
        it('should not shorten path on Windows', () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(Path.tildify(path, windowsHome)).eq(expected);
        });

        it('should not shorten path on Windows when home is empty', () => {
            const path = `${windowsHome}/a/b/theia`;
            const expected = `${windowsHome}/a/b/theia`;
            expect(Path.tildify(path, '')).eq(expected);
        });

        it('should not expand ~ on Windows', () => {
            const path = '~/a/b/theia';
            const expected = '~/a/b/theia';
            expect(Path.untildify(path, windowsHome)).eq(expected);
        });

        it('should not expand ~ on Windows when home is empty', () => {
            const path = '~/a/b/theia';
            const expected = '~/a/b/theia';
            expect(Path.untildify(path, '')).eq(expected);
        });
    });

    describe('isRoot', () => {
        it('should be root on /', () => {
            expect(Path.isRoot('/')).equals(true);
        });

        it('should not be root on /foo', () => {
            expect(Path.isRoot('/foo')).equals(false);
        });

        it('should be root on c:/', () => {
            expect(Path.isRoot('c:/')).equals(true);
        });

        it('should be root on C:/', () => {
            expect(Path.isRoot('C:/')).equals(true);
        });

        it('should be root on /c:/', () => {
            expect(Path.isRoot('/c:/')).equals(true);
        });

        it('should be root on c:', () => {
            expect(Path.isRoot('c:')).equals(true);
        });

        it('should not be root on c:/foo', () => {
            expect(Path.isRoot('c:/foo')).equals(false);
        });

        it('should not be root on /c:/foo', () => {
            expect(Path.isRoot('/c:/foo')).equals(false);
        });
    });
});

describe('URI', () => {

    describe('allLocations', () => {

        it('of /foo/bar/file.txt', () => {
            expect(Uri.allLocations(URI.file('/foo/bar/file.txt')).map(x => x.toString()))
                .deep.equals([
                    URI.file('/foo/bar/file.txt').toString(),
                    URI.file('/foo/bar').toString(),
                    URI.file('/foo').toString(),
                    URI.file('/').toString()
                ]);
        });

        it('of foo', () => {
            expect(Uri.allLocations(URI.file('foo')).map(x => x.toString()))
                .deep.equals([
                    URI.file('foo').toString(),
                    URI.file('/').toString()
                ]);
        });

        it('of foo:bar.txt', () => {
            expect(Uri.allLocations(URI.from({ scheme: 'foo', path: 'bar.txt' })).map(x => x.toString()))
                .deep.equals([
                    'foo:bar.txt'
                ]);
        });

        it('of foo:bar/foobar.txt', () => {
            expect(Uri.allLocations(URI.from({ scheme: 'foo', path: 'bar/foobar.txt' })).map(x => x.toString()))
                .deep.equals([
                    URI.from({ scheme: 'foo', path: 'bar/foobar.txt' }).toString(),
                    URI.from({ scheme: 'foo', path: 'bar' }).toString()
                ]);
        });
    });

    describe('isEqualOrParent', () => {
        it('should return `true` for `uris` which are equal', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/a.ts');
            expect(Uri.isEqualOrParent(a, b)).equals(true);
        });
        it('should return `false` for `uris` which are not equal', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/b.ts');
            expect(Uri.isEqualOrParent(a, b)).equals(false);
        });

        it('should return `false` for `uris` which are not the same scheme', () => {
            const a = URI.parse('a:///C:/projects/theia/foo/a.ts');
            const b = URI.parse('b:///C:/projects/theia/foo/a.ts');
            expect(Uri.isEqualOrParent(a, b)).equals(false);
        });

        it('should return `true` for `uris` that are not case-sensitive equal, with case-sensitivity `off`', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/A.ts');
            expect(Uri.isEqualOrParent(a, b, false)).equals(true);
        });
        it('should return `false` for `uris` that are not case-sensitive equal, with case-sensitivity `on`', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/A.ts');
            expect(Uri.isEqualOrParent(a, b, true)).equals(false);
        });

        it('should return `true` for parent paths', () => {
            const a = URI.file('C:/projects/'); // parent uri.
            const b = URI.file('C:/projects/theia/foo');
            expect(Uri.isEqualOrParent(a, b)).equals(true);
        });
        it('should return `false` for non-parent paths', () => {
            const a = URI.file('C:/projects/a/'); // non-parent uri.
            const b = URI.file('C:/projects/theia/foo');
            expect(Uri.isEqualOrParent(a, b)).equals(false);
        });
    });

    describe('isEqual', () => {
        it('should return `true` for `uris` which are equal', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/a.ts');
            expect(Uri.isEqual(a, b)).equals(true);
        });
        it('should return `false` for `uris` which are not equal', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/b.ts');
            expect(Uri.isEqual(a, b)).equals(false);
        });
        it('should return `true` for `uris` that are not case-sensitive equal, with case-sensitivity `off`', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/A.ts');
            expect(Uri.isEqual(a, b, false)).equals(true);
        });
        it('should return `false` for `uris` that are not case-sensitive equal, with case-sensitivity `on`', () => {
            const a = URI.file('C:/projects/theia/foo/a.ts');
            const b = URI.file('C:/projects/theia/foo/A.ts');
            expect(Uri.isEqual(a, b, true)).equals(false);
        });
        it('should return `false` for parent paths', () => {
            const a = URI.file('C:/projects/'); // parent uri.
            const b = URI.file('C:/projects/theia/foo');
            expect(Uri.isEqual(a, b)).equals(false);
        });
        it('should return `false` for different schemes', () => {
            const a = URI.parse('a:///C:/projects/theia/foo/a.ts');
            const b = URI.parse('b:///C:/projects/theia/foo/a.ts');
            expect(Uri.isEqual(a, b)).equals(false);
        });
    });

});
