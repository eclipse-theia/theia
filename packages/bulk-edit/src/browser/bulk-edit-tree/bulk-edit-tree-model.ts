/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { BulkEditNode, BulkEditTree } from './bulk-edit-tree';
import { TreeModelImpl, OpenerService, open, TreeNode } from '@theia/core/lib/browser';

@injectable()
export class BulkEditTreeModel extends TreeModelImpl {
    @inject(BulkEditTree) protected readonly tree: BulkEditTree;
    @inject(OpenerService) protected readonly openerService: OpenerService;

    protected doOpenNode(node: TreeNode): void {
        if (BulkEditNode.is(node)) {
            open(this.openerService, node.uri, undefined);
        } else {
            super.doOpenNode(node);
        }
    }

    revealNode(node: TreeNode): void {
        this.doOpenNode(node);
    }

    async initModel(workspaceEdit: monaco.languages.WorkspaceEdit, fileContents: Map<string, string>): Promise<void> {
        this.tree.initTree(workspaceEdit, fileContents);
    }
}
