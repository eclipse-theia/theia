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
import { TreeNode, TreeCompressionService, CompressibleTreeNode, TreeImpl } from '@theia/core/lib/browser';

@injectable()
export abstract class CompressibleTree extends TreeImpl {

    @inject(TreeCompressionService)
    protected compressionService: TreeCompressionService;

    protected abstract isCompressionEnabled: () => boolean;

    protected abstract shouldCompressNode(node: TreeNode): boolean;

    protected removeNode(node: TreeNode | undefined): void {
        super.removeNode(node);
        if (node && this.isCompressionEnabled()) {
            this.compressionService.removeItem(node);
        }
    }

    protected addNode(node: TreeNode | undefined): void {
        if (CompressibleTreeNode.is(node)) {
            if (this.isCompressionEnabled() && this.shouldCompressNode(node)) {
                const uncompressedParent = CompressibleTreeNode.getUncompressedParent(node);
                if (uncompressedParent) {
                    node.compressed = true;
                    this.compressionService.addItem(uncompressedParent, node);
                }
            } else {
                node.compressed = false;
            }
        }
        super.addNode(node);
    }
}
