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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { CompositeTreeNode } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { DirNode } from '@theia/filesystem/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceNode } from './navigator-tree';
import { FileNavigatorTreeCompressionService } from './navigator-tree-compression-service';

disableJSDOM();

describe('FileNavigatorTreeCompressionService', () => {

    const service = new FileNavigatorTreeCompressionService();

    const dir = (uri: string, parent: CompositeTreeNode, visible = true): DirNode => {
        const node: DirNode = {
            id: uri, uri: new URI(uri), fileStat: FileStat.dir(uri), name: new URI(uri).path.base,
            parent, children: [], expanded: false, selected: false, visible
        };
        CompositeTreeNode.addChild(parent, node);
        return node;
    };

    it('does not compact the root of a multi-root workspace with its only folder', () => {
        const workspace = WorkspaceNode.createRoot('multi');
        const root = dir('file:///alice/app', workspace);
        const src = dir('file:///alice/app/src', root);
        dir('file:///alice/app/src/main', src);

        expect(service.isCompressionParent(root)).to.be.false;
        expect(service.isCompressionChild(src)).to.be.false;
        expect(service.isCompressionParent(src)).to.be.true;
    });

    it('compacts the folders of a single-root workspace', () => {
        const root = dir('file:///alice/app', WorkspaceNode.createRoot(), false);
        const src = dir('file:///alice/app/src', root);
        const main = dir('file:///alice/app/src/main', src);
        dir('file:///alice/app/src/main/ts', main);

        expect(service.isCompressionHead(src)).to.be.true;
        expect(service.isCompressionChild(main)).to.be.true;
    });
});
