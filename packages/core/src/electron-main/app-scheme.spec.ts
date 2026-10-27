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
import { appUri, contentTypeOf, resolveAppFile } from './app-scheme';

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
    });

    it('refuses other hosts and schemes', () => {
        expect(resolveAppFile('theia-app://other/index.html', root)).to.equal(undefined);
        expect(resolveAppFile('file:///app/lib/frontend/index.html', root)).to.equal(undefined);
    });

    it('maps file extensions to content types', () => {
        expect(contentTypeOf('bundle.js')).to.equal('text/javascript');
        expect(contentTypeOf('bundle.css')).to.equal('text/css');
        expect(contentTypeOf('index.html')).to.equal('text/html');
        expect(contentTypeOf('x.bin')).to.equal('application/octet-stream');
    });

    it('builds application URIs', () => {
        expect(appUri('index.html')).to.equal('theia-app://theia/index.html');
    });

});
