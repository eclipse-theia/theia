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
import { MockTreeModel } from '../test/mock-tree-model';
import { createTreeTestContainer } from '../test/tree-test-container';
import { TreeNode } from '../tree';
import { ExpandableTreeNode } from '../tree-expansion';
import { TreeModel } from '../tree-model';
import { TopDownCompressedTreeIterator } from './compressed-tree-model';
import { CompressionParent, TreeCompressionService } from './tree-compression-service';

describe('TopDownCompressedTreeIterator', () => {

    const model = createTreeTestContainer().get<TreeModel>(TreeModel);
    const findNode = (id: string): TreeNode => model.getNode(id)!;

    beforeEach(() => {
        model.root = MockTreeModel.Node.toTreeNode({
            id: 'root',
            children: [
                { id: 'a', children: [{ id: 'a.1', children: [{ id: 'a.1.1' }] }] },
                { id: 'b' }
            ]
        });
        (findNode('a') as ExpandableTreeNode).expanded = false;
    });

    it('descends into a collapsed compression parent', () => {
        const actual = [...new TopDownCompressedTreeIterator(findNode('a'), { pruneCollapsed: true })].map(node => node.id);
        expect(actual).to.deep.equal(['a', 'a.1', 'a.1.1', 'b']);
    });

    it('prunes a collapsed node that the given compression service does not treat as a compression parent', () => {
        class NoRootCompressionService extends TreeCompressionService {
            override isCompressionParent(node?: unknown): node is CompressionParent {
                return !(ExpandableTreeNode.is(node) && node.parent === model.root) && super.isCompressionParent(node);
            }
        }
        const iterator = new TopDownCompressedTreeIterator(findNode('a'), { pruneCollapsed: true }, new NoRootCompressionService());
        expect([...iterator].map(node => node.id)).to.deep.equal(['a', 'b']);
    });

});
