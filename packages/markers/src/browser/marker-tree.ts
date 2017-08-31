/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { Tree, ICompositeTreeNode, ITreeNode, ISelectableTreeNode, IExpandableTreeNode } from "@theia/core/lib/browser";
import { MarkerManager, Marker } from './marker-manager';
import { UriSelection } from "@theia/filesystem/lib/common";
import URI from "@theia/core/lib/common/uri";

export const MarkerOptions = Symbol('MarkerOptions');
export interface MarkerOptions {
    readonly kind: string;
}

@injectable()
export class MarkerTree extends Tree {

    constructor(
        @inject(MarkerManager) protected readonly markerManager: MarkerManager,
        @inject(MarkerOptions) protected readonly markerOptions: MarkerOptions
    ) {
        super();

        markerManager.onDidChangeMarkers(() => this.refresh());

        this.root = <MarkerRootNode>{
            visible: false,
            id: 'theia-' + markerOptions.kind + '-marker-widget',
            name: 'MarkerTree',
            kind: markerOptions.kind,
            children: [],
            parent: undefined
        };
    }

    resolveChildren(parent: ICompositeTreeNode): Promise<ITreeNode[]> {
        if (MarkerRootNode.is(parent)) {
            return this.getMarkerInfoNodes((parent as MarkerRootNode));
        } else if (MarkerInfoNode.is(parent)) {
            return this.getMarkerNodes(parent);
        }
        return super.resolveChildren(parent);
    }

    getMarkerInfoNodes(parent: MarkerRootNode): Promise<MarkerInfoNode[]> {
        const uriNodes: MarkerInfoNode[] = [];
        if (this.root && MarkerRootNode.is(this.root)) {
            this.markerManager.forEachMarkerInfoByKind(this.root.kind, markerInfo => {
                const uri = new URI(markerInfo.uri);
                const id = 'markerInfo-' + markerInfo.uri;
                const cachedMarkerInfo = this.getNode(id);
                if (cachedMarkerInfo && MarkerInfoNode.is(cachedMarkerInfo)) {
                    cachedMarkerInfo.numberOfMarkers = markerInfo.counter;
                    uriNodes.push(cachedMarkerInfo);
                } else {
                    uriNodes.push({
                        children: [],
                        expanded: false,
                        uri,
                        id,
                        name: uri.displayName,
                        parent,
                        selected: false,
                        numberOfMarkers: markerInfo.counter
                    });
                }
            });
        }
        return Promise.resolve(uriNodes);
    }

    getMarkerNodes(parent: MarkerInfoNode): Promise<MarkerNode[]> {
        const markerNodes: MarkerNode[] = [];
        this.markerManager.forEachMarkerByUriAndKind(parent.uri.toString(), parent.parent.kind, marker => {
            const uri = new URI(marker.uri);
            const cachedMarkerNode = this.getNode(marker.id);
            if (MarkerNode.is(cachedMarkerNode)) {
                cachedMarkerNode.marker = marker;
                markerNodes.push(cachedMarkerNode);
            } else {
                markerNodes.push({
                    id: marker.id,
                    name: marker.kind,
                    parent,
                    selected: false,
                    uri,
                    marker
                });
            }
        });
        return Promise.resolve(markerNodes);
    }
}

export interface MarkerNode extends UriSelection, ISelectableTreeNode {
    marker: Marker<object>;
}
export namespace MarkerNode {
    export function is(node: ITreeNode | undefined): node is MarkerNode {
        return UriSelection.is(node) && ISelectableTreeNode.is(node) && 'marker' in node;
    }
}

export interface MarkerInfoNode extends UriSelection, ISelectableTreeNode, IExpandableTreeNode {
    parent: MarkerRootNode;
    numberOfMarkers: number;
}
export namespace MarkerInfoNode {
    export function is(node: ITreeNode | undefined): node is MarkerInfoNode {
        return IExpandableTreeNode.is(node) && UriSelection.is(node);
    }
}

export interface MarkerRootNode extends ICompositeTreeNode {
    kind: string;
}
export namespace MarkerRootNode {
    export function is(node: ITreeNode | undefined): node is MarkerRootNode {
        return ICompositeTreeNode.is(node) && 'kind' in node;
    }
}
