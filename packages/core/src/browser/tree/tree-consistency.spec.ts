/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as assert from 'assert';
import { injectable } from 'inversify';
import { createTreeTestContainer } from './test/tree-test-container';
import { TreeImpl, CompositeTreeNode, TreeNode } from './tree';
import { TreeModel } from './tree-model';
import { ExpandableTreeNode } from './tree-expansion';

@injectable()
class ConsistencyTestTree extends TreeImpl {

    public resolveCounter = 0;

    protected async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
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

describe('Tree Consistency', () => {

    it('setting different tree roots should finish', async () => {
        const container = createTreeTestContainer();
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
                // eslint-disable-next-line deprecation/deprecation
                assert.deepStrictEqual(model.root!.name, 'Bar');
                return;
            }
            resolveCounter = tree.resolveCounter;
        }
        assert.ok(false, 'Resolving does not stop, attempts: ' + tree.resolveCounter);
    });

});
