/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
import { Emitter, Event } from '@theia/core';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { DepthFirstTreeIterator, Tree, TreeDecorator, TreeDecoration } from '@theia/core/lib/browser';

@injectable()
export class NavigatorSymlinkDecorator implements TreeDecorator {

    readonly id = 'theia-navigator-symlink-decorator';

    constructor(@inject(DecorationsService) protected readonly decorationsService: DecorationsService) {
        this.decorationsService.onDidChangeDecorations(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });
    }

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorators(tree);
    }

    protected collectDecorators(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined) {
            return result;
        }
        for (const treeNode of new DepthFirstTreeIterator(tree.root)) {
            if (FileStatNode.is(treeNode) && treeNode.fileStat.isSymbolicLink) {
                result.set(treeNode.id, this.createDecorator());
            }
        }
        return new Map(Array.from(result.entries()).map(m => [m[0], m[1]] as [string, TreeDecoration.Data]));
    }

    protected createDecorator(): TreeDecoration.Data {
        return {
            tailDecorations: [{ data: '\u2937' }]
        };
    }

    protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();
    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }
    fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

}
