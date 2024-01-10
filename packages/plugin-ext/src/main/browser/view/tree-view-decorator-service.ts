/********************************************************************************
 * Copyright (C) 2021 1C-Soft LLC and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, interfaces, named } from '@theia/core/shared/inversify';
import { AbstractTreeDecoratorService, TreeDecorator } from '@theia/core/lib/browser/tree/tree-decorator';
import { bindContributionProvider, ContributionProvider, isObject } from '@theia/core';
import { TreeNode } from '@theia/core/lib/browser';
import { TreeItem } from '@theia/plugin';
import URI from '@theia/core/lib/common/uri';
import { FileTreeDecoratorAdapter } from '@theia/filesystem/lib/browser';

export const TreeViewDecorator = Symbol('TreeViewDecorator');

@injectable()
export class TreeViewDecoratorAdapter extends FileTreeDecoratorAdapter {
    protected override getUriForNode(node: TreeNode | TreeItem): string | undefined {
        if (this.isTreeItem(node)) {
            return new URI(node.resourceUri).toString();
        }
    }

    protected isTreeItem(node: unknown): node is TreeItem {
        return isObject<TreeItem>(node) && !!node.resourceUri;
    }
}

@injectable()
export class TreeViewDecoratorService extends AbstractTreeDecoratorService {
    constructor(@inject(ContributionProvider) @named(TreeViewDecorator) contributions: ContributionProvider<TreeDecorator>) {
        super(contributions.getContributions());
    }
}

export function bindTreeViewDecoratorUtilities(bind: interfaces.Bind): void {
    bind(TreeViewDecoratorAdapter).toSelf().inSingletonScope();
    bindContributionProvider(bind, TreeViewDecorator);
    bind(TreeViewDecorator).toService(TreeViewDecoratorAdapter);
}
