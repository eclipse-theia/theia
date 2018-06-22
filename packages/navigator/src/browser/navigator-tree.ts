/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { FileTree } from '@theia/filesystem/lib/browser';
import { TreeNode, CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { FileNavigatorFilter } from './navigator-filter';

@injectable()
export class FileNavigatorTree extends FileTree {

    @inject(FileNavigatorFilter) protected readonly filter: FileNavigatorFilter;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.filter.onFilterChanged(() => this.refresh()));
    }

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        return this.filter.filter(super.resolveChildren(parent));
    }

}
