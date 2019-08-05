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

import { ProblemMarker } from '../../common/problem-marker';
import { ProblemManager } from './problem-manager';
import { MarkerNode, MarkerTree, MarkerOptions, MarkerInfoNode } from '../marker-tree';
import { MarkerTreeModel } from '../marker-tree-model';
import { injectable, inject } from 'inversify';
import { OpenerOptions, TreeNode } from '@theia/core/lib/browser';
import { Diagnostic } from 'vscode-languageserver-types';
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
export class ProblemTreeModel extends MarkerTreeModel {

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;

    protected getOpenerOptionsByMarker(node: MarkerNode): OpenerOptions | undefined {
        if (ProblemMarker.is(node.marker)) {
            return {
                selection: node.marker.data.range
            };
        }
        return undefined;
    }

    removeNode(node: TreeNode): void {
        if (MarkerInfoNode.is(node)) {
            this.problemManager.cleanAllMarkers(node.uri);
        }
        if (MarkerNode.is(node)) {
            const { uri } = node;
            const { owner } = node.marker;
            const diagnostics = this.problemManager.findMarkers({ uri, owner, dataFilter: data => node.marker.data !== data }).map(({ data }) => data);
            this.problemManager.setMarkers(uri, owner, diagnostics);
        }
    }
}
