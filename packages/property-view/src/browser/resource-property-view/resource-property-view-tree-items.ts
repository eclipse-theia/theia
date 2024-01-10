// *****************************************************************************
// Copyright (C) 2020 EclipseSource and others.
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

import { CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode, TreeNode } from '@theia/core/lib/browser';

export const ROOT_ID = 'ResourcePropertiesTree';

export interface ResourcePropertiesRoot extends CompositeTreeNode {
    children: ResourcePropertiesCategoryNode[];
}
export namespace ResourcePropertiesRoot {
    export function is(node: unknown): node is ResourcePropertiesRoot {
        return CompositeTreeNode.is(node) && node.id === ROOT_ID;
    }
}

export interface ResourcePropertiesCategoryNode extends ExpandableTreeNode, SelectableTreeNode {
    name: string;
    icon?: string;
    children: ResourcePropertiesItemNode[];
    parent: ResourcePropertiesRoot;
    categoryId: string;
}
export namespace ResourcePropertiesCategoryNode {
    export function is(node: TreeNode | undefined): node is ResourcePropertiesCategoryNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && 'categoryId' in node;
    }
}

export interface ResourcePropertiesItemNode extends SelectableTreeNode {
    name: string;
    icon?: string;
    parent: ResourcePropertiesCategoryNode;
    property: string;
}
export namespace ResourcePropertiesItemNode {
    export function is(node: TreeNode | undefined): node is ResourcePropertiesItemNode {
        return !!node && SelectableTreeNode.is(node) && 'property' in node;
    }
}
