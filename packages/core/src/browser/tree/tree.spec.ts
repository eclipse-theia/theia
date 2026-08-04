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

import * as assert from 'assert';
import { injectable } from 'inversify';
import { TreeNode, CompositeTreeNode, TreeImpl } from './tree';
import { TreeModel } from './tree-model';
import { MockTreeModel } from './test/mock-tree-model';
import { expect } from 'chai';
import { createTreeTestContainer } from './test/tree-test-container';
import { Deferred, timeout } from '../../common/promise-util';
import { ILogger } from '../../common';
import { MockLogger } from '../../common/test/mock-logger';

/**
 * A `TreeImpl` whose `resolveChildren` can be stalled per node id, to simulate
 * slow child resolution (e.g. a file system request) in tests.
 */
@injectable()
class ControllableTree extends TreeImpl {

    readonly resolveRequests = new Map<string, Deferred<TreeNode[]>>();

    protected override resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        const pending = this.resolveRequests.get(parent.id);
        return pending ? pending.promise : super.resolveChildren(parent);
    }
}

describe('Tree', () => {

    it('addChildren', () => {
        assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "bar"
    },
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "previousSibling": "foo",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "bar"
    }
  ]
}`, getNode());
    });

    it('removeChild - first', () => {
        const node = getNode();
        CompositeTreeNode.removeChild(node, node.children[0]);
        assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "bar"
    }
  ]
}`, node);
    });

    it('removeChild - second', () => {
        const node = getNode();
        CompositeTreeNode.removeChild(node, node.children[1]);
        assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "foo"
    }
  ]
}`, node);
    });

    it('removeChild - third', () => {
        const node = getNode();
        CompositeTreeNode.removeChild(node, node.children[2]);
        assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "bar"
    },
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "previousSibling": "foo"
    }
  ]
}`, node);
    });

    it('removeChild - clears parent and sibling pointers on the removed node', () => {
        const node = getNode();
        const middle = node.children[1];
        CompositeTreeNode.removeChild(node, middle);
        expect(middle.parent).to.be.undefined;
        expect(middle.previousSibling).to.be.undefined;
        expect(middle.nextSibling).to.be.undefined;
    });

    it('removeChild - purges the detached subtree from the tree index when a tree is provided', () => {
        const target = model.getNode('1.2');
        expect(target).to.not.be.undefined;
        const parent = target!.parent!;
        expect(model.getNode('1.2.1')).to.not.be.undefined;
        CompositeTreeNode.removeChild(parent, target!, model);
        expect(model.getNode('1.2')).to.be.undefined;
        expect(model.getNode('1.2.1')).to.be.undefined;
    });

    it('removeChild - leaves the index untouched when no tree is provided', () => {
        const target = model.getNode('1.2')!;
        const parent = target.parent!;
        CompositeTreeNode.removeChild(parent, target);
        // Until the caller explicitly purges, the orphan is still in the index.
        expect(model.getNode('1.2')).to.equal(target);
        // Explicit purge cleans it up.
        model.removeNode(target);
        expect(model.getNode('1.2')).to.be.undefined;
    });

    let model: TreeModel;
    beforeEach(() => {
        model = createTreeModel();
        model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
    });
    describe('getNode', () => {
        it('returns undefined for undefined nodes', done => {
            expect(model.getNode(undefined)).to.be.undefined;
            done();
        });

        it('returns undefined for a non-existing id', done => {
            expect(model.getNode('10')).to.be.undefined;
            done();
        });

        it('returns a valid node for existing an id', done => {
            expect(model.getNode('1.1')).not.to.be.undefined;
            done();
        });
    });

    describe('validateNode', () => {
        it('returns undefined for undefined nodes', done => {
            expect(model.validateNode(undefined)).to.be.undefined;
            done();
        });

        it('returns undefined for non-existing nodes', done => {
            expect(model.validateNode(MockTreeModel.Node.toTreeNode({ 'id': '10' }))).to.be.undefined;
            done();
        });

        it('returns a valid node for an existing node', done => {
            expect(model.validateNode(retrieveNode<TreeNode>('1.1'))).not.to.be.undefined;
            done();
        });
    });

    describe('refresh', () => {
        it('refreshes all composite nodes starting with the root', done => {
            let result: Boolean = true;
            const expectedRefreshedNodes = new Set([
                retrieveNode<CompositeTreeNode>('1'),
                retrieveNode<CompositeTreeNode>('1.1'),
                retrieveNode<CompositeTreeNode>('1.2'),
                retrieveNode<CompositeTreeNode>('1.2.1')]);
            model.onNodeRefreshed((e: Readonly<CompositeTreeNode>) => {
                result = result && expectedRefreshedNodes.has(e);
                expectedRefreshedNodes.delete(e);
            });
            model.refresh().then(() => {
                expect(result).to.be.true;
                expect(expectedRefreshedNodes.size).to.be.equal(0);
                done();
            });
        });
    });

    describe('refresh(parent: Readonly<CompositeTreeNode>)', () => {
        it('refreshes all composite nodes starting with the provided node', done => {
            let result: Boolean = true;
            const expectedRefreshedNodes = new Set([
                retrieveNode<CompositeTreeNode>('1.2'),
                retrieveNode<CompositeTreeNode>('1.2.1')
            ]);
            model.onNodeRefreshed((e: Readonly<CompositeTreeNode>) => {
                result = result && expectedRefreshedNodes.has(e);
                expectedRefreshedNodes.delete(e);
            });
            model.refresh(retrieveNode<CompositeTreeNode>('1.2')).then(() => {
                expect(result).to.be.true;
                expect(expectedRefreshedNodes.size).to.be.equal(0);
                done();
            });
        });
    });

    describe('refresh - stale refreshes', () => {

        let tree: ControllableTree;
        let loggedErrors: unknown[][];

        beforeEach(async () => {
            const container = createTreeTestContainer();
            container.rebind(TreeImpl).to(ControllableTree);
            model = container.get(TreeModel);
            tree = container.get(TreeImpl) as ControllableTree;
            loggedErrors = [];
            const logger = container.get<MockLogger>(ILogger);
            logger.error = async (...args: unknown[]) => { loggedErrors.push(args); };
            model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
            // let the refresh cascade triggered by setting the root settle
            await timeout(0);
        });

        it('drops an in-flight refresh when the root is replaced meanwhile', async () => {
            const stale = retrieveNode<CompositeTreeNode>('1.2');
            const gate = new Deferred<TreeNode[]>();
            tree.resolveRequests.set('1.2', gate);
            const pendingRefresh = tree.refresh(stale);
            tree.resolveRequests.delete('1.2');

            model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
            gate.resolve(Array.from(stale.children));

            expect(await pendingRefresh).to.be.undefined;
            expect(loggedErrors).to.have.lengthOf(0);
            const fresh = model.getNode('1.2');
            expect(fresh).to.not.be.undefined;
            expect(fresh).to.not.equal(stale);
        });

        it('does not resurrect a removed subtree when a stale refresh completes', async () => {
            const target = retrieveNode<CompositeTreeNode>('1.2');
            const gate = new Deferred<TreeNode[]>();
            tree.resolveRequests.set('1.2', gate);
            const pendingRefresh = tree.refresh(target);
            tree.resolveRequests.delete('1.2');

            CompositeTreeNode.removeChild(target.parent as CompositeTreeNode, target, tree);
            expect(model.getNode('1.2')).to.be.undefined;
            gate.resolve(Array.from(target.children));

            expect(await pendingRefresh).to.be.undefined;
            expect(model.getNode('1.2')).to.be.undefined;
            expect(model.getNode('1.2.1')).to.be.undefined;
        });
    });

    function getNode(): CompositeTreeNode {
        return CompositeTreeNode.addChildren({
            id: 'parent',
            name: 'parent',
            children: [],
            parent: undefined
        }, [{
            id: 'foo',
            name: 'foo',
            parent: undefined
        }, {
            id: 'bar',
            name: 'bar',
            parent: undefined
        }, {
            id: 'baz',
            name: 'baz',
            parent: undefined
        }]);
    }

    function assertTreeNode(expectation: string, node: TreeNode): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.deepStrictEqual(expectation, JSON.stringify(node, (key: keyof CompositeTreeNode, value: any) => {
            if (key === 'parent' || key === 'previousSibling' || key === 'nextSibling') {
                return value && value.id;
            }
            return value;
        }, 2));
    }

    function createTreeModel(): TreeModel {
        const container = createTreeTestContainer();
        return container.get(TreeModel);
    }
    function retrieveNode<T extends TreeNode>(id: string): Readonly<T> {
        const readonlyNode: Readonly<T> = model.getNode(id) as T;
        return readonlyNode;
    }

});
