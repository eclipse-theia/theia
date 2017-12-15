/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ProblemMarker } from '../../common/problem-marker';
import { ProblemManager } from './problem-manager';
import { MarkerNode, MarkerTree, MarkerOptions } from '../marker-tree';
import { MarkerTreeModel, MarkerTreeServices } from '../marker-tree-model';
import { injectable, inject } from "inversify";
import { OpenerService, OpenerOptions } from '@theia/core/lib/browser';
import { Diagnostic } from "vscode-languageserver-types";
import { LabelProvider } from '@theia/core/lib/browser/label-provider';

@injectable()
export class ProblemTree extends MarkerTree<Diagnostic> {
    constructor(
        @inject(ProblemManager) protected readonly problemManager: ProblemManager,
        @inject(MarkerOptions) protected readonly markerOptions: MarkerOptions,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider) {
        super(problemManager, markerOptions, labelProvider);
    }
}

@injectable()
export class ProblemTreeModel extends MarkerTreeModel<Diagnostic> {

    protected readonly openerService: OpenerService;

    constructor(
        @inject(ProblemTree) protected readonly tree: ProblemTree,
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
