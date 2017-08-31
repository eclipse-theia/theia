/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
import { ProblemMarker } from './problem-marker';
import { MarkerNode, MarkerTree } from '../marker-tree';
import { MarkerTreeModel, MarkerTreeServices } from '../marker-tree-model';
import { injectable, inject } from "inversify";
import { OpenerService, OpenerOptions } from '@theia/core/lib/browser';

@injectable()
export class ProblemTreeModel extends MarkerTreeModel {

    protected readonly openerService: OpenerService;

    constructor(
        @inject(MarkerTree) protected readonly tree: MarkerTree,
        @inject(MarkerTreeServices) readonly services: MarkerTreeServices,
    ) {
        super(tree, services);
    }

    protected getOpenerOptionsByMarker(node: MarkerNode): OpenerOptions | undefined {
        if (ProblemMarker.is(node.marker)) {
            return {
                selection: node.marker.data.range
            };
        }
        return undefined;
    }
}
