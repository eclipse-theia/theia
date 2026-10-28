// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import * as path from 'path';
import { appUri, isAppFileUrl, resolveAppFile } from './app-scheme';

describe('app-scheme', () => {

    const root = '/app/lib/frontend';

    it('resolves files under the frontend root, ignoring query and fragment', () => {
        expect(resolveAppFile('theia-app://theia/index.html?port=1#x', root)).to.equal('/app/lib/frontend/index.html');
        expect(resolveAppFile('theia-app://theia/sub/bundle.js', root)).to.equal('/app/lib/frontend/sub/bundle.js');
    });

    it('never resolves a file outside the frontend root', () => {
        // The URL parser removes dot segments, encoded or not, so these stay under the root; the path guard
        // in resolveAppFile covers what the parser does not normalize, such as Windows separators.
        for (const url of [
            'theia-app://theia/../package.json',
            'theia-app://theia/sub/../../package.json',
            'theia-app://theia/%2e%2e/package.json',
            'theia-app://theia//etc/passwd',
        ]) {
            const file = resolveAppFile(url, root);
            expect(file, url).to.not.equal(undefined);
            expect(file!.startsWith(root + '/'), url).to.equal(true);
        }
        expect(resolveAppFile('theia-app://theia/../package.json', root)).to.equal('/app/lib/frontend/package.json');
        expect(resolveAppFile('theia-app://theia//etc/passwd', root)).to.equal('/app/lib/frontend/etc/passwd');
        // Encoded separators survive the URL parser and reach the path guard.
        expect(resolveAppFile('theia-app://theia/%2F..%2F..%2Fetc/passwd', root)).to.equal(undefined);
        expect(resolveAppFile('theia-app://theia/sub/%2F..%2F..%2F..%2Fetc', root)).to.equal(undefined);
    });

    it('contains Windows paths, including backslashes and drive letters', () => {
        const win = 'C:\\app\\lib\\frontend';
        expect(resolveAppFile('theia-app://theia/index.html', win, path.win32)).to.equal('C:\\app\\lib\\frontend\\index.html');
        expect(resolveAppFile('theia-app://theia/%5C..%5C..%5CWindows%5Cwin.ini', win, path.win32)).to.equal(undefined);
        expect(resolveAppFile('theia-app://theia/sub%5C..%5C..%5Cpackage.json', win, path.win32)).to.equal(undefined);
        expect(resolveAppFile('theia-app://theia/D:%5Cother%5Cfile', win, path.win32)!.startsWith(win + '\\')).to.equal(true);
    });

    it('recognises a frontend file by scheme, host and name', () => {
        expect(isAppFileUrl('theia-app://theia/index.html?port=1#/ws', 'index.html')).to.equal(true);
        expect(isAppFileUrl('theia-app://theia/secondary-window.html', 'secondary-window.html')).to.equal(true);
        expect(isAppFileUrl('theia-app://theia/secondary-window.html', 'index.html')).to.equal(false);
        expect(isAppFileUrl('theia-app://other/index.html', 'index.html')).to.equal(false);
        expect(isAppFileUrl('theia-app://theia/x/index.html', 'index.html')).to.equal(false);
        expect(isAppFileUrl('file:///app/lib/frontend/index.html', 'index.html')).to.equal(false);
        expect(isAppFileUrl('not a url', 'index.html')).to.equal(false);
    });

    it('refuses other hosts and schemes', () => {
        expect(resolveAppFile('theia-app://other/index.html', root)).to.equal(undefined);
        expect(resolveAppFile('file:///app/lib/frontend/index.html', root)).to.equal(undefined);
    });

    it('builds application URIs', () => {
        expect(appUri('index.html')).to.equal('theia-app://theia/index.html');
    });

});
