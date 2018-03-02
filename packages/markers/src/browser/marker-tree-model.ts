/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MarkerNode } from './marker-tree';
import { TreeModelImpl, OpenerService, open, TreeNode, OpenerOptions } from "@theia/core/lib/browser";

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
}
