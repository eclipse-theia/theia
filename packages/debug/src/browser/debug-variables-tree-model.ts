/********************************************************************************
 * Copyright (C) 2021 ARM and others.
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

import { inject } from '@theia/core/shared/inversify';
import { ExpandableTreeNode, TreeModelImpl } from '@theia/core/lib/browser';
import { DebugVariablesSourceTree } from './debug-variables-source-tree';

export class DebugVariablesTreeModel extends TreeModelImpl {

    @inject(DebugVariablesSourceTree) protected readonly tree: DebugVariablesSourceTree;

    handleExpansion(node: Readonly<ExpandableTreeNode>): void {
        super.handleExpansion(node);
        if (this.tree.handleExpansion) {
            this.tree.handleExpansion(node);
        }
    }
}
