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
        this.decorationsService.onDidChangeDecorations(() => this.fireDidChangeDecorations());
    }

    decorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorations(tree);
    }

    protected collectDecorations(tree: Tree): Map<string, TreeDecoration.Data> {
        const decorations = new Map<string, TreeDecoration.Data>();
        if (!tree.root) {
            return decorations;
        }
        this.decorationsByUri = new Map<string, TreeDecoration.Data>();
        this.parentDecorations = new Map<string, TreeDecoration.Data>();
        // Query the decorations service per visible URI so that decorations dropped
        // by event truncation (see plugin-ext maxEventSize) are fetched on demand.
        for (const node of new TopDownTreeIterator(tree.root)) {
            const rawUri = this.getUriForNode(node);
            if (!rawUri || this.decorationsByUri.has(rawUri)) {
                continue;
            }
            const uri = new URI(rawUri);
            const fetched = this.decorationsService.getDecoration(uri, false);
            if (fetched.length) {
                this.decorationsByUri.set(rawUri, this.toTheiaDecoration(fetched, false));
                this.propagateDecorationsByUri(uri, fetched);
            }
        }
        for (const node of new TopDownTreeIterator(tree.root)) {
            const rawUri = this.getUriForNode(node);
            if (!rawUri) {
                continue;
            }
            const ownDecoration = this.decorationsByUri.get(rawUri);
            const bubbledDecoration = this.parentDecorations.get(rawUri);
            const combined = this.mergeDecorations(ownDecoration, bubbledDecoration);
            if (combined) {
                decorations.set(node.id, combined);
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
