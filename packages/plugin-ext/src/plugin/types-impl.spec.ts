// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { isWindows } from '@theia/core';
import * as assert from 'assert';
import * as types from './types-impl';

describe('API Type Implementations:', () => {

    describe('URI:', () => {
        it('should convert to string', () => {
            const uriString = 'scheme://authority.com/foo/bar/zoz?query#fragment';
            const uri = types.URI.parse(uriString);
            // when
            const result = uri.toString();

            // then
            assert.strictEqual(result, uriString);
        });

        // Issue: #10370
        it('should returns correct path while using joinPath()', () => {
            if (isWindows) {
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\foo\\bar'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\foo\\bar\\'), 'file.js').toString(), 'file:///c%3A/foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\foo\\bar\\'), '/file.js').toString(), 'file:///c%3A/foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\'), '/file.js').toString(), 'file:///c%3A/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\'), 'bar/file.js').toString(), 'file:///c%3A/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\foo'), './file.js').toString(), 'file:///c%3A/foo/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('c:\\foo'), '/./file.js').toString(), 'file:///c%3A/foo/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('C:\\foo'), '../file.js').toString(), 'file:///c%3A/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('C:\\foo\\.'), '../file.js').toString(), 'file:///c%3A/file.js');
            } else {
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar'), '/file.js').toString(), 'file:///foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar'), 'file.js').toString(), 'file:///foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar/'), '/file.js').toString(), 'file:///foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/'), '/file.js').toString(), 'file:///file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar'), './file.js').toString(), 'file:///foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar'), '/./file.js').toString(), 'file:///foo/bar/file.js');
                assert.strictEqual(types.URI.joinPath(types.URI.file('/foo/bar'), '../file.js').toString(), 'file:///foo/file.js');
            }
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar')).toString(), 'foo://a/foo/bar');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar'), 'file.js').toString(), 'foo://a/foo/bar/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar/'), '/file.js').toString(), 'foo://a/foo/bar/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/'), '/file.js').toString(), 'foo://a/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar/'), './file.js').toString(), 'foo://a/foo/bar/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar/'), '/./file.js').toString(), 'foo://a/foo/bar/file.js');
            assert.strictEqual(types.URI.joinPath(types.URI.parse('foo://a/foo/bar/'), '../file.js').toString(), 'foo://a/foo/file.js');

            assert.strictEqual(
                types.URI.joinPath(types.URI.from({ scheme: 'myScheme', authority: 'authority', path: '/path', query: 'query', fragment: 'fragment' }), '/file.js').toString(),
                'myScheme://authority/path/file.js?query#fragment');
        });
    });

    describe('RelativePattern:', () => {
        it('should update .base when setting .baseUri', () => {
            const testUri = types.URI.file('/expected/file/path');
            const rPattern = new types.RelativePattern('/initial/unrelated/path', 'not relevant');
            rPattern.baseUri = testUri;
            assert.strictEqual(rPattern.base, testUri.fsPath);
        });

        it('should update .baseUri when setting .base', () => {
            const testUri = types.URI.file('/expected/file/path');
            const rPattern = new types.RelativePattern('/initial/unrelated/path', 'not relevant');
            rPattern.base = testUri.fsPath;
            assert.strictEqual(rPattern.baseUri.toString(), testUri.toString());
        });
    });
});
