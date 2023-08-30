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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter, nls } from '@theia/core/lib/common';
import { Decoration, DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { TreeNode, TreeDecoration, TreeDecorator, Tree, TopDownTreeIterator } from '@theia/core/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { FileStatNode } from './file-tree';

@injectable()
export class FileTreeDecoratorAdapter implements TreeDecorator {
    readonly id = 'decorations-service-tree-decorator-adapter';
    protected readonly bubbleTooltip = nls.localizeByDefault('Contains emphasized items');
    @inject(DecorationsService) protected readonly decorationsService: DecorationsService;
    @inject(ColorRegistry) protected readonly colorRegistry: ColorRegistry;

    protected readonly onDidChangeDecorationsEmitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();
    protected decorationsByUri = new Map<string, TreeDecoration.Data>();
    protected parentDecorations = new Map<string, TreeDecoration.Data>();

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.onDidChangeDecorationsEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        this.decorationsService.onDidChangeDecorations(newDecorations => {
            this.updateDecorations(this.decorationsByUri.keys(), newDecorations.keys());
            this.fireDidChangeDecorations();
        });
    }

    decorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorations(tree);
    }

    protected collectDecorations(tree: Tree): Map<string, TreeDecoration.Data> {
        const decorations = new Map();
        if (tree.root) {
            for (const node of new TopDownTreeIterator(tree.root)) {
                const uri = this.getUriForNode(node);
                if (uri) {
                    const stringified = uri.toString();
                    const ownDecoration = this.decorationsByUri.get(stringified);
                    const bubbledDecoration = this.parentDecorations.get(stringified);
                    const combined = this.mergeDecorations(ownDecoration, bubbledDecoration);
                    if (combined) {
                        decorations.set(node.id, combined);
                    }
                }
            }
        }
        return decorations;
    }

    protected mergeDecorations(ownDecoration?: TreeDecoration.Data, bubbledDecoration?: TreeDecoration.Data): TreeDecoration.Data | undefined {
        if (!ownDecoration) {
            return bubbledDecoration;
        } else if (!bubbledDecoration) {
            return ownDecoration;
        } else {
            const tailDecorations = (bubbledDecoration.tailDecorations ?? []).concat(ownDecoration.tailDecorations ?? []);
            return {
                ...bubbledDecoration,
                tailDecorations
            };
        }
    }

    protected updateDecorations(oldKeys: IterableIterator<string>, newKeys: IterableIterator<string>): void {
        this.parentDecorations.clear();
        const newDecorations = new Map<string, TreeDecoration.Data>();
        const handleUri = (rawUri: string) => {
            if (!newDecorations.has(rawUri)) {
                const uri = new URI(rawUri);
                const decorations = this.decorationsService.getDecoration(uri, false);
                if (decorations.length) {
                    newDecorations.set(rawUri, this.toTheiaDecoration(decorations, false));
                    this.propagateDecorationsByUri(uri, decorations);
                }
            }
        };
        for (const rawUri of oldKeys) {
            handleUri(rawUri);
        }
        for (const rawUri of newKeys) {
            handleUri(rawUri);
        }
        this.decorationsByUri = newDecorations;
    }

    protected toTheiaDecoration(decorations: Decoration[], bubble?: boolean): TreeDecoration.Data {
        const color = decorations[0].colorId ? `var(${this.colorRegistry.toCssVariableName(decorations[0].colorId)})` : undefined;
        const fontData = color ? { color } : undefined;
        return {
            priority: decorations[0].weight,
            fontData,
            tailDecorations: decorations.map(decoration => this.toTailDecoration(decoration, fontData, bubble))
        };
    }

    protected toTailDecoration(decoration: Decoration, fontData?: TreeDecoration.FontData, bubble?: boolean): TreeDecoration.TailDecoration.AnyConcrete {
        if (bubble) {
            return { icon: 'circle', fontData, tooltip: this.bubbleTooltip };
        }
        return { data: decoration.letter ?? '', fontData, tooltip: decoration.tooltip };
    }

    protected propagateDecorationsByUri(child: URI, decorations: Decoration[]): void {
        const highestPriorityBubblingDecoration = decorations.find(decoration => decoration.bubble);
        if (highestPriorityBubblingDecoration) {
            const bubbleDecoration = this.toTheiaDecoration([highestPriorityBubblingDecoration], true);
            let parent = child.parent;
            let handledRoot = false;
            while (!handledRoot) {
                handledRoot = parent.path.isRoot;
                const parentString = parent.toString();
                const existingDecoration = this.parentDecorations.get(parentString);
                if (!existingDecoration || this.compareWeight(bubbleDecoration, existingDecoration) < 0) {
                    this.parentDecorations.set(parentString, bubbleDecoration);
                } else {
                    break;
                }
                parent = parent.parent;
            }
        }
    }

    /**
     *  Sort higher priorities earlier. I.e. positive number means right higher than left.
     */
    protected compareWeight(left: Decoration, right: Decoration): number {
        return (right.weight ?? 0) - (left.weight ?? 0);
    }

    protected getUriForNode(node: TreeNode): string | undefined {
        return FileStatNode.getUri(node);
    }

    fireDidChangeDecorations(): void {
        this.onDidChangeDecorationsEmitter.fire(tree => this.collectDecorations(tree));
    }
}
