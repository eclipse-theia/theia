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

import { inject, injectable } from '@theia/core/shared/inversify';
import { TreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeModelImpl } from '@theia/core/lib/browser/tree/tree-model';
import { TypeHierarchyRegistry, TypeHierarchyDirection, TypeHierarchyParams } from '../typehierarchy-provider';
import { TypeHierarchyTree } from './typehierarchy-tree';

@injectable()
export class TypeHierarchyTreeModel extends TreeModelImpl {

    @inject(TypeHierarchyRegistry)
    protected readonly registry: TypeHierarchyRegistry;

    protected doOpenNode(node: TreeNode): void {
        // do nothing (in particular do not expand the node)
    }

    /**
     * Initializes the tree by calculating and setting a new tree root node.
     */
    async initialize(options: TypeHierarchyTree.InitOptions): Promise<void> {
        this.tree.root = undefined;
        (this.tree as TypeHierarchyTree).provider = undefined;
        const { location, languageId, direction } = options;
        if (languageId && location) {
            const provider = await this.registry.get(languageId);
            if (provider) {
                const params: TypeHierarchyParams = {
                    textDocument: {
                        uri: location.uri
                    },
                    position: location.range.start,
                    direction,
                    resolve: 1
                };
                const symbol = await provider.get(params);
                if (symbol) {
                    const root = TypeHierarchyTree.RootNode.create(symbol, direction);
                    root.expanded = true;
                    this.tree.root = root;
                    (this.tree as TypeHierarchyTree).provider = provider;
                }
            }
        }
    }

    /**
     * If the tree root is set, it resets it with the inverse type hierarchy direction.
     */
    async flipDirection(): Promise<void> {
        const { root } = this.tree;
        const service = (this.tree as TypeHierarchyTree).provider;
        if (TypeHierarchyTree.RootNode.is(root) && !!service) {
            const { direction, item } = root;
            const { uri, selectionRange } = item;
            const location = {
                uri,
                range: selectionRange
            };
            this.initialize({
                direction: direction === TypeHierarchyDirection.Children ? TypeHierarchyDirection.Parents : TypeHierarchyDirection.Children,
                location,
                languageId: service.languageId
            });
        }
    }

}
