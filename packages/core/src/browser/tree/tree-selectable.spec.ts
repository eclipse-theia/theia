// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { TreeNode } from './tree';
import { TreeModel } from './tree-model';
import { notEmpty } from '../../common/objects';
import { expect } from 'chai';
import { createTreeTestContainer } from './test/tree-test-container';
import { SelectableTreeNode } from './tree-selection';
import { MockSelectableTreeModel } from './test/mock-selectable-tree-model';
import { ExpandableTreeNode } from './tree-expansion';

describe('Selectable Tree', () => {
    let model: TreeModel;
    function assertNodeRetrieval(method: () => TreeNode | undefined, sequence: string[]): void {
        for (const expectedNodeId of sequence) {
            const actualNode = method();
            const expectedNode = retrieveNode<SelectableTreeNode>(expectedNodeId);
            expect(actualNode?.id).to.be.equal(expectedNode.id);
            model.addSelection(expectedNode);
        }
    }
    function assertNodeSelection(method: () => void, sequence: string[]): void {
        for (const expectedNodeId of sequence) {
            method();
            const node = retrieveNode<SelectableTreeNode>(expectedNodeId);
            expect(node.selected).to.be.true;
        }
    }
    describe('Get and Set Next Nodes Methods', () => {
        const uncollapsedSelectionOrder = ['1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.1.1', '1.2.1.2', '1.2.2', '1.2.3', '1.3'];
        const collapsedSelectionOrder = ['1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3'];
        beforeEach(() => {
            model = createTreeModel();
            model.root = MockSelectableTreeModel.HIERARCHICAL_MOCK_ROOT();
            model.addSelection(retrieveNode<SelectableTreeNode>('1'));

        });
        it('`getNextNode()` should select each node in sequence (uncollapsed)', done => {
            assertNodeRetrieval(model.getNextNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getNextNode()` should select each node in sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeRetrieval(model.getNextNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getNextSelectableNode()` should select each node in sequence (uncollapsed)', done => {
            assertNodeRetrieval(model.getNextSelectableNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getNextSelectableNode()` should select each node in sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeRetrieval(model.getNextSelectableNode.bind(model), collapsedSelectionOrder);
            done();
        });
        it('`selectNext()` should select each node in sequence (uncollapsed)', done => {
            assertNodeSelection(model.selectNext.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectNext()` should select each node in sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeSelection(model.selectNext.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectNextNode()` should select each node in sequence (uncollapsed)', done => {
            assertNodeSelection(model.selectNextNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectNextNode()` should select each node in sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeSelection(model.selectNextNode.bind(model), collapsedSelectionOrder);
            done();
        });
    });

    describe('Get and Set Previous Nodes Methods', () => {
        const uncollapsedSelectionOrder = ['1.2.3', '1.2.2', '1.2.1.2', '1.2.1.1', '1.2.1', '1.2', '1.1.2', '1.1.1', '1.1'];
        const collapsedSelectionOrder = ['1.2.3', '1.2.2', '1.2.1', '1.2', '1.1'];
        beforeEach(() => {
            model = createTreeModel();
            model.root = MockSelectableTreeModel.HIERARCHICAL_MOCK_ROOT();
            model.addSelection(retrieveNode<SelectableTreeNode>('1.3'));
        });
        it('`getPrevNode()` should select each node in reverse sequence (uncollapsed)', done => {
            assertNodeRetrieval(model.getPrevNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getPrevNode()` should select each node in reverse sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeRetrieval(model.getPrevNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getPrevSelectableNode()` should select each node in reverse sequence (uncollapsed)', done => {
            assertNodeRetrieval(model.getPrevSelectableNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`getPrevSelectableNode()` should select each node in reverse sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeRetrieval(model.getPrevSelectableNode.bind(model), collapsedSelectionOrder);
            done();
        });
        it('`selectPrev()` should select each node in reverse sequence (uncollapsed)', done => {
            assertNodeSelection(model.selectPrev.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectPrev()` should select each node in reverse sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeSelection(model.selectPrev.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectPrevNode()` should select each node in reverse sequence (uncollapsed)', done => {
            assertNodeSelection(model.selectPrevNode.bind(model), uncollapsedSelectionOrder);
            done();
        });
        it('`selectPrevNode()` should select each node in reverse sequence (collapsed)', done => {
            collapseNode('1.1', '1.2.1');
            assertNodeSelection(model.selectPrevNode.bind(model), collapsedSelectionOrder);
            done();
        });
    });

    const findNode = (id: string) => model.getNode(id);
    function createTreeModel(): TreeModel {
        const container = createTreeTestContainer();
        return container.get(TreeModel);
    }
    function retrieveNode<T extends TreeNode>(id: string): Readonly<T> {
        const readonlyNode: Readonly<T> = model.getNode(id) as T;
        return readonlyNode;
    }
    function collapseNode(...ids: string[]): void {
        ids.map(findNode).filter(notEmpty).filter(ExpandableTreeNode.is).forEach(node => {
            model.collapseNode(node);
            expect(node).to.have.property('expanded', false);
        });
    }

});
