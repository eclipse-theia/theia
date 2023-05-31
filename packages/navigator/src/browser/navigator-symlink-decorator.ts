// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, nls } from '@theia/core';
import { TreeDecorator, Tree, TreeDecoration, DepthFirstTreeIterator } from '@theia/core/lib/browser';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { DecorationsService } from '@theia/core/lib/browser/decorations-service';

@injectable()
export class NavigatorSymlinkDecorator implements TreeDecorator {

    readonly id = 'theia-navigator-symlink-decorator';

    @inject(DecorationsService)
    protected readonly decorationsService: DecorationsService;

    @postConstruct()
    protected init(): void {
        this.decorationsService.onDidChangeDecorations(() => {
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorator(tree));
        });
    }

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorator(tree);
    }

    protected collectDecorator(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map<string, TreeDecoration.Data>();
        if (tree.root === undefined) {
            return result;
        }
        for (const node of new DepthFirstTreeIterator(tree.root)) {
            if (FileStatNode.is(node) && node.fileStat.isSymbolicLink) {
                const decorations: TreeDecoration.Data = {
                    tailDecorations: [{ data: '⤷', tooltip: nls.localizeByDefault('Symbolic Link') }]
                };
                result.set(node.id, decorations);
            }
        }
        return result;
    }

    protected readonly onDidChangeDecorationsEmitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.onDidChangeDecorationsEmitter.event;
    }

    fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.onDidChangeDecorationsEmitter.fire(event);
    }

}
