// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { createTreeTestContainer } from './test/tree-test-container';
import { TreeImpl, CompositeTreeNode, TreeNode } from './tree';
import { TreeModel } from './tree-model';
import { ExpandableTreeNode } from './tree-expansion';
import { TreeLabelProvider } from './tree-label-provider';
import { MockTreeModel } from './test/mock-tree-model';
import { MockLogger } from '../../common/test/mock-logger';
import { ILogger } from '../../common';
import { Deferred, timeout } from '../../common/promise-util';

@injectable()
class ConsistencyTestTree extends TreeImpl {

    public resolveCounter = 0;

    protected override async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (parent.id === 'expandable') {
            const step: () => Promise<TreeNode[]> = async () => {
                // a predicate to emulate bad timing, i.e.
                // children of a node gets resolved when a root is changed
                if (this.root && this.root !== parent.parent) {
                    this.resolveCounter++;
                    return [];
                } else {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return step();
                }
            };
            return step();
        }
        return super.resolveChildren(parent);
    }

}

/**
 * Return roots having the same id, but not object identity.
 */
function createConsistencyTestRoot(rootName: string): CompositeTreeNode {
    const children: TreeNode[] = [];
    const root: CompositeTreeNode = {
        id: 'root',
        name: rootName,
        parent: undefined,
        children
    };
    const parent: ExpandableTreeNode = {
        id: 'expandable',
        name: 'expandable',
        parent: root,
        expanded: true,
        children: []
    };
    children.push(parent);
    return root;
}

/**
 * A `TreeImpl` whose `resolveChildren` can be stalled or overridden per node id, to
 * simulate slow child resolution (e.g. a file system request) in tests.
 */
@injectable()
class StallingTestTree extends TreeImpl {

    protected readonly stalled = new Map<string, Deferred<TreeNode[]>>();
    protected readonly overrides = new Map<string, () => TreeNode[]>();

    /**
     * Stall the *next* `resolveChildren` for `id` on the returned deferred. Later
     * resolutions for the same id proceed normally, so the stall cannot leak into
     * unrelated refreshes (e.g. the cascade of a newly set root).
     */
    stallNextResolve(id: string): Deferred<TreeNode[]> {
        const gate = new Deferred<TreeNode[]>();
        this.stalled.set(id, gate);
        return gate;
    }

    /** Make the *next* `resolveChildren` for `id` return `children()` instead of the current child nodes. */
    overrideNextResolve(id: string, children: () => TreeNode[]): void {
        this.overrides.set(id, children);
    }

    protected override resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        const gate = this.stalled.get(parent.id);
        if (gate) {
            this.stalled.delete(parent.id);
            return gate.promise;
        }
        const override = this.overrides.get(parent.id);
        if (override) {
            this.overrides.delete(parent.id);
            return Promise.resolve(override());
        }
        return super.resolveChildren(parent);
    }

}

describe('Tree Consistency', () => {

    it('setting different tree roots should finish', async () => {
        const container = createTreeTestContainer();
        container.bind(TreeLabelProvider).toSelf().inSingletonScope();
        const labelProvider = container.get(TreeLabelProvider);

        container.bind(ConsistencyTestTree).toSelf();
        container.rebind(TreeImpl).toService(ConsistencyTestTree);
        const tree = container.get(ConsistencyTestTree);

        const model = container.get<TreeModel>(TreeModel);

        model.root = createConsistencyTestRoot('Foo');
        await new Promise(resolve => setTimeout(resolve, 50));

        model.root = createConsistencyTestRoot('Bar');
        await new Promise(resolve => setTimeout(resolve, 50));

        let resolveCounter = tree.resolveCounter;
        assert.deepStrictEqual(tree.resolveCounter, 1);
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            if (resolveCounter === tree.resolveCounter) {
                assert.deepStrictEqual(tree.resolveCounter, 1);
                assert.deepStrictEqual(labelProvider.getName(model.root)!, 'Bar');
                return;
            }
            resolveCounter = tree.resolveCounter;
        }
        assert.ok(false, 'Resolving does not stop, attempts: ' + tree.resolveCounter);
    });

    describe('stale refreshes', () => {

        let tree: StallingTestTree;
        let model: TreeModel;
        let loggedErrors: unknown[][];

        beforeEach(async () => {
            const container = createTreeTestContainer();
            container.bind(StallingTestTree).toSelf();
            container.rebind(TreeImpl).toService(StallingTestTree);
            tree = container.get(StallingTestTree);
            model = container.get<TreeModel>(TreeModel);
            loggedErrors = [];
            const logger = container.get<MockLogger>(ILogger);
            logger.error = async (...args: unknown[]) => { loggedErrors.push(args); };
            model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
            // let the refresh cascade triggered by setting the root settle
            await timeout(0);
        });

        it('drops an in-flight refresh when the root is replaced meanwhile', async () => {
            const stale = model.getNode('1.2') as CompositeTreeNode;
            const gate = tree.stallNextResolve('1.2');
            const pendingRefresh = tree.refresh(stale);

            model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
            gate.resolve(Array.from(stale.children));

            assert.strictEqual(await pendingRefresh, undefined);
            assert.deepStrictEqual(loggedErrors, []);
            const fresh = model.getNode('1.2');
            assert.ok(fresh);
            assert.notStrictEqual(fresh, stale);
        });

        it('does not resurrect a removed subtree when a stale refresh completes', async () => {
            const target = model.getNode('1.2') as CompositeTreeNode;
            const gate = tree.stallNextResolve('1.2');
            const pendingRefresh = tree.refresh(target);

            CompositeTreeNode.removeChild(target.parent as CompositeTreeNode, target, tree);
            assert.strictEqual(model.getNode('1.2'), undefined);
            gate.resolve(Array.from(target.children));

            assert.strictEqual(await pendingRefresh, undefined);
            assert.strictEqual(model.getNode('1.2'), undefined);
            assert.strictEqual(model.getNode('1.2.1'), undefined);
        });

        it('does not re-index a node object that a concurrent ancestor refresh replaced', async () => {
            const stale = model.getNode('1.2') as CompositeTreeNode;
            const gate = tree.stallNextResolve('1.2');
            const pendingRefresh = tree.refresh(stale);

            // an ancestor refresh yields a *fresh* object for the same id, as trees whose
            // `resolveChildren` builds new nodes do
            const parent = model.getNode('1') as CompositeTreeNode;
            const replacement: CompositeTreeNode = { id: '1.2', name: '1.2', parent, children: [] };
            tree.overrideNextResolve('1', () => parent.children.map(child => child.id === '1.2' ? replacement : child));
            await tree.refresh(parent);
            assert.strictEqual(model.getNode('1.2'), replacement);

            gate.resolve(Array.from(stale.children));

            assert.strictEqual(await pendingRefresh, undefined);
            assert.deepStrictEqual(loggedErrors, []);
            // the stale object must not take the replacement's place in the index, nor bring its children back
            assert.strictEqual(model.getNode('1.2'), replacement);
            assert.strictEqual(model.getNode('1.2.1'), undefined);
        });

    });

});
