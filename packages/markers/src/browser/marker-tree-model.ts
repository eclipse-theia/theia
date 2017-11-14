/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MarkerTree, MarkerNode } from './marker-tree';
import { TreeModel, TreeServices, OpenerService, open, ITreeNode, OpenerOptions } from "@theia/core/lib/browser";

@injectable()
export class MarkerTreeServices extends TreeServices {
    @inject(OpenerService) readonly openerService: OpenerService;
}

@injectable()
export class MarkerTreeModel<T extends object> extends TreeModel {

    protected readonly openerService: OpenerService;

    constructor(
        @inject(MarkerTree) protected readonly tree: MarkerTree<T>,
        @inject(MarkerTreeServices) readonly services: MarkerTreeServices
    ) {
        super(tree, services);
    }

    protected doOpenNode(node: ITreeNode): void {
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
