// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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
import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { DirNode } from '@theia/filesystem/lib/browser/file-tree/file-tree';
import { FileTreeLabelProvider } from '@theia/filesystem/lib/browser/file-tree/file-tree-label-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceNode, WorkspaceRootNode } from './navigator-tree';
import { WorkspaceRootNodeLabelProvider } from './workspace-root-node-label-provider';

disableJSDOM();

describe('WorkspaceRootNodeLabelProvider', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const backend = 'file:///home/user/project/backend';
    let labelProvider: WorkspaceRootNodeLabelProvider;

    function dirNode(uri: string, parent: DirNode['parent']): DirNode {
        const fileStat = FileStat.dir(uri);
        return { id: uri, uri: fileStat.resource, fileStat, name: fileStat.resource.path.base, parent, children: [], expanded: false, selected: false };
    }

    function rootNode(uri: string): WorkspaceRootNode {
        return dirNode(uri, WorkspaceNode.createRoot()) as WorkspaceRootNode;
    }

    beforeEach(() => {
        labelProvider = new WorkspaceRootNodeLabelProvider();
        Object.assign(labelProvider, {
            fileTreeLabelProvider: { canHandle: () => 101 } as unknown as FileTreeLabelProvider,
            workspaceService: {
                getWorkspaceRootName: (uri: URI) => uri.isEqual(new URI(backend)) ? 'API Server' : undefined
            } as unknown as WorkspaceService
        });
    });

    it('shows the name of a workspace root on its root node, with priority over the file tree', () => {
        const root = rootNode(backend);
        expect(labelProvider.canHandle(root)).to.equal(102);
        expect(labelProvider.getName(root)).to.equal('API Server');
    });

    it('does not handle a node of the same folder that is not a root node', () => {
        // e.g. one root nested inside another
        const nested = dirNode(backend, rootNode('file:///home/user/project'));
        expect(labelProvider.canHandle(nested)).to.equal(0);
    });

    it('falls back to the file tree label for a root without a name', () => {
        const root = rootNode('file:///home/user/project/frontend');
        expect(labelProvider.getName(root)).to.be.undefined;
    });
});
