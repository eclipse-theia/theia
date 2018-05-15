/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { TreeImpl, CompositeTreeNode, TreeNode, SelectableTreeNode, ExpandableTreeNode } from "@theia/core/lib/browser";
import { MarkerManager } from './marker-manager';
import { Marker } from '../common/marker';
import { UriSelection } from "@theia/core/lib/common/selection";
import URI from "@theia/core/lib/common/uri";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";

export const MarkerOptions = Symbol('MarkerOptions');
export interface MarkerOptions {
    readonly kind: string;
}

@injectable()
export abstract class MarkerTree<T extends object> extends TreeImpl {

    constructor(
        protected readonly markerManager: MarkerManager<T>,
        protected readonly markerOptions: MarkerOptions,
        protected readonly labelProvider: LabelProvider
    ) {
        super();

        this.toDispose.push(markerManager.onDidChangeMarkers(() => this.refresh()));

        this.root = <MarkerRootNode>{
            visible: false,
            id: 'theia-' + markerOptions.kind + '-marker-widget',
            name: 'MarkerTree',
            kind: markerOptions.kind,
            children: [],
            parent: undefined
        };
    }

    resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (MarkerRootNode.is(parent)) {
            return this.getMarkerInfoNodes((parent as MarkerRootNode));
        } else if (MarkerInfoNode.is(parent)) {
            return this.getMarkerNodes(parent);
        }
        return super.resolveChildren(parent);
    }

    async getMarkerInfoNodes(parent: MarkerRootNode): Promise<MarkerInfoNode[]> {
        const uriNodes: MarkerInfoNode[] = [];
        if (this.root && MarkerRootNode.is(this.root)) {
            for (const uriString of this.markerManager.getUris()) {
                const id = 'markerInfo-' + uriString;
                const uri = new URI(uriString);
                const label = await this.labelProvider.getName(uri);
                const icon = await this.labelProvider.getIcon(uri);
                const description = await this.labelProvider.getLongName(uri.parent);
                const numberOfMarkers = this.markerManager.findMarkers({ uri }).length;
                if (numberOfMarkers > 0) {
                    const cachedMarkerInfo = this.getNode(id);
                    if (cachedMarkerInfo && MarkerInfoNode.is(cachedMarkerInfo)) {
                        cachedMarkerInfo.numberOfMarkers = numberOfMarkers;
                        uriNodes.push(cachedMarkerInfo);
                    } else {
                        uriNodes.push({
                            children: [],
                            expanded: true,
                            uri,
                            id,
                            name: label,
                            icon,
                            description,
                            parent,
                            selected: false,
                            numberOfMarkers
                        });
                    }
                }
            }
        }
        return Promise.resolve(uriNodes);
    }

    getMarkerNodes(parent: MarkerInfoNode): Promise<MarkerNode[]> {
        const markerNodes: MarkerNode[] = [];
        const markers = this.markerManager.findMarkers({ uri: parent.uri });
        for (let i = 0; i < markers.length; i++) {
            const marker = markers[i];
            const uri = new URI(marker.uri);
            const id = uri.toString() + "_" + i;
            const cachedMarkerNode = this.getNode(id);
            if (MarkerNode.is(cachedMarkerNode)) {
                cachedMarkerNode.marker = marker;
                markerNodes.push(cachedMarkerNode);
            } else {
                markerNodes.push({
                    id,
                    name: 'marker',
                    parent,
                    selected: false,
                    uri,
                    marker
                });
            }
        }
        return Promise.resolve(markerNodes);
    }
}

export interface MarkerNode extends UriSelection, SelectableTreeNode {
    marker: Marker<object>;
}
export namespace MarkerNode {
    export function is(node: TreeNode | undefined): node is MarkerNode {
        return UriSelection.is(node) && SelectableTreeNode.is(node) && 'marker' in node;
    }
}

export interface MarkerInfoNode extends UriSelection, SelectableTreeNode, ExpandableTreeNode {
    parent: MarkerRootNode;
    numberOfMarkers: number;
}
export namespace MarkerInfoNode {
    export function is(node: TreeNode | undefined): node is MarkerInfoNode {
        return ExpandableTreeNode.is(node) && UriSelection.is(node);
    }
}

export interface MarkerRootNode extends CompositeTreeNode {
    kind: string;
}
export namespace MarkerRootNode {
    export function is(node: TreeNode | undefined): node is MarkerRootNode {
        return CompositeTreeNode.is(node) && 'kind' in node;
    }
}
