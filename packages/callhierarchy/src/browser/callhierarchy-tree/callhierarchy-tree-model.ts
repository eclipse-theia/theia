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
import { CallHierarchyServiceProvider } from '../callhierarchy-service';
import { Location } from 'vscode-languageserver-types';
import { CallDirection } from '@theia/languages/lib/browser/calls/calls-protocol.proposed';

@injectable()
export class CallHierarchyTreeModel extends TreeModelImpl {

    @inject(CallHierarchyTree) protected readonly tree: CallHierarchyTree;
    @inject(CallHierarchyServiceProvider) protected readonly callHierarchyServiceProvider: CallHierarchyServiceProvider;

    getTree(): CallHierarchyTree {
        return this.tree;
    }

    async initializeCallHierarchy(languageId: string | undefined, location: Location | undefined, direction: CallDirection): Promise<void> {
        this.tree.root = undefined;
        this.tree.callHierarchyService = undefined;
        if (languageId && location) {
            const callHierarchyService = await this.callHierarchyServiceProvider.get(languageId);
            if (callHierarchyService) {
                this.tree.callHierarchyService = callHierarchyService;
                const result = await callHierarchyService.getCalls({
                    position: location.range.start,
                    textDocument: { uri: location.uri },
                    direction
                });
                const { symbol, calls } = result;
                if (symbol) {
                    const rootNode = CallHierarchyTree.RootCallNode.create(symbol, direction, undefined);
                    rootNode.children = calls.map(c => CallHierarchyTree.CallNode.create(c, rootNode));
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
