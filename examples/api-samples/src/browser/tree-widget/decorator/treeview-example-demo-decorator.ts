// *****************************************************************************
// Copyright (C) 2025 Stefan Winkler and others.
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

import { Emitter, MaybePromise } from '@theia/core';
import { DepthFirstTreeIterator, Tree, TreeDecorator } from '@theia/core/lib/browser';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';
import { Event } from '@theia/core/lib/common';
import { injectable } from '@theia/core/shared/inversify';
import { ExampleTreeLeaf } from '../treeview-example-model';

@injectable()
export class TreeviewExampleDemoDecorator implements TreeDecorator {
    id = 'TreeviewExampleDecorator';

    protected readonly emitter = new Emitter<(tree: Tree) => Map<string, WidgetDecoration.Data>>();

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, WidgetDecoration.Data>> {
        return this.emitter.event;
    }

    decorations(tree: Tree): MaybePromise<Map<string, WidgetDecoration.Data>> {
        const result = new Map();

        if (tree.root === undefined) {
            return result;
        }
        for (const treeNode of new DepthFirstTreeIterator(tree.root)) {
            if (ExampleTreeLeaf.is(treeNode)) {
                const amount = treeNode.data.quantity || 0;
                if (amount > 4) {
                    result.set(treeNode.id, <WidgetDecoration.Data>{
                        iconOverlay: {
                            position: WidgetDecoration.IconOverlayPosition.BOTTOM_RIGHT,
                            iconClass: ['fa', 'fa-check-circle'],
                            color: 'green'
                        }
                    });
                } else {
                    result.set(treeNode.id, <WidgetDecoration.Data>{
                        backgroundColor: 'red',
                        captionSuffixes: [{ data: 'Warning: low stock', fontData: { style: 'italic' } }]
                    });
                }
            }
        }
        return result;
    }
}
