/********************************************************************************
 * Copyright (C) 2018 RedHat and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Tree } from '@theia/core/lib/browser/tree/tree';
import { DepthFirstTreeIterator } from '@theia/core/lib/browser/tree/tree-iterator';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { MonacoOutlineSymbolInformationNode } from './monaco-outline-contribution';

@injectable()
export class MonacoOutlineDecorator implements TreeDecorator {

    readonly id = 'theia-monaco-outline-decorator';

    protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorations(tree);
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    protected collectDecorations(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined) {
            return result;
        }

        for (const treeNode of new DepthFirstTreeIterator(tree.root)) {
            if (MonacoOutlineSymbolInformationNode.is(treeNode) && treeNode.detail) {
                result.set(treeNode.id, this.toDecoration(treeNode));
            }
        }

        return result;
    }

    protected toDecoration(node: MonacoOutlineSymbolInformationNode): TreeDecoration.Data {
        const captionSuffixes: TreeDecoration.CaptionAffix[] = [{
            data: (node.detail || ''),
            fontData: {
                color: 'var(--theia-descriptionForeground)',
            }
        }];

        return {
            captionSuffixes
        };
    }
}
