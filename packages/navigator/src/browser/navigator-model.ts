/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { OpenerService, open, ITreeNode, ISelectableTreeNode } from "@theia/core/lib/browser";
import { FileNode, FileTreeModel, FileTreeServices } from "@theia/filesystem/lib/browser";
import { FileNavigatorTree } from "./navigator-tree";
import URI from '@theia/core/lib/common/uri';
import { IExpandableTreeNode } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class FileNavigatorServices extends FileTreeServices {
    @inject(OpenerService) readonly openerService: OpenerService;
}

@injectable()
export class FileNavigatorModel extends FileTreeModel {

    protected readonly openerService: OpenerService;

    constructor(
        @inject(FileNavigatorTree) protected readonly tree: FileNavigatorTree,
        @inject(FileNavigatorServices) protected readonly services: FileNavigatorServices,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        super(tree, services);
    }

    protected doOpenNode(node: ITreeNode): void {
        if (FileNode.is(node)) {
            open(this.openerService, node.uri);
        } else {
            super.doOpenNode(node);
        }
    }

    async tryGetNode(uri: URI): Promise<ITreeNode | undefined> {
        let node = super.getNode(uri.toString());
        if (node === undefined) {
            let currentUri = uri;
            if (currentUri === undefined) {
                return undefined;
            }
            const uris: string[] = [];
            let stop = currentUri.path.isRoot;
            while (!stop) {
                uris.unshift(currentUri.toString());
                // Traverse from bottom to up until we reach the root or visit an expanded node.
                stop = currentUri.path.isRoot || IExpandableTreeNode.isExpanded(this.getNode(currentUri.toString()));
                currentUri = currentUri.parent;
            }
            for (const uri of uris) {
                node = this.getNode(uri);
                if (IExpandableTreeNode.is(node)) {
                    const children = await this.tree.resolveChildren(node);
                    this.tree.setChildren(node, children);
                    if (IExpandableTreeNode.isCollapsed(node)) {
                        this.expandNode(node);
                    }
                }
            }
        }
        return node && node.id === uri.toString() ? node : undefined;
    }

    selectNode(node: ISelectableTreeNode | undefined, expandParents: boolean = false): void {
        if (node && expandParents) {
            let parent = node.parent;
            while (parent !== undefined) {
                if (IExpandableTreeNode.isCollapsed(parent)) {
                    this.expandNode(parent);
                }
                parent = parent.parent;
            }
        }
        super.selectNode(node);
    }

}
