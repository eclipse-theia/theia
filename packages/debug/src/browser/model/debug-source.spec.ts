// *****************************************************************************
// Copyright (C) 2026 1C-Soft LLC and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { isWindows, OS } from '@theia/core';
import { DebugSource } from './debug-source.js';

disableJSDOM();

describe('DebugSource.toUri', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let backendIsWindows: boolean;
    beforeEach(() => {
        backendIsWindows = OS.backend.isWindows;
    });
    afterEach(() => {
        OS.backend.isWindows = backendIsWindows;
    });

    describe('windows backend', () => {

        beforeEach(() => {
            OS.backend.isWindows = true;
        });

        it('converts a windows path to a file uri', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: 'C:\\project\\main.ts' }).toString())
                .to.equal('file:///c%3A/project/main.ts');
        });

        it('converts a path with a lowercase drive letter', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: 'c:\\x.ts' }).toString())
                .to.equal('file:///c%3A/x.ts');
        });

        it('converts a path with mixed separators', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: 'C:/project\\main.ts' }).toString())
                .to.equal('file:///c%3A/project/main.ts');
        });

        it('converts a unc path to a file uri with authority', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: '\\\\server\\share\\main.ts' }).toString())
                .to.equal('file://server/share/main.ts');
        });

    });

    describe('non-windows backend', () => {

        beforeEach(() => {
            OS.backend.isWindows = false;
        });

        it('converts a posix path to a file uri', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: '/home/user/main.ts' }).toString())
                .to.equal('file:///home/user/main.ts');
        });

        it('preserves a literal backslash in a posix filename', () => {
            expect(DebugSource.toUri({ name: 'a\\b.ts', path: '/home/user/a\\b.ts' }).toString())
                .to.equal('file:///home/user/a%5Cb.ts');
        });

        it('preserves a literal backslash in a posix filename on a windows frontend', () => {
            const frontendIsWindows = isWindows;
            OS.override('isWindows', true);
            try {
                expect(DebugSource.toUri({ name: 'a\\b.ts', path: '/home/user/a\\b.ts' }).toString())
                    .to.equal('file:///home/user/a%5Cb.ts');
            } finally {
                OS.override('isWindows', frontendIsWindows);
            }
        });

    });

    describe('independent of the backend os', () => {

        it('creates a debug uri for in-memory sources', () => {
            const uri = DebugSource.toUri({ name: 'main.ts', sourceReference: 42 });
            expect(uri.scheme).to.equal(DebugSource.SCHEME);
            expect(uri.query).to.equal('42');
        });

        it('leaves paths that are already uris unchanged', () => {
            expect(DebugSource.toUri({ name: 'main.ts', path: 'file:///home/user/main.ts' }).toString())
                .to.equal('file:///home/user/main.ts');
        });

        it('throws if the source has neither path nor source reference', () => {
            expect(() => DebugSource.toUri({ name: 'main.ts' })).to.throw(/Unrecognized source type/);
        });

    });

});
