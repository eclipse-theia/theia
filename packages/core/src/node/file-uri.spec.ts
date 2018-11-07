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

import * as os from 'os';
import * as path from 'path';
import * as chai from 'chai';
import { FileUri } from './file-uri';
import { isWindows } from '../common/os';

const expect = chai.expect;

describe('file-uri', () => {

    const filePaths: string[] = ['with.txt', 'with spaces.txt', 'with:colon.txt', 'with_Ö.txt'].map(filePath => path.join(os.tmpdir(), 'file-uri-folder', filePath));

    it('create -> fsPath -> create should be symmetric', () => {
        const orderedPaths = filePaths.map(filePath => filePath.toLowerCase()).sort();
        expect(orderedPaths.map(filePath => FileUri.create(filePath)).map(uri => FileUri.fsPath(uri).toLowerCase()).sort()).to.be.deep.equal(orderedPaths);
    });

    it('fsPath -> create -> fsPath should be symmetric', () => {
        filePaths.forEach(filePath => {
            const expectedUri = FileUri.create(filePath);
            const convertedPath = FileUri.fsPath(expectedUri);
            const actualUri = FileUri.create(convertedPath);
            expect(actualUri.toString()).to.be.equal(expectedUri.toString());
        });
    });

    it('from /', () => {
        const uri = FileUri.create('/');
        expect(uri.toString(true)).to.be.equal('file:///');
    });

    it('from //', () => {
        const uri = FileUri.create('//');
        expect(uri.toString(true)).to.be.equal('file:///');
    });

    it('from c:', () => {
        const uri = FileUri.create('c:');
        expect(uri.toString(true)).to.be.equal('file:///c:');
    });

    it('from /c:', () => {
        const uri = FileUri.create('/c:');
        expect(uri.toString(true)).to.be.equal('file:///c:');
    });

    it('from /c:/', () => {
        const uri = FileUri.create('/c:/');
        expect(uri.toString(true)).to.be.equal('file:///c:/');
    });

    it('from file:///c%3A', function () {
        if (!isWindows) {
            this.skip();
            return;
        }
        const fsPath = FileUri.fsPath('file:///c%3A');
        expect(fsPath).to.be.equal('c:\\');
    });
});
