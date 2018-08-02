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

import { injectable } from 'inversify';
import { TreeNode } from './tree';

@injectable()
export class TreeNavigationService {

    protected index: number = -1;
    protected nodes: TreeNode[] = [];

    get next(): TreeNode | undefined {
        return this.nodes[this.index + 1];
    }

    get prev(): TreeNode | undefined {
        return this.nodes[this.index - 1];
    }

    advance(): TreeNode | undefined {
        const node = this.next;
        if (node) {
            this.index = this.index + 1;
            return node;
        }
        return undefined;
    }

    retreat(): TreeNode | undefined {
        const node = this.prev;
        if (node) {
            this.index = this.index - 1;
            return node;
        }
        return undefined;
    }

    push(node: TreeNode): void {
        this.nodes = this.nodes.slice(0, this.index + 1);
        this.nodes.push(node);
        this.index = this.index + 1;
    }

}
