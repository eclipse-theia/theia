/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Tree } from '@theia/core/lib/browser/tree/tree';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { DepthFirstTreeIterator } from '@theia/core/lib/browser';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { DecorationData, ScmDecorationsService } from './scm-decorations-service';
import URI from '@theia/core/lib/common/uri';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';

@injectable()
export class ScmNavigatorDecorator implements TreeDecorator {

    readonly id = 'theia-scm-decorator';
    private decorationsMap: Map<string, DecorationData> | undefined;

    @inject(ILogger) protected readonly logger: ILogger;

    @inject(ColorRegistry)
    protected readonly colors: ColorRegistry;

    constructor(@inject(ScmDecorationsService) protected readonly decorationsService: ScmDecorationsService) {
        this.decorationsService.onNavigatorDecorationsChanged(data => {
            this.decorationsMap = data;
            this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree));
        });
    }

    protected collectDecorators(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined || !this.decorationsMap) {
            return result;
        }
        const markers = this.appendContainerChanges(this.decorationsMap);
        for (const treeNode of new DepthFirstTreeIterator(tree.root)) {
            const uri = FileStatNode.getUri(treeNode);
            if (uri) {
                const marker = markers.get(uri);
                if (marker) {
                    result.set(treeNode.id, marker);
                }
            }
        }
        return new Map(Array.from(result.entries()).map(m => [m[0], this.toDecorator(m[1])] as [string, TreeDecoration.Data]));
    }

    protected toDecorator(change: DecorationData): TreeDecoration.Data {
        const colorVariable = change.color && this.colors.toCssVariableName(change.color.id);
        return {
            tailDecorations: [
                {
                    data: change.letter ? change.letter : '',
                    fontData: {
                        color: colorVariable && `var(${colorVariable})`
                    },
                    tooltip: change.title ? change.title : ''
                }
            ]
        };
    }

    protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        if (this.decorationsMap) {
            return this.collectDecorators(tree);
        } else {
            return new Map();
        }
    }

    protected appendContainerChanges(decorationsMap: Map<string, DecorationData>): Map<string, DecorationData> {
        const result: Map<string, DecorationData> = new Map();
        for (const [uri, data] of decorationsMap.entries()) {
            const uriString = uri.toString();
            result.set(uriString, data);
            let parentUri: URI | undefined = new URI(uri).parent;
            while (parentUri && !parentUri.path.isRoot) {
                const parentUriString = parentUri.toString();
                const existing = result.get(parentUriString);
                if (existing === undefined) {
                    result.set(parentUriString, data);
                    parentUri = parentUri.parent;
                } else {
                    parentUri = undefined;
                }
            }
        }
        return result;
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

}
