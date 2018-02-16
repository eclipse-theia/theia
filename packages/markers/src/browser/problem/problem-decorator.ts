/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Diagnostic } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { notEmpty } from '@theia/core/lib/common/objects';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { ITree, ITreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeNodeIterator } from '@theia/core/lib/browser/tree/tree-iterator';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';

@injectable()
export class ProblemDecorator implements TreeDecorator {

    readonly id = 'theia-problem-decorator';

    protected readonly emitter: Emitter<(tree: ITree) => Map<string, TreeDecoration.Data>>;

    constructor(@inject(ProblemManager) protected readonly problemManager: ProblemManager) {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations((tree: ITree) => this.collectDecorators(tree)));
    }

    get onDidChangeDecorations(): Event<(tree: ITree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(event: (tree: ITree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

    protected collectDecorators(tree: ITree): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined) {
            return result;
        }
        const processNode = (treeNode: ITreeNode | undefined) => {
            if (treeNode) {
                const { id } = treeNode;
                const marker = markers.get(id);
                if (marker) {
                    result.set(id, marker);
                }
            }
        };
        const markers = this.appendContainerMarkers(tree, this.collectMarkers(tree));
        processNode(tree.root);
        const itr = new TreeNodeIterator(tree.root);
        let node = itr.next();
        while (!node.done) {
            processNode(node.value);
            node = itr.next();
        }
        return new Map(Array.from(result.values()).map(m => [m.uri, this.toDecorator(m)] as [string, TreeDecoration.Data]));
    }

    protected appendContainerMarkers(tree: ITree, markers: Marker<Diagnostic>[]): Map<string, Marker<Diagnostic>> {
        const result: Map<string, Marker<Diagnostic>> = new Map();
        // We traverse up and assign the diagnostic to the container directory.
        // Note, instead of stopping at the WS root, we traverse up the driver root.
        // We will filter them later based on the expansion state of the tree.
        for (const [uri, marker] of new Map(markers.map(m => [new URI(m.uri), m] as [URI, Marker<Diagnostic>])).entries()) {
            const uriString = uri.toString();
            result.set(uriString, marker);
            let parentUri: URI | undefined = uri.parent;
            while (parentUri && !parentUri.path.isRoot) {
                const parentUriString = parentUri.toString();
                const existing = result.get(parentUriString);
                // Make sure the highest diagnostic severity (smaller number) will be propagated to the container directory.
                if (existing === undefined || this.compare(marker, existing) < 0) {
                    result.set(parentUriString, {
                        data: marker.data,
                        uri: parentUriString,
                        owner: marker.owner,
                        kind: marker.kind
                    });
                    parentUri = parentUri.parent;
                } else {
                    parentUri = undefined;
                }
            }
        }
        return result;
    }

    protected collectMarkers(tree: ITree): Marker<Diagnostic>[] {
        return Array.from(this.problemManager.getUris())
            .map(uri => new URI(uri))
            .map(uri => this.problemManager.findMarkers({ uri }))
            .map(markers => markers.sort(this.compare.bind(this)))
            .map(markers => markers.shift())
            .filter(notEmpty);
    }

    protected toDecorator(marker: Marker<Diagnostic>): TreeDecoration.Data {
        const position = TreeDecoration.IconOverlayPosition.BOTTOM_RIGHT;
        const icon = this.getOverlayIcon(marker);
        const color = this.getOverlayIconColor(marker);
        return {
            iconOverlay: {
                position,
                icon,
                color,
                background: {
                    shape: 'circle',
                    color: 'var(--theia-layout-color3)'
                }
            }
        };
    }

    protected getOverlayIcon(marker: Marker<Diagnostic>): string {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'times-circle';
            case 2: return 'exclamation-circle';
            case 3: return 'info-circle';
            default: return 'hand-o-up';
        }
    }

    protected getOverlayIconColor(marker: Marker<Diagnostic>): TreeDecoration.Color {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-error-color0)';
            case 2: return 'var(--theia-warn-color0)';
            case 3: return 'var(--theia-info-color0)';
            default: return 'var(--theia-success-color0)';
        }
    }

    protected compare(left: Marker<Diagnostic>, right: Marker<Diagnostic>): number {
        return ProblemDecorator.severityCompare(left, right);
    }

}

export namespace ProblemDecorator {

    // Highest severities (errors) come first, then the others. Undefined severities treated as the last ones.
    export const severityCompare = (left: Marker<Diagnostic>, right: Marker<Diagnostic>): number =>
        (left.data.severity || Number.MAX_SAFE_INTEGER) - (right.data.severity || Number.MAX_SAFE_INTEGER);

}
