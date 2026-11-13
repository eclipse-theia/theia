// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import URI from '@theia/core/lib/common/uri';
import { OutputLinkComputer } from './output-link-computer.js';

describe('OutputLinkComputer', () => {

    const computer = new OutputLinkComputer();
    computer.setWorkspaceFolders([{ uri: new URI('file:///workspace/project'), fsPath: '/workspace/project' }]);

    const urls = (line: string, linkComputer = computer): string[] =>
        linkComputer.computeLinks([line]).map(link => new URI(link.url!.toString()).toString(true));

    it('should link a path in the workspace', () => {
        expect(urls('plain: /workspace/project/README.md')).to.deep.equal(['file:///workspace/project/README.md']);
    });

    it('should link GCC style positions', () => {
        expect(urls('/workspace/project/package.json:3:5: error: something')).to.deep.equal(['file:///workspace/project/package.json#L3,5']);
    });

    it('should link MSBuild style positions as one link', () => {
        expect(urls('/workspace/project/package.json(10,3): warning')).to.deep.equal(['file:///workspace/project/package.json#L10,3']);
    });

    it('should link "on line" positions', () => {
        expect(urls('/workspace/project/README.md on line 20, column 4')).to.deep.equal(['file:///workspace/project/README.md#L20,4']);
    });

    it('should not link paths outside the workspace', () => {
        expect(urls('/etc/hosts:1:1')).to.be.empty;
    });

    it('should not link folders that only start with the workspace path', () => {
        expect(urls('/workspace/project-other/README.md')).to.be.empty;
    });

    it('should link paths if the workspace folder is a file system root', () => {
        const posixRoot = new OutputLinkComputer();
        posixRoot.setWorkspaceFolders([{ uri: new URI('file:///'), fsPath: '/' }]);
        expect(urls('/src/a.ts:3:4', posixRoot)).to.deep.equal(['file:///src/a.ts#L3,4']);

        const driveRoot = new OutputLinkComputer();
        driveRoot.setWorkspaceFolders([{ uri: new URI('file:///c:/'), fsPath: 'c:\\' }]);
        expect(urls('c:\\src\\a.ts:3', driveRoot)).to.deep.equal(['file:///c:/src/a.ts#L3']);
        expect(urls('c:/src/b.ts(3,4)', driveRoot)).to.deep.equal(['file:///c:/src/b.ts#L3,4']);
    });

    it('should compute the range of the link', () => {
        const [link] = computer.computeLinks(['first line', 'see /workspace/project/a.ts']);
        expect(link.range).to.deep.equal({ startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 28 });
    });

    it('should link Windows paths with either separator', () => {
        const windows = new OutputLinkComputer();
        windows.setWorkspaceFolders([{ uri: new URI('file:///c:/ws'), fsPath: 'c:\\ws' }]);
        expect(urls('C:\\ws\\src\\a.ts(3,4)', windows)).to.deep.equal(['file:///c:/ws/src/a.ts#L3,4']);
        expect(urls('c:/ws/src/b.ts:7', windows)).to.deep.equal(['file:///c:/ws/src/b.ts#L7']);
    });
});
