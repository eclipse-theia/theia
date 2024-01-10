// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from 'inversify';
import { CompressionToggle, TreeCompressionService } from './tree-compression-service';
import { ExpandableTreeNode, TreeExpansionServiceImpl } from '../tree-expansion';

@injectable()
export class CompressedExpansionService extends TreeExpansionServiceImpl {
    @inject(CompressionToggle) protected readonly compressionToggle: CompressionToggle;
    @inject(TreeCompressionService) protected readonly compressionService: TreeCompressionService;

    override async expandNode(raw: ExpandableTreeNode): Promise<ExpandableTreeNode | undefined> {
        if (!this.compressionToggle.compress) { return super.expandNode(raw); }
        const participants = this.compressionService.getCompressionChain(raw);
        let expansionRoot;
        for (const node of participants ?? [raw]) {
            const next = await super.expandNode(node);
            expansionRoot = expansionRoot ?? next;
        }
        return expansionRoot;
    }

    override async collapseNode(raw: ExpandableTreeNode): Promise<boolean> {
        if (!this.compressionToggle.compress) { return super.collapseNode(raw); }
        const participants = this.compressionService.getCompressionChain(raw);
        let didCollapse = false;
        for (const participant of participants ?? [raw]) {
            didCollapse = await super.collapseNode(participant) || didCollapse;
        }
        return didCollapse;
    }
}
