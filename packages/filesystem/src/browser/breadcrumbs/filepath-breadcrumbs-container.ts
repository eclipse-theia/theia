// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { Container, interfaces, injectable, inject } from '@theia/core/shared/inversify';
import { TreeProps, ContextMenuRenderer, TreeNode, open, NodeProps, defaultTreeProps } from '@theia/core/lib/browser';
import { FileTreeModel, FileStatNode, createFileTreeContainer, FileTreeWidget } from '../file-tree';

const BREADCRUMBS_FILETREE_CLASS = 'theia-FilepathBreadcrumbFileTree';

export function createFileTreeBreadcrumbsContainer(parent: interfaces.Container): Container {
    const child = createFileTreeContainer(parent);
    child.unbind(FileTreeWidget);
    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, virtualized: false });
    child.bind(BreadcrumbsFileTreeWidget).toSelf();
    return child;
}

export function createFileTreeBreadcrumbsWidget(parent: interfaces.Container): BreadcrumbsFileTreeWidget {
    return createFileTreeBreadcrumbsContainer(parent).get(BreadcrumbsFileTreeWidget);
}

@injectable()
export class BreadcrumbsFileTreeWidget extends FileTreeWidget {

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(FileTreeModel) override readonly model: FileTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(BREADCRUMBS_FILETREE_CLASS);
    }

    protected override createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
            draggable: false
        };
    }

    protected override tapNode(node?: TreeNode): void {
        if (FileStatNode.is(node) && !node.fileStat.isDirectory) {
            open(this.openerService, node.uri, { preview: true });
        } else {
            super.tapNode(node);
        }
    }
}
