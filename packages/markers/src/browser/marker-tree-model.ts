/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { MarkerNode } from './marker-tree';
import { TreeModelImpl, OpenerService, open, TreeNode, OpenerOptions } from '@theia/core/lib/browser';

@injectable()
export class MarkerTreeModel extends TreeModelImpl {

    @inject(OpenerService) protected readonly openerService: OpenerService;

    protected doOpenNode(node: TreeNode): void {
        if (MarkerNode.is(node)) {
            open(this.openerService, node.uri, this.getOpenerOptionsByMarker(node));
        } else {
            super.doOpenNode(node);
        }
    }

    protected getOpenerOptionsByMarker(node: MarkerNode): OpenerOptions | undefined {
        return undefined;
    }

    /**
     * Reveal the corresponding node at the marker.
     * @param node {TreeNode} the tree node.
     */
    revealNode(node: TreeNode): void {
        if (MarkerNode.is(node)) {
            open(this.openerService, node.uri, { ...this.getOpenerOptionsByMarker(node), mode: 'reveal' });
        }
    }
}
