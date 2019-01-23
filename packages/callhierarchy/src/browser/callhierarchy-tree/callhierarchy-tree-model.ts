/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { TreeModelImpl, TreeNode } from '@theia/core/lib/browser';
import { CallHierarchyTree } from './callhierarchy-tree';
import { CallHierarchyServiceProvider, CallHierarchyDirection } from '../callhierarchy-service';
import { Location } from 'vscode-languageserver-types';

@injectable()
export class CallHierarchyTreeModel extends TreeModelImpl {

    @inject(CallHierarchyTree) protected readonly tree: CallHierarchyTree;
    @inject(CallHierarchyServiceProvider) protected readonly callHierarchyServiceProvider: CallHierarchyServiceProvider;

    getTree(): CallHierarchyTree {
        return this.tree;
    }

    async initializeCallHierarchy(languageId: string | undefined, location: Location | undefined, direction: CallHierarchyDirection): Promise<void> {
        this.tree.root = undefined;
        this.tree.callHierarchyService = undefined;
        if (languageId && location) {
            const callHierarchyService = await this.callHierarchyServiceProvider.get(languageId);
            if (callHierarchyService) {
                this.tree.callHierarchyService = callHierarchyService;
                const rootItem = await callHierarchyService.callHierarchy({
                    position: location.range.start,
                    textDocument: { uri: location.uri },
                    resolve: 1,
                    direction
                });
                if (rootItem) {
                    const rootNode = CallHierarchyTree.ItemNode.create(rootItem, direction, undefined);
                    const nextItems = rootItem.calls || [];
                    rootNode.children = nextItems.map(nextItem => CallHierarchyTree.ItemNode.create(nextItem, direction, rootNode));
                    rootNode.resolved = true;
                    this.tree.root = rootNode;
                }
            }
        }
    }

    protected doOpenNode(_node: TreeNode): void {
        // do nothing (in particular do not expand the node)
    }
}
