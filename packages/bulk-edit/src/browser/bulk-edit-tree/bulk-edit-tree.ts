/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { TreeNode, CompositeTreeNode, SelectableTreeNode, ExpandableTreeNode, TreeImpl } from '@theia/core/lib/browser';
import { UriSelection } from '@theia/core/lib/common/selection';
import { BulkEditNodeSelection } from './bulk-edit-node-selection';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceFileEdit, WorkspaceTextEdit } from '@theia/monaco/lib/browser/monaco-workspace';

@injectable()
export class BulkEditTree extends TreeImpl {
    public async initTree(workspaceEdit: monaco.languages.WorkspaceEdit, fileContents: Map<string, string>): Promise<void> {
        this.root = <CompositeTreeNode>{
            visible: false,
            id: 'theia-bulk-edit-tree-widget',
            name: 'BulkEditTree',
            children: this.getChildren(workspaceEdit, fileContents),
            parent: undefined
        };
    }

    private getChildren(workspaceEdit: monaco.languages.WorkspaceEdit, fileContentsMap: Map<string, string>): BulkEditInfoNode[] {
        let bulkEditInfos: BulkEditInfoNode[] = [];
        if (workspaceEdit.edits) {
            bulkEditInfos = workspaceEdit.edits
                .map(edit => this.getResourcePath(edit))
                .filter((path, index, arr) => path && arr.indexOf(path) === index)
                .map((path: string) => this.createBulkEditInfo(path, new URI(path), fileContentsMap.get(path)))
                .filter(Boolean);

            if (bulkEditInfos.length > 0) {
                bulkEditInfos.forEach(editInfo => {
                    editInfo.children = workspaceEdit.edits.filter(edit => ((('resource' in edit) && edit?.resource?.path === editInfo.id)) ||
                        (('newUri' in edit) && edit?.newUri?.path === editInfo.id))
                        .map((edit, index) => this.createBulkEditNode(edit, index, editInfo));
                });
            }
        }
        return bulkEditInfos;
    }

    private createBulkEditNode(bulkEdit: monaco.languages.WorkspaceTextEdit | monaco.languages.WorkspaceFileEdit, index: number, parent: BulkEditInfoNode): BulkEditNode {
        const id = parent.id + '_' + index;
        const existing = this.getNode(id);
        if (BulkEditNode.is(existing)) {
            existing.bulkEdit = bulkEdit;
            return existing;
        }
        return {
            id,
            name: 'bulkEdit',
            parent,
            selected: false,
            uri: parent.uri,
            bulkEdit
        };
    }

    private createBulkEditInfo(id: string, uri: URI, fileContents: string | undefined): BulkEditInfoNode {
        return {
            id,
            uri,
            expanded: true,
            selected: false,
            parent: this.root as BulkEditInfoNode,
            fileContents,
            children: []
        };
    }

    private getResourcePath(edit: monaco.languages.WorkspaceTextEdit | monaco.languages.WorkspaceFileEdit): string | undefined {
        return WorkspaceTextEdit.is(edit) ? edit.resource.path : WorkspaceFileEdit.is(edit) && edit.newUri ? edit.newUri.path : undefined;
    }
}

export interface BulkEditNode extends UriSelection, SelectableTreeNode {
    parent: CompositeTreeNode;
    bulkEdit: monaco.languages.WorkspaceTextEdit | monaco.languages.WorkspaceFileEdit;
}
export namespace BulkEditNode {
    export function is(node: TreeNode | undefined): node is BulkEditNode {
        return UriSelection.is(node) && SelectableTreeNode.is(node) && BulkEditNodeSelection.is(node);
    }
}

export interface BulkEditInfoNode extends UriSelection, SelectableTreeNode, ExpandableTreeNode {
    parent: CompositeTreeNode;
    fileContents?: string;
}
export namespace BulkEditInfoNode {
    export function is(node: Object | undefined): node is BulkEditInfoNode {
        return ExpandableTreeNode.is(node) && UriSelection.is(node) && 'fileContents' in node;
    }
}
